"""Conference metadata enrichment via ICORE FoR mapping and OpenAlex Sources API."""
from __future__ import annotations

import json
import logging
import re
import unicodedata
import urllib.request
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup

try:
    from scrapling.fetchers import Fetcher as ScraplingFetcher
except ImportError:  # pragma: no cover - fallback when scrapling is unavailable
    ScraplingFetcher = None

logger = logging.getLogger(__name__)

ICORE_LIST_URL = 'https://portal.core.edu.au/conf-ranks/'
ICORE_DETAIL_URL = 'https://portal.core.edu.au/conf-ranks/{core_id}/'
OPENALEX_SOURCES_URL = (
    'https://api.openalex.org/sources?search={query}&filter=type:conference'
    '&per-page=5&mailto=ie104@uit.edu.vn'
)
OPENALEX_SOURCES_FALLBACK_URL = (
    'https://api.openalex.org/sources?search={query}&per-page=5&mailto=ie104@uit.edu.vn'
)

POLITE_HEADERS = {
    'User-Agent': 'IE104-Conference-Lifecycle/1.0 (+https://github.com/vokien/-n-IE104; mailto:ie104@uit.edu.vn)',
    'Accept': 'application/json,text/html,*/*',
}

# ANZSRC 2020 + 2008 Field of Research (FoR) codes and ICORE legacy codes -> English labels.
FOR_CODE_MAP: dict[str, str] = {
    # ANZSRC 2020 Division 46: Information and Computing Sciences
    '46': 'Computer Science',
    '4600': 'Computer Science',
    '4601': 'Applied Computing',
    '4602': 'Artificial Intelligence',
    '4603': 'Computer Vision and Multimedia',
    '4604': 'Cybersecurity and Privacy',
    '4605': 'Data Management and Data Science',
    '4606': 'Distributed Computing and Systems Software',
    '4607': 'Graphics, Augmented Reality and Games',
    '4608': 'Human-Centred Computing',
    '4609': 'Information Systems',
    '4610': 'Machine Learning',
    '4611': 'Natural Language Processing',
    '4612': 'Software Engineering',
    '4613': 'Theory of Computation',
    '4699': 'Other Information and Computing Sciences',
    # ICORE legacy / cross-disciplinary FoR label
    'CSE': 'Computer Systems Engineering',
    # ANZSRC 2020 Division 40: Engineering (CS-adjacent)
    '40': 'Engineering',
    '4006': 'Communications Engineering',
    '4007': 'Control Engineering, Mechatronics and Robotics',
    '4008': 'Electrical Engineering',
    '4009': 'Electronics, Sensors and Digital Hardware',
    '4010': 'Engineering Practice and Education',
    '4016': 'Materials Engineering',
    '4017': 'Mechanical Engineering',
    '4099': 'Other Engineering',
    # ANZSRC 2020 Division 49: Mathematical Sciences
    '49': 'Mathematical Sciences',
    '4901': 'Applied Mathematics',
    '4902': 'Mathematical Physics',
    '4903': 'Numerical and Computational Mathematics',
    '4904': 'Pure Mathematics',
    '4905': 'Statistics',
    '4999': 'Other Mathematical Sciences',
    # ANZSRC 2020 adjacent divisions
    '31': 'Biological Sciences',
    '3102': 'Bioinformatics and Computational Biology',
    '42': 'Health Sciences',
    '4203': 'Health Services and Systems',
    '47': 'Language, Communication and Culture',
    '4704': 'Linguistics',
    # ANZSRC 2008 Division 08: Information and Computing Sciences
    '08': 'Information and Computing Sciences',
    '0800': 'Information and Computing Sciences',
    '0801': 'Artificial Intelligence and Image Processing',
    '0802': 'Computation Theory and Mathematics',
    '0803': 'Computer Software',
    '0804': 'Data Format',
    '0805': 'Distributed Computing',
    '0806': 'Information Systems',
    '0807': 'Library and Information Studies',
    '0899': 'Other Information and Computing Sciences',
    # ANZSRC 2008 Division 01 & 10 (Mathematical & Technology)
    '01': 'Mathematical Sciences',
    '0102': 'Applied Mathematics',
    '0103': 'Numerical and Computational Mathematics',
    '0104': 'Statistics',
    '10': 'Technology',
    '1005': 'Communications Technologies',
    '1006': 'Computer Hardware',
}

