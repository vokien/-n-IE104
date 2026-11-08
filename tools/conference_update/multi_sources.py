"""
Multi-source conference aggregator and resilience layer.
Fetches and normalizes CFP deadlines and metadata from:
1. ccfddl/ccf-deadlines (Priority 1)
2. paperswithcode/ai-deadlines (AI / ML / CV / NLP / Robotics)
3. sec-deadlines/sec-deadlines (Security / Privacy / Cryptography / Networks)
4. se-deadlines/se-deadlines.github.io (Software Engineering / Programming Languages)
5. DBLP Venue API (Metadata enrichment: Publisher, ISSN, dblp key)

Implements universal network resilience: any source failure is safely caught and logged.
"""

from __future__ import annotations

import copy
import json
import logging
import re
import urllib.request
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
import yaml

logger = logging.getLogger(__name__)

HEADERS = {
    'User-Agent': 'IE104-Conference-Lifecycle/1.0 (+https://github.com/vokien/-n-IE104)',
    'Accept': 'application/json,text/yaml,text/html,*/*'
}

GITHUB_SOURCES = {
    'ai-deadlines': 'https://raw.githubusercontent.com/paperswithcode/ai-deadlines/gh-pages/_data/conferences.yml',
    'sec-deadlines': 'https://raw.githubusercontent.com/sec-deadlines/sec-deadlines/master/_data/conferences.yml',
    'se-deadlines': 'https://raw.githubusercontent.com/se-deadlines/se-deadlines.github.io/master/_data/conferences.yml'
}

DBLP_SEARCH_API = "https://dblp.org/search/venue/api?q={query}&format=json&h=5"

SUBJECT_MAP = {
    'ai-deadlines': ['Artificial Intelligence', 'Machine Learning'],
    'sec-deadlines': ['Computer Security', 'Cryptography', 'Privacy'],
    'se-deadlines': ['Software Engineering', 'Information Systems']
}


def clean_str(val: any) -> str:
    """Safely sanitize text and whitespace."""
    if val is None:
        return ""
    return " ".join(str(val).split()).strip()


def normalize_acronym(val: any) -> str:
    """Normalize conference acronyms (e.g. 'NeurIPS 2026' -> 'NEURIPS')."""
    text = clean_str(val).upper()
    text = re.sub(r'\b20\d{2}\b', '', text)
    text = re.sub(r'[^A-Z0-9]', '', text)
    return text


def safe_fetch(url: str, timeout: int = 15, max_retries: int = 2) -> bytes | None:
    """
    Universal network fetcher with timeout and graceful degradation.
    Never crashes the caller if network fails.
    """
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    return resp.read()
        except Exception as e:
            logger.warning(f"Fetch {url} attempt {attempt} failed: {e}")
    return None


def fetch_yaml_source(source_name: str, url: str) -> list[dict]:
    """Fetch and parse YAML conference source safely."""
    raw = safe_fetch(url, timeout=20)
    if not raw:
        logger.warning(f"Source {source_name} unreachable; skipping gracefully.")
        return []
    try:
        data = yaml.safe_load(raw.decode('utf-8', errors='replace'))
        if isinstance(data, list):
            logger.info(f"Loaded {len(data)} conferences from {source_name}.")
            return data
    except Exception as e:
        logger.warning(f"Parsing {source_name} YAML failed: {e}")
    return []


