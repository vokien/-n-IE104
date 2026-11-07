"""Offline venue cleaning shared by notebooks 13 and 14; no source writes."""
from __future__ import annotations

import copy
import hashlib
import ipaddress
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

import pandas as pd

COMMON = ['id', 'name', 'issn', 'eissn', 'publisher', 'h_index',
          'citescore', 'citescore_year', 'sjr', 'sjr_year', 'subject_area',
          'scope_keywords', 'homepage_url', 'scopus_source_url']
SCHEMAS = {'journal': set(COMMON + ['scopus_rank']),
           'conference': set(COMMON + ['acronym', 'core_rank', 'submission_deadlines']) -
                         {'h_index', 'citescore', 'citescore_year', 'sjr', 'sjr_year', 'scopus_source_url'}}
FILENAMES = {'journal': 'jour.json', 'conference': 'conf.json'}
NUMBERS = ('h_index', 'citescore', 'sjr', 'citescore_year', 'sjr_year')
ARRAYS = ('subject_area', 'scope_keywords', 'submission_deadlines')
MARKERS = {'', '?', '.', 'n/a', 'na', 'nan', 'nat', 'null', 'none', 'non'}
MEANINGS = {
    'id': 'Mã JOUR-XXXX hoặc CONF-XXX; giữ nguyên định danh đầu vào',
    'name': 'Tên đầy đủ của tạp chí hoặc hội nghị',
    'acronym': 'Tên viết tắt của hội nghị',
    'type': 'Loại venue: journal hoặc conference',
    'issn': 'ISSN bản in của nguồn xuất bản',
    'eissn': 'ISSN bản điện tử của nguồn xuất bản',
    'publisher': 'Nhà xuất bản tạp chí hoặc proceedings của hội nghị',
    'scopus_rank': 'Q1–Q4 theo SCImago SJR Best Quartile của journal',
    'core_rank': 'Hạng ICORE2026: A*, A, B, C, nhãn gốc như National: japan hoặc null',
    'h_index': 'H-index tích lũy của nguồn xuất bản khớp SCImago',
    'citescore': 'CiteScore của nguồn xuất bản theo Scopus',
    'citescore_year': 'Năm của CiteScore, dạng số nguyên hoặc null',
    'sjr': 'SJR; ưu tiên SCImago, Scopus là nguồn dự phòng',
    'sjr_year': 'Năm của SJR, dạng số nguyên hoặc null',
    'subject_area': 'Danh sách ngành theo nhãn ASJC của Scopus',
    'scope_keywords': 'Danh sách chủ đề có sẵn trong nguồn thu thập, không tự suy diễn',
    'submission_deadlines': 'Các kỳ/vòng và mốc thời gian; có timeline chưa chắc có hạn nộp bài',
    'homepage_url': 'Trang chủ tạp chí hoặc trang kỳ hội nghị; chỉ kiểm tra cú pháp URL',
    'scopus_source_url': 'Liên kết hồ sơ nguồn xuất bản trên Scopus',
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def text(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', value)).strip()


def key(value):
    return unicodedata.normalize('NFKC', text(value)).casefold()


def missing(value):
    return value is None or value == '' or value == []


def change(row, field, value, reason, audit, path=None):
    before = row.get(field)
    if type(before) is not type(value) or before != value:
        audit['changes'].append({'id': audit.get('current_id', row.get('id')),
                                 'field': path or field, 'before': copy.deepcopy(before),
                                 'after': copy.deepcopy(value), 'reason': reason})
        row[field] = value


def issue(audit, record_id, field, reason, value=None):
    audit['issues'].append({'id': record_id, 'field': field, 'reason': reason,
                            'value': copy.deepcopy(value)})


def load_input(path, kind):
    path = Path(path)
    rows = json.loads(path.read_text(encoding='utf-8'))
    # Preserve archived files on disk while accepting their legacy type tag.
    ignored = []
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and 'type' in row:
                if row['type'] != kind:
                    raise ValueError(f"Source type does not match selected schema: {row.get('id')}")
                row.pop('type')
                ignored = ['type']
    check_structure(rows, kind)
    return rows, {'input_path': str(path.resolve()), 'input_sha256': digest(path),
                  'kind': kind, 'ignored_input_fields': ignored, 'changes': [], 'issues': []}


def check_structure(rows, kind):
    if kind not in SCHEMAS or not isinstance(rows, list) or not rows:
        raise ValueError('Expected a nonempty journal or conference array')
    pattern = r'JOUR-\d{4,}' if kind == 'journal' else r'CONF-\d{3,}'
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != SCHEMAS[kind]:
            raise ValueError('Unexpected venue schema')
        identifier = row['id']
        if (not isinstance(identifier, str) or not re.fullmatch(pattern, identifier)
                or int(identifier.split('-')[1]) == 0 or identifier in seen):
            raise ValueError(f'Invalid or duplicate ID: {identifier}')
        if not isinstance(row['name'], str) or not text(row['name']):
            raise ValueError(f'Invalid required metadata: {identifier}')
        seen.add(identifier)


def normalize_missing(rows, audit):
    for row in rows:
        for field, value in list(row.items()):
            if field in ('id', 'name', 'type', 'acronym'):
                continue
            is_marker = isinstance(value, str) and value.strip().casefold() in MARKERS
            if value is None or is_marker:
                change(row, field, [] if field in ARRAYS else None, 'missing_value', audit)


def normalize_text(rows, audit):
    for row in rows:
        for field in ('name', 'acronym', 'publisher'):
            if field in row and row[field] is not None:
                if not isinstance(row[field], str):
                    raise ValueError(f"{row['id']}: {field} must be text")
                cleaned = text(row[field])
                change(row, field, cleaned or None, 'unicode_whitespace', audit)


def valid_issn(value):
    if not re.fullmatch(r'\d{7}[\dX]', value):
        return False
    total = sum(int(c) * w for c, w in zip(value[:7], range(8, 1, -1)))
    return (total + (10 if value[-1] == 'X' else int(value[-1]))) % 11 == 0


def normalize_identifiers(rows, audit):
    for row in rows:
        for field in ('issn', 'eissn'):
            value = row[field]
            if value is None:
                continue
            compact = re.sub(r'[-\s]', '', str(value)).upper()
            cleaned = compact[:4] + '-' + compact[4:] if valid_issn(compact) else None
            if cleaned is None:
                issue(audit, row['id'], field, 'invalid_issn_checksum', value)
            change(row, field, cleaned, 'issn_format_or_invalid', audit)
        rank_field = 'scopus_rank' if audit['kind'] == 'journal' else 'core_rank'
        value = row[rank_field]
        if value is None:
            continue
        rank = text(str(value)).upper()
        if rank_field == 'scopus_rank':
            cleaned = rank if rank in {'Q1', 'Q2', 'Q3', 'Q4'} else None
        else:
            cleaned = (rank if rank in {'A*', 'A', 'B', 'C'} else
                       None if re.match(r'^un[\s_-]*ranked\b', rank, flags=re.I) else text(str(value)))
        if cleaned is None:
            issue(audit, row['id'], rank_field, 'unranked_or_invalid', value)
        change(row, rank_field, cleaned, 'rank_format', audit)


def normalize_numbers(rows, audit):
    for row in rows:
        for field in NUMBERS:
            if field not in row:
                continue
            value = row[field]
            if value is None:
                continue
            try:
                if isinstance(value, bool):
                    raise ValueError('Boolean is not a metric')
                numeric = float(value)
                if not math.isfinite(numeric) or numeric < 0:
                    raise ValueError('Nonfinite or negative metric')
                if field == 'h_index' or field.endswith('_year'):
                    if not numeric.is_integer() or (field.endswith('_year') and not 1000 <= numeric <= 9999):
                        raise ValueError('Invalid integer/year')
                    cleaned = int(numeric)
                else:
                    cleaned = numeric
            except (ValueError, TypeError, OverflowError):
                cleaned = None
                issue(audit, row['id'], field, 'invalid_number', value)
            change(row, field, cleaned, 'numeric_type_or_invalid', audit)
        for metric in ('citescore', 'sjr'):
            if metric not in row:
                continue
            year = metric + '_year'
            if row[metric] is None and row[year] is not None:
                change(row, year, None, 'year_without_metric', audit)
            elif row[metric] is not None and row[year] is None:
                issue(audit, row['id'], year, 'metric_without_year', row[metric])


def normalize_lists(rows, audit):
    for row in rows:
        for field in ('subject_area', 'scope_keywords'):
            if field not in row:
                continue
            values = row[field]
            if not isinstance(values, list):
                raise ValueError(f"{row['id']}: {field} must be an array")
            seen, cleaned = set(), []
            for value in values:
                if not isinstance(value, str):
                    issue(audit, row['id'], field, 'nontext_list_element', value)
                    continue
                term = text(value)
                normalized = key(term)
                if term and normalized not in seen:
                    seen.add(normalized)
                    cleaned.append(term)
            change(row, field, cleaned, 'list_cleanup_deduplication', audit)


def valid_url(value):
    try:
        parts = urlsplit(value)
        if parts.scheme not in ('http', 'https') or not parts.hostname or re.search(r'\s', value):
            return False
        if parts.username or parts.password:
            return False
        parts.port  # Validate numeric port syntax.
        host = parts.hostname.encode('idna').decode('ascii')
        try:
            ipaddress.ip_address(host)
            return True
        except ValueError:
            return ('.' in host and all(re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?', x)
                                        for x in host.rstrip('.').split('.')))
    except (ValueError, UnicodeError):
        return False


def clean_url(value):
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    cleaned = unicodedata.normalize('NFC', value).strip()
    cleaned = cleaned.translate({ord(c): None for c in '\u00ad\u200b\ufeff'})
    if valid_url(cleaned):
        return cleaned
    candidates = {s for s in re.findall(r'https?://[^\s<>"\']+', cleaned) if valid_url(s)}
    # Reject invented domain completion; recover only a complete URL present in source.
    return next(iter(candidates)) if len(candidates) == 1 else None


def normalize_urls(rows, audit):
    for row in rows:
        for field in ('homepage_url', 'scopus_source_url'):
            if field not in row:
                continue
            value = row[field]
            cleaned = clean_url(value)
            if value is not None and cleaned is None:
                issue(audit, row['id'], field, 'unrecoverable_url', value)
            change(row, field, cleaned, 'url_syntax', audit)


def utc_timestamp(value):
    if not isinstance(value, str) or not re.match(r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}', value):
        raise ValueError('Full date/time is required')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timezone is required')
    return parsed.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def fixed_offset_timestamp(value, zone):
    if not isinstance(value, str) or not re.match(r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}', value):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is not None:
            return utc_timestamp(value)
        match = re.fullmatch(r'(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?', str(zone).strip(), re.I)
        if zone in ('UTC', 'GMT'):
            offset = 0
        elif match:
            hours, minutes = int(match[2]), int(match[3] or 0)
            if hours > 14 or minutes > 59 or (hours == 14 and minutes):
                return None
            offset = (hours * 60 + minutes) * (1 if match[1] == '+' else -1)
        else:
            return None
        parsed = parsed.replace(tzinfo=timezone(timedelta(minutes=offset)))
        return parsed.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError):
        return None


def normalize_timelines(rows, audit):
    if audit['kind'] != 'conference':
        return
    for row in rows:
        if not isinstance(row['submission_deadlines'], list):
            raise ValueError('submission_deadlines must be an array')
        for i, timeline in enumerate(row['submission_deadlines']):
            if not isinstance(timeline, dict):
                raise ValueError('A timeline round must be an object')
            audit['current_id'] = row['id']
            prefix = f'submission_deadlines[{i}]'
            if 'link' in timeline:
                cleaned = clean_url(timeline['link'])
                if timeline['link'] is not None and cleaned is None:
                    issue(audit, row['id'], prefix + '.link', 'unrecoverable_url', timeline['link'])
                change(timeline, 'link', cleaned, 'url_syntax', audit, prefix + '.link')
            statuses = timeline.get('utc_status', {})
            dates = timeline.get('deadline_dates', {})
            originals = timeline.get('original_deadlines', {})
            for field, status in list(statuses.items()):
                if status == 'converted':
                    try:
                        cleaned = utc_timestamp(timeline.get(field))
                    except (ValueError, TypeError):
                        raise ValueError(f"{row['id']}: invalid converted timestamp in {prefix}.{field}")
                    change(timeline, field, cleaned, 'utc_format', audit, prefix + '.' + field)
                elif status == 'date_only':
                    date.fromisoformat(dates[field])
                    if timeline.get(field) is not None:
                        raise ValueError('Date-only timestamp must remain null')
                elif status in ('unsupported_timezone', 'missing_timezone'):
                    zone = timeline.get('original_timezones', {}).get(field, timeline.get('original_timezone'))
                    cleaned = fixed_offset_timestamp(originals.get(field), zone)
                    if cleaned:
                        change(timeline, field, cleaned, 'explicit_fixed_timezone_to_utc', audit, prefix + '.' + field)
                        change(statuses, field, 'converted', 'explicit_fixed_timezone_to_utc', audit,
                               prefix + '.utc_status.' + field)
                    else:
                        issue(audit, row['id'], prefix + '.' + field, 'unresolved_timezone', originals.get(field))
            if any(s == 'converted' for s in statuses.values()):
                change(timeline, 'timezone', 'UTC', 'utc_format', audit, prefix + '.timezone')
    audit.pop('current_id', None)


def frame(rows):
    result = pd.DataFrame(rows)
    for field in NUMBERS:
        if field not in result:
            continue
        result[field] = pd.array(result[field], dtype='Int64' if field == 'h_index' or field.endswith('_year') else 'Float64')
    return result


def profile(rows):
    result = {'records': len(rows), 'field_count': len(rows[0]), 'fields': list(rows[0]),
              'missing': {f: sum(missing(r[f]) for r in rows) for f in rows[0]},
              'numeric': {}, 'outliers': [], 'duplicate_names': [], 'duplicate_terms': {}}
    names = defaultdict(list)
    for row in rows:
        names[key(row['name'])].append(row['id'])
    result['duplicate_names'] = [{'name_key': k, 'ids': ids} for k, ids in names.items() if len(ids) > 1]
    for field in ('subject_area', 'scope_keywords'):
        if field not in rows[0]:
            continue
        result['duplicate_terms'][field] = sum(len(terms) - len({key(v) for v in terms if isinstance(v, str) and text(v)})
            for r in rows if isinstance((terms := r[field]), list))
    for field in NUMBERS:
        if field not in rows[0]:
            continue
        values = pd.to_numeric(pd.Series([r[field] for r in rows]), errors='coerce').dropna()
        values = values[values.map(math.isfinite)]
        if values.empty:
            result['numeric'][field] = None
            continue
        q1, q3 = float(values.quantile(.25)), float(values.quantile(.75))
        lower, upper = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)
        result['numeric'][field] = {'count': int(values.count()), 'min': float(values.min()),
            'max': float(values.max()), 'mean': float(values.mean()), 'median': float(values.median()),
            'q1': q1, 'q3': q3, 'iqr_lower': lower, 'iqr_upper': upper}
        if field in ('citescore', 'sjr', 'h_index'):
            for row in rows:
                try:
                    value = float(row[field])
                except (ValueError, TypeError):
                    continue
                if math.isfinite(value) and (value < lower or value > upper):
                    result['outliers'].append({'id': row['id'], 'field': field, 'value': value})
    if 'submission_deadlines' in rows[0]:
        result['timelines'] = {
            'conferences_with_timeline': sum(bool(r['submission_deadlines']) for r in rows),
            'conferences_with_submission_deadline': sum(any(t.get('deadline') or t.get('deadline_dates', {}).get('deadline')
                for t in r['submission_deadlines']) for r in rows),
            'rounds': sum(len(r['submission_deadlines']) for r in rows),
            'primary_deadline_status': dict(Counter(t.get('utc_status', {}).get('deadline', 'not_provided')
                for r in rows for t in r['submission_deadlines'])),
        }
    return result


