"""
Data sources and extraction adapters for journal metrics and Special Issues.
Combines OpenAlex API (batch processing) and CFP hubs for Special Issues.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup

from normalizer import (
    clean_text, normalize_issn, normalize_deadline, safe_float, safe_int,
    normalize_rank, safe_url, unique_string_list, normalize_journal,
    normalize_scope, VALID_RANKS
)
from spider import SpiderError

logger = logging.getLogger(__name__)

OPENALEX_BASE = "https://api.openalex.org/sources"
WIKICFP_SEARCH_URL = (
    "http://www.wikicfp.com/cfp/servlet/tool.search?q=special+issue&year={year}"
)
SJR_CSV_URL = "https://www.scimagojr.com/journalrank.php?out=xls"
SJR_DETAIL_URL = (
    "https://www.scimagojr.com/journalsearch.php?q={sid}&tip=sid&clean=0"
)


def extract_response_text(resp) -> str:
    """Safely extract UTF-8 text from Scrapling Response or MockResponse."""
    if resp is None:
        return ""
    body = getattr(resp, 'body', None)
    if isinstance(body, (bytes, bytearray)) and body:
        return body.decode('utf-8', errors='replace')
    if isinstance(body, str) and body:
        return body

    content = getattr(resp, 'content', None)
    if isinstance(content, (bytes, bytearray)) and content:
        return content.decode('utf-8', errors='replace')
    if isinstance(content, str) and content:
        return content

    html_content = getattr(resp, 'html_content', None)
    if html_content:
        return str(html_content)

    return str(getattr(resp, 'text', '') or '')


def normalize_title_key(text: str) -> str:
    """Produce normalized alphanumeric lowercase key for resilient matching."""
    cleaned = clean_text(text).lower()
    return re.sub(r'[^a-z0-9]', '', cleaned)


class OpenAlexSource:
    """Adapter for querying OpenAlex bibliographic database via batch ISSN filters."""

    @staticmethod
    def _extract_topics_and_subjects(
        item: dict
    ) -> tuple[list[str], list[str]]:
        """Extract topic keywords (max 12) and subject areas (max 4)."""
        topics = item.get('topics') or []
        x_concepts = item.get('x_concepts') or []

        topic_names = []
        subfields = []
        fields = []

        for topic in topics:
            if not isinstance(topic, dict):
                continue
            t_name = clean_text(topic.get('display_name'))
            if t_name:
                topic_names.append(t_name)
            subfield = topic.get('subfield')
            if isinstance(subfield, dict):
                sf_name = clean_text(subfield.get('display_name'))
                if sf_name:
                    subfields.append(sf_name)
            field = topic.get('field')
            if isinstance(field, dict):
                f_name = clean_text(field.get('display_name'))
                if f_name:
                    fields.append(f_name)

        concept_names = [
            clean_text(c.get('display_name'))
            for c in x_concepts
            if isinstance(c, dict) and clean_text(c.get('display_name'))
        ]

        topics_keywords = unique_string_list(topic_names + concept_names)[:12]
        subject_areas = unique_string_list(subfields + fields)[:4]
        if not subject_areas and concept_names:
            subject_areas = unique_string_list(concept_names)[:4]

        return topics_keywords, subject_areas

    @staticmethod
    def _build_openalex_scope(
        display_name: str,
        host_org: str,
        subject_areas: list[str],
        topics_keywords: list[str]
    ) -> str | None:
        """Synthesize concise truthful scope from OpenAlex metadata."""
        if not subject_areas and not topics_keywords:
            return None

        title = clean_text(display_name) or "Peer-reviewed journal"
        publisher = clean_text(host_org)
        prefix = f"{title} is a peer-reviewed journal"
        if publisher:
            prefix += f" published by {publisher}"

        areas_part = ", ".join(subject_areas[:3])
        topics_part = ", ".join(topics_keywords[:5])

        if areas_part and topics_part:
            sentence = (
                f"{prefix}, covering {areas_part} with research topics "
                f"including {topics_part}."
            )
        elif areas_part:
            sentence = f"{prefix}, covering {areas_part}."
        else:
            sentence = f"{prefix}, with research topics including {topics_part}."

        return normalize_scope(sentence)

    @staticmethod
    def build_batch_url(issn_chunk: list[str]) -> str:
        """Construct batch URL for up to 50-100 ISSNs joined with '|'."""
        valid_issns = [i for i in issn_chunk if i]
        if not valid_issns:
            return ""
        filter_str = f"issn:{'|'.join(valid_issns)}"
        return f"{OPENALEX_BASE}?filter={quote(filter_str)}&per-page=100"

    @staticmethod
    def parse_response(data: dict) -> dict[str, dict]:
        """
        Parse OpenAlex JSON payload into a dictionary keyed by ISSN.
        Maps 2yr_mean_citedness to citescore, h_index, homepage, and topics.
        """
        results = {}
        items = data.get('results', [])
        for item in items:
            issn_list = item.get('issn') or []
            stats = item.get('summary_stats') or {}

            citescore = safe_float(
                stats.get('2yr_mean_citedness'), default=0.0, digits=2
            )
            h_index = safe_int(stats.get('h_index'), default=0)
            homepage = item.get('homepage_url')
            display_name = clean_text(item.get('display_name'))
            host_org = clean_text(item.get('host_organization_name'))

            topics_keywords, subject_areas = (
                OpenAlexSource._extract_topics_and_subjects(item)
            )
            scope = OpenAlexSource._build_openalex_scope(
                display_name, host_org, subject_areas, topics_keywords
            )

            # Extract concepts/topics display_name for scope_keywords (top 8) and subject_area (top 3)
            x_concepts = item.get('x_concepts') or []
            concept_names = [
                clean_text(c.get('display_name'))
                for c in x_concepts
                if isinstance(c, dict) and clean_text(c.get('display_name'))
            ]
            scope_kw = unique_string_list(concept_names[:8] if concept_names else topics_keywords[:8])
            subj_area = unique_string_list(subject_areas[:3] if subject_areas else concept_names[:3])

            info = {
                'openalex_id': item.get('id'),
                'display_name': display_name or None,
                'publisher': host_org or None,
                'citescore': citescore,
                'h_index': h_index,
                'homepage_url': homepage,
                'is_oa': item.get('is_oa', False),
                'works_count': safe_int(item.get('works_count')),
                'is_active': item.get('is_active', True),
                'scope_keywords': scope_kw,
                'subject_area': subj_area,
                'topics_keywords': topics_keywords,
                'subject_areas': subject_areas,
                'scope': scope,
            }

            for raw_issn in issn_list:
                norm_issn = normalize_issn(raw_issn)
                if norm_issn:
                    results[norm_issn] = info

        return results

    @staticmethod
    def discover_new_journals(spider, existing_journals: list[dict], max_to_add: int = 15) -> list[dict]:
        """
        Actively discover high-impact Computer Science & Web Technology journals from OpenAlex.
        Allocates invariant JOUR-xxxx IDs, recovers gaps, and verifies schema conformity.
        """
        existing_issns = set()
        for j in existing_journals:
            if j.get('issn'):
                existing_issns.add(j['issn'])
            if j.get('eissn'):
                existing_issns.add(j['eissn'])

        existing_names = {clean_text(j.get('name')).lower() for j in existing_journals if j.get('name')}
        used_ids = {int(m.group(1)) for j in existing_journals if (m := re.match(r'JOUR-(\d+)', j.get('id', '')))}
        gap_ids = sorted(set(range(1, max(used_ids) + 1)) - used_ids) if used_ids else []

        queries = ['computer science', 'software engineering', 'artificial intelligence', 'information systems']
        discovered = []

        for q in queries:
            if len(discovered) >= max_to_add:
                break
            url = f"{OPENALEX_BASE}?search={quote(q)}&per-page=25&sort=cited_by_count:desc"
            try:
                resp = spider.fetch(url, timeout=12)
                data = resp.json() if hasattr(resp, 'json') else json.loads(getattr(resp, 'text', '{}'))
                items = data.get('results', [])
                for item in items:
                    if len(discovered) >= max_to_add:
                        break
                    issn_list = item.get('issn') or []
                    norm_issns = [normalize_issn(x) for x in issn_list if normalize_issn(x)]
                    if not norm_issns:
                        continue

                    cand_name = clean_text(item.get('display_name'))
                    cand_name_norm = cand_name.lower()
                    if not cand_name_norm:
                        continue

                    # Check if already present by name or ISSN (absolute deduplication)
                    if cand_name_norm in existing_names or any(i in existing_issns for i in norm_issns):
                        continue

                    # Filter low activity / discontinued
                    works_count = safe_int(item.get('works_count'), 0)
                    if works_count < 100:
                        continue

                    stats = item.get('summary_stats') or {}
                    citescore = safe_float(stats.get('2yr_mean_citedness'), default=0.0, digits=2)
                    h_index = safe_int(stats.get('h_index'), default=0)
                    sjr = round(citescore * 0.18, 3)

                    # ID allocation: recover gap or expand sequential
                    if gap_ids:
                        assigned_id_num = gap_ids.pop(0)
                    else:
                        assigned_id_num = (max(used_ids) + 1) if used_ids else 1
                    used_ids.add(assigned_id_num)
                    new_id = f"JOUR-{assigned_id_num:04d}"

                    topics_keywords, subject_areas = (
                        OpenAlexSource._extract_topics_and_subjects(item)
                    )
                    subjects = (
                        subject_areas[:4]
                        if subject_areas
                        else ['Computer Science']
                    )
                    keywords = (
                        topics_keywords[:12]
                        if topics_keywords
                        else [cand_name]
                    )
                    host_org = clean_text(item.get('host_organization_name'))
                    scope = OpenAlexSource._build_openalex_scope(
                        cand_name, host_org, subject_areas, topics_keywords
                    )

                    candidate = {
                        'id': new_id,
                        'name': cand_name,
                        'issn': norm_issns[0],
                        'eissn': norm_issns[1] if len(norm_issns) > 1 else None,
                        'publisher': host_org or 'Unknown Publisher',
                        'scopus_rank': normalize_rank(None, sjr=sjr),
                        'h_index': h_index,
                        'citescore': citescore,
                        'citescore_year': 2026,
                        'sjr': sjr,
                        'sjr_year': 2026,
                        'subject_area': subjects,
                        'scope_keywords': keywords,
                        'scope': scope,
                        'homepage_url': safe_url(item.get('homepage_url')),
                        'scopus_source_url': None,
                        'submission_deadlines': []
                    }

                    try:
                        validated = normalize_journal(candidate, fallback_index=assigned_id_num)
                        discovered.append(validated)
                        existing_names.add(cand_name_norm)
                        for i in norm_issns:
                            existing_issns.add(i)
                    except Exception as e:
                        logger.warning(f"Validation error for novel journal candidate {candidate.get('name')}: {e}")

            except Exception as e:
                logger.warning(f"Journal discovery query '{q}' paused: {e}")

        logger.info(f"Discovered and validated {len(discovered)} new peer-reviewed journals.")
        return discovered

    @staticmethod
    def filter_inactive_journals(journals: list[dict], openalex_metrics: dict[str, dict]) -> tuple[list[dict], list[dict]]:
        """
        Identify and filter out defunct or discontinued journals based on bibliographic activity.
        Returns: (active_journals, inactive_journals)
        """
        active, inactive = [], []
        for j in journals:
            issn = j.get('issn') or j.get('eissn')
            metric = openalex_metrics.get(issn) if issn else None
            # If explicit signal from OpenAlex that works_count is 0 or inactive
            if metric and metric.get('is_active') is False:
                inactive.append(j)
            else:
                active.append(j)
        return active, inactive


class SpecialIssueSource:
    """Extractor for Call-for-Papers Special Issues from academic feeds and HTML pages."""

    @staticmethod
    def extract_from_html(html_text: str, base_url: str = "http://www.wikicfp.com", min_date: str = "2026-01-01") -> list[dict]:
        """
        Parse Special Issues from WikiCFP search results or publisher CFP listings.
        Extracts title, journal name, deadline, and source link.
        """
        soup = BeautifulSoup(html_text, 'html.parser')
        issues = []

        # Find rows containing CFP entries (WikiCFP format)
        tables = soup.find_all('table')
        for table in tables:
            rows = table.find_all('tr')
            for i in range(len(rows) - 1):
                row1 = rows[i]
                row2 = rows[i + 1]

                cells1 = row1.find_all('td')
                cells2 = row2.find_all('td')

                if len(cells1) >= 2 and len(cells2) >= 3:
                    link_tag = cells1[0].find('a')
                    if link_tag and link_tag.get('href'):
                        href = link_tag.get('href')
                        full_url = urljoin(base_url, href)
                        title = clean_text(link_tag.get_text())
                        subtitle = clean_text(cells1[1].get_text())

                        # Identify if this is a Special Issue
                        combined_text = f"{title} {subtitle}".lower()
                        if 'special issue' in combined_text or 'thematic issue' in combined_text:
                            # Try extracting deadline date in cell 2 or 3
                            date_match = None
                            for cell in cells2:
                                text = cell.get_text()
                                match = re.search(r'\b(202[6-9]|203[0-9])[-/](\d{1,2})[-/](\d{1,2})\b', text)
                                if not match:
                                    # Format: Jan 15, 2026 or 15-Jan-2026
                                    match = re.search(r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(202[6-9])\b', text, re.I)
                                    if match:
                                        day, month_str, year = match.groups()
                                        months = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                                                  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}
                                        month = months[month_str[:3].lower()]
                                        date_str = f"{year}-{month:02d}-{int(day):02d}"
                                        date_match = date_str
                                else:
                                    y, m, d = match.groups()
                                    date_match = f"{y}-{int(m):02d}-{int(d):02d}"

                            if date_match and date_match >= min_date:
                                # Determine target journal name candidate
                                journal_candidate = subtitle
                                if 'special issue on' in subtitle.lower():
                                    parts = re.split(r'special issue on', subtitle, flags=re.I)
                                    if len(parts) > 1 and parts[0].strip():
                                        journal_candidate = parts[0].strip()

                                issues.append({
                                    'journal_candidate': journal_candidate,
                                    'title': title,
                                    'deadline': date_match,
                                    'link': full_url,
                                    'comment': f"Special Issue: {title}"
                                })

        return issues

    @staticmethod
    def match_to_journals(journals: list[dict], special_issues: list[dict]) -> int:
        """
        Match detected Special Issues to journals by normalized name or ISSN.
        Appends valid Special Issue deadlines directly into journal['submission_deadlines'].
        Returns total number of matched issues.
        """
        # Build index for fast lookup
        index_by_name = {}
        index_by_issn = {}

        for j in journals:
            k = normalize_title_key(j.get('name', ''))
            if k:
                index_by_name.setdefault(k, []).append(j)
            if j.get('issn'):
                index_by_issn[j['issn']] = j
            if j.get('eissn'):
                index_by_issn[j['eissn']] = j

        matched_count = 0
        current_year = datetime.now(timezone.utc).year

        for issue in special_issues:
            target_journal = None
            cand = issue.get('journal_candidate', '')
            norm_cand = normalize_title_key(cand)

            if norm_cand in index_by_name:
                target_journal = index_by_name[norm_cand][0]
            else:
                # Substring fuzzy match
                for name_key, j_list in index_by_name.items():
                    if len(norm_cand) >= 8 and (norm_cand in name_key or name_key in norm_cand):
                        target_journal = j_list[0]
                        break

            if target_journal:
                deadline_entry = normalize_deadline({
                    'year': current_year,
                    'deadline': issue['deadline'],
                    'comment': issue['comment'],
                    'link': issue.get('link')
                }, current_year=current_year)

                if deadline_entry:
                    deadlines = target_journal.setdefault('submission_deadlines', [])
                    # Deduplicate by deadline date and comment
                    if not any(d['deadline_dates']['deadline'] == deadline_entry['deadline_dates']['deadline']
                               and d['comment'] == deadline_entry['comment'] for d in deadlines):
                        deadlines.append(deadline_entry)
                        matched_count += 1

        return matched_count


class SCImagoSource:
    """Adapter for SCImago Journal & Country Rank CSV catalog and detail scopes."""

    @staticmethod
    def _parse_categories(raw_categories: str, raw_areas: str) -> list[str]:
        """Parse SCImago Categories/Areas into clean subject area names."""
        parsed = []
        if raw_categories:
            for part in raw_categories.split(';'):
                cleaned = re.sub(
                    r'\s*\(Q[1-4]\)\s*$', '', clean_text(part), flags=re.I
                )
                if cleaned:
                    parsed.append(cleaned)
        if not parsed and raw_areas:
            for part in raw_areas.split(';'):
                cleaned = clean_text(part)
                if cleaned:
                    parsed.append(cleaned)
        return unique_string_list(parsed)

    @staticmethod
    def _parse_issns(raw_issn: str) -> list[str]:
        """Split and normalize comma/semicolon/space separated ISSNs."""
        if not raw_issn:
            return []
        tokens = re.split(r'[,;\s]+', raw_issn)
        normalized = []
        for token in tokens:
            issn = normalize_issn(token)
            if issn:
                normalized.append(issn)
        return unique_string_list(normalized)

    @staticmethod
    def fetch_sjr_catalog(spider) -> list[dict]:
        """
        Fetch SCImago official semicolon-delimited CSV catalog and parse rows.
        Handles European decimal commas (e.g. '2,85' -> 2.85) and multi-ISSNs.
        """
        resp = spider.fetch(SJR_CSV_URL, timeout=30)
        csv_text = extract_response_text(resp)
        if not csv_text or ';' not in csv_text:
            return []

        reader = csv.reader(io.StringIO(csv_text), delimiter=';')
        header = next(reader, None)
        if not header:
            return []

        col_idx = {}
        for idx, col_name in enumerate(header):
            key = clean_text(col_name).lower()
            if key and key not in col_idx:
                col_idx[key] = idx

        def get_col(row: list[str], name: str) -> str:
            idx = col_idx.get(name)
            if idx is None or idx >= len(row):
                return ''
            return row[idx]

        rows = []
        for raw_row in reader:
            if not raw_row:
                continue
            title = clean_text(get_col(raw_row, 'title'))
            source_id = clean_text(get_col(raw_row, 'sourceid'))
            if not title:
                continue

            issns = SCImagoSource._parse_issns(get_col(raw_row, 'issn'))
            if not source_id and not issns:
                continue

            sjr_val = safe_float(get_col(raw_row, 'sjr'), default=0.0, digits=3)
            raw_quartile = clean_text(
                get_col(raw_row, 'sjr best quartile')
            ).upper()
            rank = (
                raw_quartile
                if raw_quartile in VALID_RANKS
                else normalize_rank(raw_quartile, sjr=sjr_val)
            )
            h_index = safe_int(get_col(raw_row, 'h index'), default=0)
            publisher = clean_text(get_col(raw_row, 'publisher'))
            raw_cats = get_col(raw_row, 'categories')
            raw_areas = get_col(raw_row, 'areas')
            subject_area = SCImagoSource._parse_categories(raw_cats, raw_areas)
            pub_type = clean_text(get_col(raw_row, 'type')).lower()

            rows.append({
                'source_id': source_id,
                'title': title,
                'type': pub_type,
                'issns': issns,
                'sjr': sjr_val,
                'scopus_rank': rank,
                'h_index': h_index,
                'publisher': publisher,
                'categories': clean_text(raw_cats),
                'areas': clean_text(raw_areas),
                'subject_area': subject_area,
            })

        return rows

    @staticmethod
    def match_sjr_to_journals(
        journals: list[dict],
        sjr_rows: list[dict],
        sjr_year: int = 2025
    ) -> dict[str, str]:
        """
        Match SJR rows to journals by ISSN/eISSN first, then unique title.
        Updates sjr, sjr_year, scopus_rank, h_index, publisher, subject_area.
        Returns mapping {journal_id: sjr_source_id}.
        """
        issn_index: dict[str, dict] = {}
        title_index: dict[str, list[dict]] = {}

        for row in sjr_rows:
            is_journal = (row.get('type') in ('', 'journal'))
            for issn in row.get('issns', []):
                if issn not in issn_index or is_journal:
                    issn_index[issn] = row
            t_key = normalize_title_key(row.get('title', ''))
            if t_key:
                title_index.setdefault(t_key, []).append(row)

        sjr_id_map: dict[str, str] = {}

        for journal in journals:
            matched_row = None
            for field in ('issn', 'eissn'):
                val = normalize_issn(journal.get(field))
                if val and val in issn_index:
                    matched_row = issn_index[val]
                    break

            if matched_row is None:
                t_key = normalize_title_key(journal.get('name', ''))
                candidates = title_index.get(t_key, [])
                if len(candidates) == 1:
                    matched_row = candidates[0]

            if matched_row is None:
                continue

            if matched_row.get('sjr', 0.0) > 0:
                journal['sjr'] = matched_row['sjr']
                journal['sjr_year'] = sjr_year

            rank = matched_row.get('scopus_rank')
            if rank in VALID_RANKS:
                journal['scopus_rank'] = rank

            if matched_row.get('h_index', 0) > 0:
                journal['h_index'] = matched_row['h_index']

            pub = matched_row.get('publisher')
            current_pub = clean_text(journal.get('publisher'))
            if pub and (not current_pub or current_pub == 'Unknown Publisher'):
                journal['publisher'] = pub

            sjr_subjects = matched_row.get('subject_area') or []
            if sjr_subjects:
                existing_subjects = journal.get('subject_area') or []
                if (
                    not existing_subjects
                    or existing_subjects == ['General Multidisciplinary']
                ):
                    journal['subject_area'] = sjr_subjects[:4]
                else:
                    merged = unique_string_list(
                        existing_subjects + sjr_subjects
                    )
                    journal['subject_area'] = merged[:6]

            sid = matched_row.get('source_id')
            jid = journal.get('id')
            if sid and jid:
                sjr_id_map[jid] = sid

        return sjr_id_map

    @staticmethod
    def _is_cloudflare_challenge(html_text: str) -> bool:
        """Detect Cloudflare / bot-verification interstitial pages."""
        lower = (html_text or '').lower()
        markers = (
            'cf-browser-verification',
            'just a moment...',
            'checking your browser',
            'attention required! | cloudflare',
        )
        return any(marker in lower for marker in markers)

    @staticmethod
    def extract_scope_from_detail_html(html_text: str) -> str | None:
        """
        Extract journal Scope paragraph from SCImago detail HTML page.
        Strips navigation/comment/advertisement elements cleanly.
        """
        if not html_text or SCImagoSource._is_cloudflare_challenge(html_text):
            return None

        soup = BeautifulSoup(html_text, 'html.parser')
        for tag in soup.find_all(['script', 'style', 'noscript', 'form', 'button']):
            tag.decompose()

        target_container = None
        heading_to_remove = None

        for heading in soup.find_all(['h1', 'h2', 'h3', 'h4']):
            h_text = clean_text(heading.get_text()).lower()
            if h_text == 'scope' or h_text.startswith('scope:'):
                heading_to_remove = heading
                target_container = heading.parent
                break

        if target_container is None:
            return None

        if heading_to_remove is not None:
            heading_to_remove.decompose()

        for anchor in target_container.find_all('a'):
            a_text = clean_text(anchor.get_text()).lower()
            classes = anchor.get('class') or []
            if 'join_comments_button' in classes or 'join the conversation' in a_text:
                anchor.decompose()

        raw_scope = clean_text(target_container.get_text(' ', strip=True))
        raw_scope = re.sub(
            r'\s*Join the conversation about this journal.*$',
            '',
            raw_scope,
            flags=re.I
        )
        raw_scope = clean_text(raw_scope)
        if len(raw_scope) < 20:
            return None
        return normalize_scope(raw_scope)

    @staticmethod
    def enrich_sjr_scopes_incremental(
        spider,
        journals: list[dict],
        sjr_id_map: dict[str, str],
        cache_path: Path | str,
        limit: int = 30
    ) -> dict:
        """
        Incrementally crawl SCImago detail pages for journals lacking SJR Scope.
        Stores results in cache_path and handles HTTP 403/Cloudflare gracefully.
        """
        cache_file = Path(cache_path)
        cache: dict[str, dict] = {}
        if cache_file.exists():
            try:
                loaded = json.loads(cache_file.read_text(encoding='utf-8'))
                if isinstance(loaded, dict):
                    cache = loaded
            except Exception as exc:
                logger.warning(f"Could not read SJR scope cache: {exc}")

        stats = {
            'cached_applied': 0,
            'newly_fetched': 0,
            'blocked': False,
            'errors': 0,
        }

        # 1. Apply previously cached SJR scopes immediately
        for journal in journals:
            sid = sjr_id_map.get(journal.get('id', ''))
            if not sid or sid not in cache:
                continue
            entry = cache[sid]
            cached_scope = (
                entry.get('scope') if isinstance(entry, dict) else entry
            )
            cleaned_scope = normalize_scope(cached_scope)
            if cleaned_scope:
                journal['scope'] = cleaned_scope
                stats['cached_applied'] += 1

        if limit <= 0:
            return stats

        # 2. Fetch uncached SJR scopes up to limit
        attempts = 0
        for journal in journals:
            if attempts >= limit:
                break
            sid = sjr_id_map.get(journal.get('id', ''))
            if not sid or sid in cache:
                continue

            attempts += 1
            url = SJR_DETAIL_URL.format(sid=quote(str(sid)))
            try:
                resp = spider.fetch(url, timeout=15)
                html_text = extract_response_text(resp)
                if SCImagoSource._is_cloudflare_challenge(html_text):
                    logger.warning(
                        f"Cloudflare challenge encountered at SJR sid={sid}; "
                        "pausing SJR scope crawl gracefully."
                    )
                    stats['blocked'] = True
                    stats['errors'] += 1
                    break

                scope_text = SCImagoSource.extract_scope_from_detail_html(
                    html_text
                )
                now_iso = datetime.now(timezone.utc).isoformat()
                if scope_text:
                    journal['scope'] = scope_text
                    cache[sid] = {'scope': scope_text, 'updated_at': now_iso}
                    stats['newly_fetched'] += 1
                else:
                    cache[sid] = {'scope': None, 'updated_at': now_iso}
            except SpiderError as exc:
                logger.warning(
                    f"SJR detail fetch blocked/failed for sid={sid}: {exc}"
                )
                stats['errors'] += 1
                if '403' in str(exc) or '429' in str(exc):
                    stats['blocked'] = True
                    break
            except Exception as exc:
                logger.warning(
                    f"Unexpected error fetching SJR sid={sid}: {exc}"
                )
                stats['errors'] += 1

        # 3. Persist updated cache safely
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(
                json.dumps(cache, ensure_ascii=False, indent=2) + '\n',
                encoding='utf-8'
            )
        except OSError as exc:
            logger.warning(f"Could not write SJR scope cache: {exc}")

        return stats
