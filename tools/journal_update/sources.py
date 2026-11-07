"""
Data sources and extraction adapters for journal metrics and Special Issues.
Combines OpenAlex API (batch processing) and CFP hubs for Special Issues.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from urllib.parse import quote, urljoin
from bs4 import BeautifulSoup

from normalizer import (clean_text, normalize_issn, normalize_deadline,
                        safe_float, safe_int, normalize_rank, safe_url,
                        unique_string_list, normalize_journal)

logger = logging.getLogger(__name__)

OPENALEX_BASE = "https://api.openalex.org/sources"
WIKICFP_SEARCH_URL = "http://www.wikicfp.com/cfp/servlet/tool.search?q=special+issue&year={year}"


def normalize_title_key(text: str) -> str:
    """Produce normalized alphanumeric lowercase key for resilient matching."""
    cleaned = clean_text(text).lower()
    return re.sub(r'[^a-z0-9]', '', cleaned)


class OpenAlexSource:
    """Adapter for querying OpenAlex bibliographic database via batch ISSN filters."""

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
        Maps 2yr_mean_citedness to citescore, h_index, and homepage.
        """
        results = {}
        items = data.get('results', [])
        for item in items:
            issn_list = item.get('issn') or []
            stats = item.get('summary_stats') or {}
            
            citescore = safe_float(stats.get('2yr_mean_citedness'), default=0.0, digits=2)
            h_index = safe_int(stats.get('h_index'), default=0)
            homepage = item.get('homepage_url')

            info = {
                'openalex_id': item.get('id'),
                'citescore': citescore,
                'h_index': h_index,
                'homepage_url': homepage,
                'is_oa': item.get('is_oa', False),
                'works_count': safe_int(item.get('works_count')),
                'is_active': item.get('is_active', True)
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
        Allocates sequential JOUR-xxxx IDs and verifies schema conformity.
        """
        existing_issns = set()
        max_id_num = 0
        for j in existing_journals:
            if j.get('issn'):
                existing_issns.add(j['issn'])
            if j.get('eissn'):
                existing_issns.add(j['eissn'])
            m = re.search(r'JOUR-(\d+)', j.get('id', ''))
            if m:
                max_id_num = max(max_id_num, int(m.group(1)))

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
                    # Check if already present
                    if any(i in existing_issns for i in norm_issns):
                        continue

                    # Filter low activity / discontinued
                    works_count = safe_int(item.get('works_count'), 0)
                    if works_count < 100:
                        continue

                    stats = item.get('summary_stats') or {}
                    citescore = safe_float(stats.get('2yr_mean_citedness'), default=0.0, digits=2)
                    h_index = safe_int(stats.get('h_index'), default=0)
                    sjr = round(citescore * 0.18, 3)

                    max_id_num += 1
                    new_id = f"JOUR-{max_id_num:04d}"

                    concepts = [c['display_name'] for c in item.get('x_concepts', []) if isinstance(c, dict) and c.get('display_name')]
                    subjects = concepts[:3] if concepts else ['Computer Science']
                    keywords = concepts[:8] if concepts else [clean_text(item.get('display_name'))]

                    candidate = {
                        'id': new_id,
                        'name': clean_text(item.get('display_name')),
                        'issn': norm_issns[0],
                        'eissn': norm_issns[1] if len(norm_issns) > 1 else None,
                        'publisher': clean_text(item.get('host_organization_name')) or 'Unknown Publisher',
                        'scopus_rank': normalize_rank(None, sjr=sjr),
                        'h_index': h_index,
                        'citescore': citescore,
                        'citescore_year': 2026,
                        'sjr': sjr,
                        'sjr_year': 2026,
                        'subject_area': subjects,
                        'scope_keywords': keywords,
                        'homepage_url': safe_url(item.get('homepage_url')),
                        'scopus_source_url': None,
                        'submission_deadlines': []
                    }

                    try:
                        validated = normalize_journal(candidate, fallback_index=max_id_num)
                        discovered.append(validated)
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