_STOP_WORDS = frozenset({
    'a', 'an', 'and', 'of', 'on', 'the', 'for', 'in', 'to', 'with',
    'international', 'conference', 'symposium', 'workshop', 'annual',
    'joint', 'proceedings', 'proceeding', 'society', 'technical', 'meeting',
    'congress', 'colloquium', 'summit', 'forum', 'track', 'series',
    'ieee', 'acm', 'ifip', 'usenix', 'sigplan', 'sigmod', 'sigcomm',
    'sigsac', 'sigir', 'sigchi', 'sigkdd', 'sigact', 'sigarch', 'sigsoft',
    'iacr', 'vldb', 'tc13', 'european', 'asian', 'pacific',
})

_ORGS = frozenset({'ieee', 'acm', 'ifip', 'usenix'})


def _clean_text(value: str | None) -> str:
    if not value:
        return ''
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(value))).strip()


def _dedupe_terms(terms: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for term in terms:
        cleaned = _clean_text(term)
        if cleaned:
            seen.setdefault(cleaned.casefold(), cleaned)
    return list(seen.values())


def fetch_with_scrapling(url: str, timeout: int = 15, headers: dict[str, str] | None = None) -> bytes | None:
    """Fetch URL bytes via scrapling.fetchers.Fetcher with urllib fallback; returns None on error."""
    req_headers = dict(POLITE_HEADERS)
    if headers:
        req_headers.update(headers)

    if ScraplingFetcher is not None:
        try:
            resp = ScraplingFetcher.get(url, headers=req_headers, timeout=timeout)
            status = getattr(resp, 'status', None)
            if status == 200:
                body = getattr(resp, 'body', b'')
                if isinstance(body, str):
                    return body.encode('utf-8')
                if isinstance(body, (bytes, bytearray)):
                    return bytes(body)
        except Exception as exc:
            logger.debug('Scrapling fetch failed for %s: %s', url, exc)

    try:
        req = urllib.request.Request(url, headers=req_headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return resp.read()
    except Exception as exc:
        logger.debug('Fallback urllib fetch failed for %s: %s', url, exc)
    return None


def parse_for_codes(core_record: dict) -> list[str]:
    """Extract ordered, deduplicated FoR codes from ICORE primary/secondary/tertiary fields."""
    if not isinstance(core_record, dict):
        return []
    codes: list[str] = []
    seen: set[str] = set()
    for key in ('primary_for', 'secondary_for', 'tertiary_for'):
        raw = str(core_record.get(key) or '').strip()
        if not raw:
            continue
        for token in re.split(r'[\s,;]+', raw):
            code = token.strip().upper()
            if code and code not in seen:
                seen.add(code)
                codes.append(code)
    return codes


def subjects_from_core(core_record: dict, for_map: dict[str, str] | None = None) -> list[str]:
    """Map ICORE FoR codes on a core record to standardized English subject names."""
    mapping = FOR_CODE_MAP if for_map is None else {**FOR_CODE_MAP, **for_map}
    subjects: list[str] = []
    for code in parse_for_codes(core_record):
        label = mapping.get(code)
        if not label and len(code) == 4 and code[:2] in mapping:
            label = mapping[code[:2]]
        if label:
            subjects.append(label)
    return _dedupe_terms(subjects)


def parse_icore_detail_html(html: str) -> dict:
    """Parse Field Of Research codes and labels from an ICORE portal conference detail page."""
    soup = BeautifulSoup(html, 'html.parser')
    for_labels: dict[str, str] = {}
    for_codes: list[str] = []

    text = soup.get_text('\n', strip=True)
    pattern = re.compile(r'Field Of Research:\s*([A-Za-z0-9]+)\s*-\s*([^\n†]+)', re.I)
    for match in pattern.finditer(text):
        code = match.group(1).strip().upper()
        label = _clean_text(match.group(2).rstrip('† '))
        if code and label:
            for_labels.setdefault(code, label)
            if code not in for_codes:
                for_codes.append(code)

    return {
        'for_codes': for_codes,
        'for_labels': for_labels,
        'subjects': _dedupe_terms([for_labels[c] for c in for_codes]),
    }


def fetch_icore_conference_info(
    core_id: str | int,
    fetcher=None,
    timeout: int = 15,
) -> dict | None:
    """Fetch and parse FoR metadata for a single ICORE conference ID; returns None on error."""
    cid = str(core_id or '').strip()
    if not cid.isdigit():
        return None
    fetch_fn = fetcher or fetch_with_scrapling
    url = ICORE_DETAIL_URL.format(core_id=cid)
    raw = fetch_fn(url, timeout=timeout)
    if not raw:
        return None
    html = raw.decode('utf-8', errors='replace') if isinstance(raw, (bytes, bytearray)) else str(raw)
    parsed = parse_icore_detail_html(html)
    if not parsed['for_codes']:
        return None
    parsed['core_id'] = cid
    parsed['portal_url'] = url
    return parsed


def fetch_icore_subjects_map(
    core_ids: list[str | int] | None = None,
    fetcher=None,
    timeout: int = 15,
    limit: int = 10,
) -> dict[str, str]:
    """Return FoR code -> English subject map, optionally augmented live from portal.core.edu.au."""
    mapping = dict(FOR_CODE_MAP)
    fetch_fn = fetcher or fetch_with_scrapling
    try:
        raw = fetch_fn(ICORE_LIST_URL, timeout=timeout)
        if raw:
            html = raw.decode('utf-8', errors='replace') if isinstance(raw, (bytes, bytearray)) else str(raw)
            parsed = parse_icore_detail_html(html)
            for code, label in parsed['for_labels'].items():
                mapping.setdefault(code, label)
    except Exception as exc:
        logger.debug('ICORE list fetch failed: %s', exc)

    for cid in (core_ids or [])[:max(0, limit)]:
        try:
            info = fetch_icore_conference_info(cid, fetcher=fetch_fn, timeout=timeout)
            if info:
                for code, label in info['for_labels'].items():
                    mapping.setdefault(code, label)
        except Exception as exc:
            logger.debug('ICORE detail fetch failed for %s: %s', cid, exc)

    return mapping


def fill_subject_areas_from_core(records: list[dict], extra_for_map: dict[str, str] | None = None) -> int:
    """Populate empty venue['subject_area'] in seed records using CORE FoR fields. Returns filled count."""
    filled = 0
    for record in records:
        venue = record.get('venue')
        core = record.get('core')
        if not isinstance(venue, dict) or not isinstance(core, dict):
            continue
        if venue.get('subject_area'):
            continue
        subjects = subjects_from_core(core, extra_for_map)
        if subjects:
            venue['subject_area'] = subjects
            filled += 1
    return filled


def _norm_alnum(value: str | None) -> str:
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '')).casefold() if c.isalnum())


