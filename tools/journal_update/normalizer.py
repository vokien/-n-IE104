"""
Data normalization, schema validation, and defensive sanitization for journal data.
Handles all known edge cases in data/jour.json and incoming Special Issues metadata.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlsplit


ISSN_PATTERN = re.compile(r'^\d{4}-\d{3}[\dX]$', re.IGNORECASE)
VALID_RANKS = {'Q1', 'Q2', 'Q3', 'Q4'}
ALLOWED_KEYS = {
    'id', 'name', 'issn', 'eissn', 'publisher', 'scopus_rank',
    'h_index', 'citescore', 'citescore_year', 'sjr', 'sjr_year',
    'subject_area', 'scope_keywords', 'homepage_url', 'scopus_source_url',
    'submission_deadlines'
}


class ValidationError(ValueError):
    """Raised when a journal record fails non-recoverable schema constraints."""
    pass


def clean_text(value: any) -> str:
    """Normalize whitespace and unicode text."""
    if value is None:
        return ''
    text = str(value)
    text = unicodedata.normalize('NFC', text)
    # Replace control characters with space
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', text)
    return ' '.join(text.split()).strip()


def normalize_issn(value: any) -> str | None:
    """Validate and format 8-digit ISSN with hyphen: 1234-5678 or 1234-567X."""
    if not value:
        return None
    raw = str(value).strip().upper()
    # Strip any extra spaces or dots
    cleaned = re.sub(r'[^0-9X]', '', raw)
    if len(cleaned) == 8:
        formatted = f"{cleaned[:4]}-{cleaned[4:]}"
        if ISSN_PATTERN.match(formatted):
            return formatted
    return None


def normalize_rank(value: any, sjr: float = 0.0) -> str:
    """Strictly resolve Scopus rank to Q1, Q2, Q3, or Q4."""
    if value:
        text = str(value).strip().upper()
        match = re.search(r'\b(Q[1-4])\b', text)
        if match:
            return match.group(1)
    # Fallback estimation from SJR if rank missing
    if sjr >= 0.7:
        return 'Q1'
    if sjr >= 0.4:
        return 'Q2'
    if sjr >= 0.2:
        return 'Q3'
    return 'Q4'


def safe_float(value: any, default: float = 0.0, digits: int = 3) -> float:
    """Convert mixed string/float/int into safe non-negative float."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        if value < 0 or value != value:  # handle negative or NaN
            return default
        return round(float(value), digits)
    try:
        # Support European comma as decimal separator: '1,23' -> 1.23
        text = str(value).strip().replace(',', '.')
        val = float(text)
        if val < 0 or val != val:
            return default
        return round(val, digits)
    except (ValueError, TypeError):
        return default


def safe_int(value: any, default: int = 0) -> int:
    """Convert mixed string/int into safe non-negative integer."""
    if value is None:
        return default
    if isinstance(value, int):
        return max(0, value)
    try:
        text = re.sub(r'\D', '', str(value).split('.')[0])
        return int(text) if text else default
    except (ValueError, TypeError):
        return default