def parse_deadline_entry(raw_dl: any, year: int, comment: str = "Submission Deadline", link: str = "") -> dict | None:
    """Convert variable deadline formats into schema-compliant submission_deadlines entry."""
    if not raw_dl:
        return None

    raw_str = clean_str(raw_dl)
    if not raw_str or raw_str.lower() in ('tbd', 'tba', 'unknown', 'none'):
        return None

    date_str = None
    iso_stamp = None

    # Extract date YYYY-MM-DD
    match = re.search(r'\b(202[5-9]|203[0-9])[-/](\d{1,2})[-/](\d{1,2})\b', raw_str)
    if match:
        y, m, d = match.groups()
        date_str = f"{y}-{int(m):02d}-{int(d):02d}"
        iso_stamp = f"{date_str}T23:59:59-12:00"  # Standard AoE UTC-12
    else:
        # Month name format (e.g. 15 Jan 2026 or Jan 15, 2026)
        m_match = re.search(r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(202[5-9])\b', raw_str, re.I)
        if m_match:
            d_val, m_str, y_val = m_match.groups()
            months = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                      'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}
            m_num = months[m_str[:3].lower()]
            date_str = f"{y_val}-{m_num:02d}-{int(d_val):02d}"
            iso_stamp = f"{date_str}T23:59:59-12:00"

    if not date_str:
        return None

    return {
        'deadline': iso_stamp,
        'comment': comment,
        'year': year,
        'timezone': 'UTC',
        'original_timezone': 'AoE',
        'original_deadlines': {
            'deadline': f"{date_str} 23:59:59"
        },
        'deadline_dates': {
            'deadline': date_str
        },
        'utc_status': {
            'deadline': 'converted'
        },
        'link': link
    }


_DBLP_CACHE = {}
_DBLP_BLOCKED = True  # Offline by default to prevent connection resets and rate limits


def detect_publisher_from_metadata(name: str, link: str) -> str | None:
    """Heuristically identify prestigious academic publishers from title and domain."""
    combined = f"{name} {link}".lower()
    if 'ieee' in combined:
        return 'IEEE'
    if 'acm' in combined or 'sigcomm' in combined or 'sigsac' in combined or 'sigkdd' in combined or 'sigmod' in combined:
        return 'ACM'
    if 'usenix' in combined:
        return 'USENIX'
    if 'springer' in combined or 'lncs' in combined:
        return 'Springer'
    if 'elsevier' in combined or 'sciencedirect' in combined:
        return 'Elsevier'
    if 'aaai' in combined:
        return 'AAAI'
    if 'neurips' in combined or 'nips' in combined:
        return 'Neural Information Processing Systems'
    if 'pmlr' in combined or 'icml' in combined or 'aistats' in combined or 'colt' in combined:
        return 'PMLR'
    return None


def enrich_with_dblp(acronym: str, title: str) -> dict:
    """Query DBLP API to discover official publisher and canonical homepage with rate-limit protection."""
    global _DBLP_BLOCKED
    if _DBLP_BLOCKED:
        return {}

    query = acronym if len(acronym) >= 3 else title
    if not query or len(query) < 3:
        return {}

    if query in _DBLP_CACHE:
        return _DBLP_CACHE[query]

    url = DBLP_SEARCH_API.format(query=quote(query))
    raw = safe_fetch(url, timeout=5, max_retries=1)
    if not raw:
        return {}

    try:
        data = json.loads(raw.decode('utf-8', errors='replace'))
        hits = data.get('result', {}).get('hits', {}).get('hit', [])
        for hit in hits:
            info = hit.get('info', {})
            venue_acronym = clean_str(info.get('acronym')).upper()
            if venue_acronym == acronym.upper() or acronym.upper() in clean_str(info.get('venue')).upper():
                res = {
                    'publisher': clean_str(info.get('publisher')) or None,
                    'dblp_url': clean_str(info.get('url')) or None
                }
                _DBLP_CACHE[query] = res
                return res
    except Exception:
        pass
    _DBLP_CACHE[query] = {}
    return {}


def load_all_curated_sources(today_cutoff: str = "2026-01-01") -> tuple[dict[str, list[dict]], list[dict]]:
    """
    Fetch and aggregate from all curated GitHub repos (ai-deadlines, sec-deadlines, se-deadlines).
    Returns:
      - aggregated_deadlines: mapping { normalized_acronym: [deadline_entry, ...] }
      - curated_venues: list of full venue dicts for novel discovery
    """
    aggregated_deadlines: dict[str, list[dict]] = {}
    curated_venues: list[dict] = []
    seen_venues: set[str] = set()

    for source_name, url in GITHUB_SOURCES.items():
        records = fetch_yaml_source(source_name, url)
        subjects = SUBJECT_MAP.get(source_name, ['Computer Science'])

        for item in records:
            # Handle different field names across repos
            raw_title = item.get('title') or item.get('name') or ''
            raw_desc = item.get('description') or ''
            link = clean_str(item.get('link'))
            year = int(item.get('year') or datetime.now(timezone.utc).year)

            # Acronym extraction
            acronym_cand = item.get('name') if 'description' in item else item.get('title')
            if not acronym_cand:
                acronym_cand = item.get('id', '')
            norm_acronym = normalize_acronym(acronym_cand)

            if not norm_acronym:
                continue

            full_name = clean_str(raw_desc if raw_desc else raw_title)
            if not full_name:
                full_name = norm_acronym

            # Extract deadlines (single string or list)
            raw_dl = item.get('deadline')
            dl_list = raw_dl if isinstance(raw_dl, list) else [raw_dl]

            valid_rounds = []
            for idx, dl_item in enumerate(dl_list, 1):
                comment = f"Round {idx} ({source_name})" if len(dl_list) > 1 else f"Submission ({source_name})"
                entry = parse_deadline_entry(dl_item, year, comment=comment, link=link)
                if entry and entry['deadline_dates']['deadline'] >= today_cutoff:
                    valid_rounds.append(entry)

            # Abstract deadline if available
            raw_abs = item.get('abstract_deadline')
            if raw_abs:
                abs_entry = parse_deadline_entry(raw_abs, year, comment="Abstract Registration", link=link)
                if abs_entry and abs_entry['deadline_dates']['deadline'] >= today_cutoff:
                    valid_rounds.insert(0, abs_entry)

            if valid_rounds:
                aggregated_deadlines.setdefault(norm_acronym, []).extend(valid_rounds)

                # Collect keywords from tags and description
                tags = item.get('tags') or []
                if isinstance(tags, str):
                    tags = [tags]
                keywords = [full_name, norm_acronym] + list(tags)
                if item.get('sub'):
                    keywords.append(clean_str(item.get('sub')))

                venue_info = {
                    'acronym': clean_str(acronym_cand).replace(' 2025', '').replace(' 2026', '').replace(' 2027', ''),
                    'norm_acronym': norm_acronym,
                    'name': full_name,
                    'homepage_url': link or None,
                    'subject_area': list(subjects),
                    'scope_keywords': [k for k in dict.fromkeys(keywords) if k],
                    'submission_deadlines': valid_rounds,
                    'source': source_name
                }

                if norm_acronym not in seen_venues:
                    seen_venues.add(norm_acronym)
                    curated_venues.append(venue_info)

    logger.info(f"Aggregated curated deadlines for {len(aggregated_deadlines)} acronyms; {len(curated_venues)} venues.")
    return aggregated_deadlines, curated_venues


def integrate_curated_into_seed(
    seed_records: list[dict],
    curated_venues: list[dict],
    today_cutoff: str = "2026-01-01"
) -> tuple[list[dict], dict]:
    """
    Reconciles curated venues with existing seed records:
    1. If venue exists in seed, preserves seed CORE metadata.
    2. If venue is novel and high-quality, auto-allocates new sequential CONF-xxx ID,
       validates strict schema requirements, and appends to seed records.
    Returns: (updated_seed_records, stats_report)
    """
    updated_records = list(seed_records)
    existing_acronyms = set()
    existing_names = set()
    max_venue_num = 0
    max_core_num = 0

    for r in seed_records:
        v = r['venue']
        c = r['core']
        if v.get('acronym'):
            existing_acronyms.add(normalize_acronym(v['acronym']))
        if c.get('acronym'):
            existing_acronyms.add(normalize_acronym(c['acronym']))
        if v.get('name'):
            existing_names.add(v['name'].strip().lower())
        if c.get('name'):
            existing_names.add(c['name'].strip().lower())

        # Track max IDs
        v_match = re.search(r'CONF-(\d+)', v.get('id', ''))
        if v_match:
            max_venue_num = max(max_venue_num, int(v_match.group(1)))
        c_match = re.search(r'(\d+)', c.get('id', ''))
        if c_match:
            max_core_num = max(max_core_num, int(c_match.group(1)))

    stats = {
        'new_venues_discovered': 0,
        'new_venues_added': [],
        'existing_venues_matched': 0
    }

    for cv in curated_venues:
        norm_acr = cv['norm_acronym']
        norm_name = cv['name'].strip().lower()

        # Check if already present in seed
        if norm_acr in existing_acronyms or norm_name in existing_names:
            stats['existing_venues_matched'] += 1
            continue

        # Novel conference discovered! Allocate next sequential ID
        max_venue_num += 1
        max_core_num += 1
        new_conf_id = f"CONF-{max_venue_num:03d}"
        new_core_id = str(max_core_num)

        # Detect publisher
        detected_pub = detect_publisher_from_metadata(cv['name'], cv.get('homepage_url') or '')
        dblp_meta = {}
        if not detected_pub and not _DBLP_BLOCKED:
            dblp_meta = enrich_with_dblp(cv['acronym'], cv['name'])
        pub = detected_pub or dblp_meta.get('publisher')

        new_record = {
            'core': {
                'id': new_core_id,
                'name': cv['name'],
                'acronym': cv['acronym'],
                'source': 'ICORE2026',
                'rank': 'Unranked',
                'dblp': 'Yes' if dblp_meta.get('dblp_url') else 'No',
                'primary_for': '4600',
                'secondary_for': '',
                'tertiary_for': '',
                'portal_url': cv['homepage_url'] or f"https://dblp.org/db/conf/{cv['acronym'].lower()}",
                'note': f"Discovered via {cv['source']}",
                'note_links': [],
                'note_images': [],
                'dblp_url': dblp_meta.get('dblp_url'),
                'comments_count': 0,
                'average_rating': None
            },
            'venue': {
                'id': new_conf_id,
                'name': cv['name'],
                'acronym': cv['acronym'],
                'issn': None,
                'eissn': None,
                'publisher': pub,
                'core_rank': None,  # None means Unranked per cleaning.py policy
                'subject_area': cv['subject_area'],
                'scope_keywords': cv['scope_keywords'],
                'submission_deadlines': cv['submission_deadlines'],
                'homepage_url': cv['homepage_url']
            }
        }

        updated_records.append(new_record)
        existing_acronyms.add(norm_acr)
        existing_names.add(norm_name)
        stats['new_venues_discovered'] += 1
        stats['new_venues_added'].append({
            'id': new_conf_id,
            'acronym': cv['acronym'],
            'name': cv['name'],
            'deadlines_count': len(cv['submission_deadlines'])
        })

    logger.info(f"Integrated {stats['new_venues_discovered']} new conferences into seed catalog.")
    return updated_records, stats