def _title_tokens(value: str | None, acronym: str = '') -> frozenset[str]:
    text = unicodedata.normalize('NFKD', str(value or '')).casefold()
    text = re.sub(r'\([^)]*\)', ' ', text)
    text = re.sub(r'\b(?:19|20)\d{2}\b|\b\d+(?:st|nd|rd|th)\b', ' ', text)
    acr_tokens = set(re.findall(r'[a-z0-9]+', str(acronym or '').casefold()))
    tokens = [
        tok for tok in re.findall(r'[a-z0-9]+', text)
        if tok not in _STOP_WORDS and tok not in acr_tokens and len(tok) > 1
    ]
    return frozenset(tokens)


def _token_overlap_score(left: frozenset[str], right: frozenset[str]) -> tuple[int, float]:
    if not left or not right:
        return 0, 0.0
    matched = 0
    for tok in left:
        if tok in right:
            matched += 1
            continue
        # Handle minor inflection differences such as "function" vs "functional".
        if len(tok) >= 5 and any(
            len(other) >= 5 and (tok.startswith(other) or other.startswith(tok))
            for other in right
        ):
            matched += 1
    ratio = matched / max(1, min(len(left), len(right)))
    return matched, ratio


def _orgs_compatible(left: str, right: str) -> bool:
    left_orgs = set(re.findall(r'\b(?:ieee|acm|ifip|usenix)\b', left.casefold()))
    right_orgs = set(re.findall(r'\b(?:ieee|acm|ifip|usenix)\b', right.casefold()))
    return not (left_orgs and right_orgs and left_orgs.isdisjoint(right_orgs))