def validate(rows, kind, original):
    check_structure(rows, kind)
    if [r['id'] for r in rows] != [r['id'] for r in original]:
        raise ValueError('Venue order, count or IDs changed')
    for row, source in zip(rows, original):
        for field in NUMBERS:
            if field not in row:
                continue
            value = row[field]
            if value is not None:
                assert not isinstance(value, bool) and isinstance(value, (int, float))
                assert math.isfinite(value) and value >= 0
                if field == 'h_index' or field.endswith('_year'):
                    assert type(value) is int
        for field in ('subject_area', 'scope_keywords'):
            if field not in row:
                continue
            assert isinstance(row[field], list)
            assert all(isinstance(v, str) and text(v) == v and v for v in row[field])
            assert len(row[field]) == len({key(v) for v in row[field]})
        for field in ('issn', 'eissn'):
            assert row[field] is None or (re.fullmatch(r'\d{4}-\d{3}[\dX]', row[field]) and valid_issn(row[field].replace('-', '')))
        for field in ('homepage_url', 'scopus_source_url'):
            if field not in row:
                continue
            assert row[field] is None or valid_url(row[field])
        rank_field = 'scopus_rank' if kind == 'journal' else 'core_rank'
        if kind == 'journal':
            assert row[rank_field] in {'Q1', 'Q2', 'Q3', 'Q4', None}
        else:
            assert row[rank_field] is None or (isinstance(row[rank_field], str)
                and text(row[rank_field]) == row[rank_field] and bool(row[rank_field])
                and not re.match(r'^un[\s_-]*ranked\b', row[rank_field], flags=re.I))
        if kind == 'conference':
            assert len(row['submission_deadlines']) == len(source['submission_deadlines'])
            for timeline, raw in zip(row['submission_deadlines'], source['submission_deadlines']):
                for field in ('original_deadlines', 'original_timezone', 'original_timezones'):
                    assert timeline.get(field) == raw.get(field)
                for field, status in timeline.get('utc_status', {}).items():
                    if status == 'converted':
                        assert timeline[field] == utc_timestamp(timeline[field])
                        assert timeline.get('timezone') == 'UTC'
                    elif status == 'date_only':
                        assert timeline.get(field) is None
                        date.fromisoformat(timeline['deadline_dates'][field])
    json.dumps(rows, ensure_ascii=False, allow_nan=False)


def run_cleaning(original, audit):
    rows = copy.deepcopy(original)
    for step in (normalize_missing, normalize_text, normalize_identifiers,
                 normalize_numbers, normalize_lists, normalize_urls, normalize_timelines):
        step(rows, audit)
    validate(rows, audit['kind'], original)
    return rows