def safe_url(value: any) -> str | None:
    """Ensure valid http or https URL format."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    try:
        parsed = urlsplit(text)
        if parsed.scheme in ('http', 'https') and parsed.netloc:
            return text
    except Exception:
        pass
    return None


def unique_string_list(items: any) -> list[str]:
    """Deduplicate string list preserving order, removing empty items."""
    if not items:
        return []
    if isinstance(items, str):
        items = [items]
    seen = set()
    result = []
    for item in items:
        text = clean_text(item)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            result.append(text)
    return result


def normalize_deadline(dl: dict, current_year: int = 2026) -> dict | None:
    """Normalize a Special Issue deadline object compatible with conference schema."""
    if not isinstance(dl, dict):
        return None
    
    comment = clean_text(dl.get('comment', 'Special Issue'))
    link = safe_url(dl.get('link'))
    year = safe_int(dl.get('year'), default=current_year)
    
    raw_stamp = dl.get('deadline')
    date_str = None
    iso_stamp = None
    
    if raw_stamp:
        try:
            # Parse ISO or standard date formats
            stamp_str = str(raw_stamp).strip()
            # If date only YYYY-MM-DD
            if re.match(r'^\d{4}-\d{2}-\d{2}$', stamp_str):
                date_str = stamp_str
                iso_stamp = f"{date_str}T23:59:59-12:00"  # AoE time standard
            else:
                # Try parsing with datetime
                clean_stamp = stamp_str.replace('Z', '+00:00')
                dt = datetime.fromisoformat(clean_stamp)
                date_str = dt.strftime('%Y-%m-%d')
                iso_stamp = dt.isoformat()
        except Exception:
            pass

    # Check fallback in deadline_dates
    if not date_str and isinstance(dl.get('deadline_dates'), dict):
        fallback_date = dl['deadline_dates'].get('deadline')
        if fallback_date and re.match(r'^\d{4}-\d{2}-\d{2}$', str(fallback_date)):
            date_str = str(fallback_date)
            iso_stamp = f"{date_str}T23:59:59-12:00"

    if not date_str or not iso_stamp:
        return None

    res = {
        'year': year,
        'deadline': iso_stamp,
        'comment': comment,
        'deadline_dates': {
            'deadline': date_str
        }
    }
    if link:
        res['link'] = link
    return res


def normalize_journal(record: dict, fallback_index: int = 1) -> dict:
    """
    Sanitize and strictly validate a single journal entry.
    Never crashes on malformed edge cases; provides safe defaults.
    """
    if not isinstance(record, dict):
        raise ValidationError('Journal record must be a dictionary')

    # 1. Identity & Name
    jid = clean_text(record.get('id'))
    if not jid:
        jid = f"JOUR-{fallback_index:04d}"

    name = clean_text(record.get('name'))
    if not name:
        raise ValidationError(f'Journal {jid} is missing a valid name')

    # 2. ISSN & eISSN (Must have at least one valid identifier)
    issn = normalize_issn(record.get('issn'))
    eissn = normalize_issn(record.get('eissn'))
    if not issn and not eissn:
        # If neither matches standard, attempt soft extraction
        raw_i = re.sub(r'[^0-9X]', '', str(record.get('issn') or ''))
        raw_e = re.sub(r'[^0-9X]', '', str(record.get('eissn') or ''))
        if len(raw_i) == 8:
            issn = f"{raw_i[:4]}-{raw_i[4:]}"
        elif len(raw_e) == 8:
            eissn = f"{raw_e[:4]}-{raw_e[4:]}"

    # 3. Publisher
    publisher = clean_text(record.get('publisher')) or 'Unknown Publisher'

    # 4. Metrics
    sjr = safe_float(record.get('sjr'), default=0.0, digits=3)
    citescore = safe_float(record.get('citescore'), default=0.0, digits=1)
    h_index = safe_int(record.get('h_index'), default=0)
    
    current_year = 2026
    citescore_year = safe_int(record.get('citescore_year'), default=current_year - 1)
    sjr_year = safe_int(record.get('sjr_year'), default=current_year - 1)

    # 5. Scopus Rank (Q1 - Q4)
    scopus_rank = normalize_rank(record.get('scopus_rank'), sjr=sjr)

    # 6. Subjects and Keywords
    subject_area = unique_string_list(record.get('subject_area'))
    if not subject_area:
        subject_area = ['General Multidisciplinary']

    scope_keywords = unique_string_list(record.get('scope_keywords'))

    # 7. URLs
    homepage_url = safe_url(record.get('homepage_url'))
    scopus_source_url = safe_url(record.get('scopus_source_url'))

    output = {
        'id': jid,
        'name': name,
        'issn': issn,
        'eissn': eissn,
        'publisher': publisher,
        'scopus_rank': scopus_rank,
        'h_index': h_index,
        'citescore': citescore,
        'citescore_year': citescore_year,
        'sjr': sjr,
        'sjr_year': sjr_year,
        'subject_area': subject_area,
        'scope_keywords': scope_keywords,
        'homepage_url': homepage_url,
        'scopus_source_url': scopus_source_url,
    }

    # 8. Special Issues (Submission Deadlines) - Option B
    deadlines = record.get('submission_deadlines')
    if isinstance(deadlines, list) and deadlines:
        norm_deadlines = [normalize_deadline(dl, current_year) for dl in deadlines]
        valid_deadlines = [d for d in norm_deadlines if d is not None]
        if valid_deadlines:
            output['submission_deadlines'] = valid_deadlines

    return output


def normalize_all(records: list[dict]) -> tuple[list[dict], dict]:
    """
    Sanitize an entire list of journal records.
    Returns (cleaned_records, diagnostic_report).
    """
    cleaned = []
    report = {
        'total_input': len(records),
        'accepted': 0,
        'rejected': 0,
        'rank_counts': {'Q1': 0, 'Q2': 0, 'Q3': 0, 'Q4': 0},
        'with_deadlines': 0,
        'errors': []
    }

    seen_ids = set()

    for idx, rec in enumerate(records, start=1):
        try:
            item = normalize_journal(rec, fallback_index=idx)
            # Guarantee ID uniqueness
            if item['id'] in seen_ids:
                item['id'] = f"{item['id']}-{idx}"
            seen_ids.add(item['id'])

            cleaned.append(item)
            report['accepted'] += 1
            report['rank_counts'][item['scopus_rank']] += 1
            if 'submission_deadlines' in item:
                report['with_deadlines'] += 1
        except Exception as e:
            report['rejected'] += 1
            report['errors'].append({'index': idx, 'error': str(e)})

    return cleaned, report