def is_strict_openalex_match(venue: dict, candidate: dict) -> bool:
    """Strictly verify an OpenAlex source candidate against venue name and acronym."""
    if not isinstance(candidate, dict):
        return False
    cand_type = str(candidate.get('type') or '').casefold()
    if cand_type in {'repository', 'ebook platform', 'metadata'}:
        return False

    v_name = _clean_text(venue.get('name'))
    v_acr = _clean_text(venue.get('acronym'))
    v_acr_norm = _norm_alnum(re.sub(r'\b(?:19|20)\d{2}\b', '', v_acr))
    v_tokens = _title_tokens(v_name, v_acr)

    cand_titles = [candidate.get('display_name'), candidate.get('abbreviated_title')]
    cand_titles.extend(candidate.get('alternate_titles') or [])
    cand_titles = [_clean_text(t) for t in cand_titles if _clean_text(t)]
    if not cand_titles:
        return False

    display = cand_titles[0]
    if not _orgs_compatible(v_name, display):
        return False

    # Check if acronym explicitly appears as a standalone token/parenthetical or abbreviated_title.
    acr_matched = False
    if v_acr_norm and len(v_acr_norm) >= 2:
        for title in cand_titles:
            if _norm_alnum(title) == v_acr_norm:
                acr_matched = True
                break
            parens = re.findall(r'\(([^)]+)\)', title)
            if any(_norm_alnum(p) == v_acr_norm for p in parens):
                acr_matched = True
                break
            words = re.findall(r'[A-Za-z0-9&+.-]+', title)
            if any(_norm_alnum(w) == v_acr_norm for w in words):
                acr_matched = True
                break

    best_matched, best_ratio = 0, 0.0
    exact_norm_title = False
    v_name_norm = _norm_alnum(re.sub(r'\([^)]*\)', '', v_name))
    for title in cand_titles:
        t_norm = _norm_alnum(re.sub(r'\([^)]*\)', '', title))
        if v_name_norm and t_norm == v_name_norm:
            exact_norm_title = True
            break
        c_tokens = _title_tokens(title, v_acr)
        matched, ratio = _token_overlap_score(v_tokens, c_tokens)
        if (ratio, matched) > (best_ratio, best_matched):
            best_matched, best_ratio = matched, ratio

    if exact_norm_title:
        return True
    if acr_matched:
        if not v_tokens:
            return True
        return best_matched >= 1 and best_ratio >= 0.5
    return best_matched >= 2 and best_ratio >= 0.75


def extract_openalex_enrichment(source_obj: dict) -> dict:
    """Extract sorted topics/concepts as scope_keywords and subfields as subject_areas."""
    topics_raw = sorted(
        [t for t in (source_obj.get('topics') or []) if isinstance(t, dict) and t.get('display_name')],
        key=lambda t: t.get('count') or 0,
        reverse=True,
    )
    keywords: list[str] = []
    subjects: list[str] = []

    for topic in topics_raw[:8]:
        keywords.append(topic['display_name'])
        subfield = topic.get('subfield')
        if isinstance(subfield, dict) and subfield.get('display_name'):
            subjects.append(subfield['display_name'])

    concepts_raw = sorted(
        [c for c in (source_obj.get('x_concepts') or []) if isinstance(c, dict) and c.get('display_name')],
        key=lambda c: c.get('score') or 0,
        reverse=True,
    )
    for concept in concepts_raw:
        level = concept.get('level')
        if level is None or level >= 1:
            keywords.append(concept['display_name'])
        if level == 1:
            subjects.append(concept['display_name'])
        if len(keywords) >= 12:
            break

    return {
        'openalex_id': source_obj.get('id'),
        'display_name': _clean_text(source_obj.get('display_name')),
        'type': source_obj.get('type'),
        'scope_keywords': _dedupe_terms(keywords)[:10],
        'subject_areas': _dedupe_terms(subjects)[:4],
    }


def query_openalex_source(venue: dict, fetcher=None, timeout: int = 15) -> tuple[dict | None, int]:
    """Query OpenAlex Sources API for a conference; returns (matched_source_dict, http_calls_used)."""
    fetch_fn = fetcher or fetch_with_scrapling
    acronym = _clean_text(venue.get('acronym'))
    name = _clean_text(venue.get('name'))

    queries: list[tuple[str, str]] = []
    if len(acronym) >= 3:
        queries.append((acronym, OPENALEX_SOURCES_URL))
    if name and name.casefold() != acronym.casefold():
        queries.append((name, OPENALEX_SOURCES_URL))
    if name:
        queries.append((name, OPENALEX_SOURCES_FALLBACK_URL))

    calls = 0
    seen_urls: set[str] = set()
    for query_text, template in queries:
        url = template.format(query=quote(query_text))
        if url in seen_urls:
            continue
        seen_urls.add(url)
        calls += 1
        raw = fetch_fn(url, timeout=timeout)
        if not raw:
            continue
        try:
            payload = json.loads(raw.decode('utf-8', errors='replace') if isinstance(raw, (bytes, bytearray)) else raw)
        except (ValueError, UnicodeDecodeError):
            continue
        results = payload.get('results') or []
        matches = [c for c in results if is_strict_openalex_match(venue, c)]
        if matches:
            # Prefer conference type and higher works_count among strict matches.
            matches.sort(
                key=lambda c: (
                    1 if str(c.get('type') or '').casefold() == 'conference' else 0,
                    c.get('works_count') or 0,
                ),
                reverse=True,
            )
            return matches[0], calls

    return None, calls


def synthesize_academic_scope(
    name: str | None,
    acronym: str | None,
    subject_areas: list[str] | None,
    topics: list[str] | None,
    limit: int = 480,
) -> str | None:
    """Synthesize a concise academic scope strictly from verified metadata fields."""
    clean_name = _clean_text(name)
    clean_acr = _clean_text(acronym)
    subjects = _dedupe_terms(list(subject_areas or []))
    topic_list = _dedupe_terms(list(topics or []))

    # Exclude exact duplicates of the conference name or acronym from topic highlights.
    filtered_topics = [
        t for t in topic_list
        if t.casefold() not in {clean_name.casefold(), clean_acr.casefold()}
    ]
    if not clean_name or (not subjects and len(filtered_topics) < 2):
        return None

    has_acr_in_name = bool(clean_acr and re.search(rf'\b{re.escape(clean_acr)}\b', clean_name, re.I))
    title_part = f'{clean_name} ({clean_acr})' if clean_acr and not has_acr_in_name else clean_name
    if subjects and filtered_topics:
        subj_str = ', '.join(subjects[:3])
        topics_str = ', '.join(filtered_topics[:5])
        sentence = (
            f'{title_part} is an academic research conference in {subj_str}, '
            f'covering topics including {topics_str}.'
        )
    elif subjects:
        subj_str = ', '.join(subjects[:4])
        sentence = f'{title_part} is an academic research conference focusing on {subj_str}.'
    else:
        topics_str = ', '.join(filtered_topics[:6])
        sentence = f'{title_part} is an academic research conference covering {topics_str}.'

    sentence = _clean_text(sentence)
    if len(sentence) <= limit:
        return sentence
    # Trim topic list if needed so sentence remains grammatical and within limit.
    for keep_topics in range(min(4, len(filtered_topics)), 0, -1):
        topics_str = ', '.join(filtered_topics[:keep_topics])
        if subjects:
            candidate = (
                f'{title_part} is an academic research conference in {", ".join(subjects[:2])}, '
                f'covering topics including {topics_str}.'
            )
        else:
            candidate = f'{title_part} is an academic research conference covering {topics_str}.'
        candidate = _clean_text(candidate)
        if len(candidate) <= limit:
            return candidate
    cut = sentence[:limit - 4].rsplit(' ', 1)[0].rstrip(' ,;:-')
    return f'{cut}.'


def _load_cache(cache_path: Path | None) -> dict:
    if cache_path and cache_path.exists():
        try:
            data = json.loads(cache_path.read_text(encoding='utf-8'))
            if isinstance(data, dict) and isinstance(data.get('openalex'), dict):
                return data
        except (ValueError, OSError):
            pass
    return {'schema': 'ie104-enrichment-cache-v1', 'openalex': {}}


def _save_cache(cache_path: Path | None, cache: dict) -> None:
    if not cache_path:
        return
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(cache_path)


def enrich_conferences(
    rows: list[dict],
    core_by_id: dict[str, dict] | None = None,
    state_dir: Path | str | None = None,
    enrich_limit: int = 40,
    enable_network: bool = True,
    fetcher=None,
    priority_ids: set[str] | None = None,
    for_map: dict[str, str] | None = None,
) -> dict:
    """
    Enrich conference rows in-place with ICORE FoR subject_area, OpenAlex topics/concepts,
    and academic scope fallback. Uses enrichment_cache.json and respects enrich_limit.
    """
    core_by_id = core_by_id or {}
    cache_path = Path(state_dir) / 'enrichment_cache.json' if state_dir else None
    cache = _load_cache(cache_path)
    oa_cache: dict[str, dict] = cache.setdefault('openalex', {})
    cache_dirty = False

    stats = {
        'subject_area_filled_from_for': 0,
        'openalex_cache_hits': 0,
        'openalex_network_queries': 0,
        'openalex_matched': 0,
        'scope_synthesized': 0,
        'network_budget_used': 0,
        'enrich_limit': enrich_limit,
    }

    # Step 1: Deterministic offline FoR -> subject_area mapping for missing subject_area.
    for row in rows:
        core = core_by_id.get(row.get('id'))
        if core and not row.get('subject_area'):
            mapped = subjects_from_core(core, for_map)
            if mapped:
                row['subject_area'] = mapped
                stats['subject_area_filled_from_for'] += 1

    # Step 2: Prioritize active/priority venues needing scope or richer keywords (< 5).
    priority_set = set(priority_ids or ())
    candidates = [
        row for row in rows
        if not row.get('scope') or len(row.get('scope_keywords') or []) < 5 or not row.get('subject_area')
    ]
    candidates.sort(
        key=lambda r: (
            0 if r.get('id') in priority_set else 1,
            0 if len(r.get('scope_keywords') or []) < 5 else 1,
            0 if not r.get('scope') else 1,
            str(r.get('id') or ''),
        )
    )

    budget_remaining = max(0, int(enrich_limit))

    for row in candidates:
        vid = str(row.get('id') or '')
        cached = oa_cache.get(vid)
        oa_info = None

        if isinstance(cached, dict):
            stats['openalex_cache_hits'] += 1
            if cached.get('matched'):
                oa_info = cached
        elif enable_network and budget_remaining > 0:
            source_obj, calls_used = query_openalex_source(row, fetcher=fetcher)
            budget_remaining -= calls_used
            stats['openalex_network_queries'] += 1
            stats['network_budget_used'] += calls_used
            if source_obj:
                oa_info = extract_openalex_enrichment(source_obj)
                oa_info['matched'] = True
            else:
                oa_info = {'matched': False}
            oa_cache[vid] = oa_info
            cache_dirty = True

        if oa_info and oa_info.get('matched'):
            stats['openalex_matched'] += 1
            new_kw = oa_info.get('scope_keywords') or []
            if new_kw:
                row['scope_keywords'] = _dedupe_terms(list(row.get('scope_keywords') or []) + list(new_kw))
            if not row.get('subject_area') and oa_info.get('subject_areas'):
                row['subject_area'] = _dedupe_terms(list(oa_info['subject_areas']))

    # Step 3: Synthesize concise academic scope when still missing using verified fields only.
    for row in rows:
        if not row.get('scope'):
            synth = synthesize_academic_scope(
                row.get('name'),
                row.get('acronym'),
                row.get('subject_area'),
                row.get('scope_keywords'),
            )
            if synth:
                row['scope'] = synth
                stats['scope_synthesized'] += 1

    if cache_dirty:
        _save_cache(cache_path, cache)

    return stats
