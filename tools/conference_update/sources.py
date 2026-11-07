"""Pure source parsing/matching migrated from the verified TV3 collectors."""
import copy
import csv
import json
import re
import unicodedata
import zipfile
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode, urljoin, urlparse, parse_qs
from zoneinfo import ZoneInfo
import yaml
from bs4 import BeautifulSoup
from wiki_extract import extract as extract_wiki_cfp

PORTAL = 'https://portal.core.edu.au'
BASE = 'http://www.wikicfp.com'
CORE_COLUMNS = ('id', 'name', 'acronym', 'source', 'rank', 'dblp', 'primary_for', 'secondary_for', 'tertiary_for')
STOP_WORDS = set('a an and of on the for in international conference symposium workshop annual ieee acm ifip usenix joint proceedings'.split())
STOP = set('the a an of on and for in annual international conference symposium ieee acm ifip proceedings proceeding society computer technical report'.split())
TIME_FIELDS = ('deadline', 'abstract_deadline', 'decision_deadline', 'camera_ready_deadline', 'rebuttal_deadline')

class SourceLoader(yaml.SafeLoader):
    pass

SourceLoader.yaml_implicit_resolvers = {
    key: [(tag, pattern) for tag, pattern in value if tag != 'tag:yaml.org,2002:timestamp']
    for key, value in yaml.SafeLoader.yaml_implicit_resolvers.items()
}

def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def read_core(path):
    rows = []
    with Path(path).open(encoding='utf-8-sig', newline='') as handle:
        for number, values in enumerate(csv.reader(handle), 1):
            if not values:
                continue
            if len(values) != len(CORE_COLUMNS) or not values[0].isdigit():
                raise ValueError(f'Unexpected CORE export layout at row {number}: {values}')
            row = dict(zip(CORE_COLUMNS, values))
            if row['source'] != 'ICORE2026':
                raise ValueError(f"Wrong ranking source: {row['source']}")
            row['portal_url'] = f"{PORTAL}/conf-ranks/{row['id']}/"
            rows.append(row)
    if not rows or len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Empty CORE input or duplicate portal IDs')
    return rows


def construct_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'Duplicate YAML key: {key}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


def read_ccf(archive, raw_directory):
    records, categories = [], []
    raw_directory = Path(raw_directory)
    raw_directory.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        for member in sorted(zipped.namelist()):
            relative = member.split('/', 1)[-1]
            path = PurePosixPath(relative)
            if '..' in path.parts or path.is_absolute():
                raise ValueError('Unsafe GitHub archive path')
            if relative in ('LICENSE', 'README.md'):
                destination = raw_directory.parent / relative
                destination.write_bytes(zipped.read(member))
                continue
            if not relative.startswith('conference/') or not relative.endswith(('.yml', '.yaml')):
                continue
            data = zipped.read(member)
            destination = raw_directory / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            loaded = yaml.load(data, Loader=SourceLoader)
            if not isinstance(loaded, list) or not all(isinstance(r, dict) for r in loaded):
                raise ValueError(f'Unexpected YAML structure: {relative}')
            if path.name == 'types.yml':
                categories = loaded
                continue
            for number, record in enumerate(loaded):
                if not all(k in record for k in ('title', 'description', 'dblp', 'confs')):
                    raise ValueError(f'Missing required metadata: {relative}')
                if not isinstance(record['confs'], list):
                    raise ValueError(f'Expected list of editions: {relative}')
                records.append({'source_file': relative, 'source_index': number, 'data': record})
    if not records or not categories:
        raise ValueError('Empty conference or subject-category input')
    return records, categories


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold() if c.isalnum())


def acronym_keys(value):
    value = str(value).strip()
    result = {normalize(value)}
    stripped = re.sub(r'^(?:(?:IEEE|ACM|IFIP|USENIX)[\s/_-]+)+', '', value, flags=re.I)
    result.add(normalize(stripped))
    result.add(normalize(re.sub(r'\([^)]*\)', '', stripped)))
    return result - {''}


def dblp_key(value):
    if not value:
        return None
    value = str(value).strip().strip('/')
    if '://' in value:
        path = urlparse(value).path
        match = re.fullmatch(r'/db/(conf|journals)/([^/]+)(?:/|/index\.html)?', path)
        return (match[1], match[2].casefold()) if match else None
    if '/' not in value:
        return ('conf', value.casefold())
    match = re.match(r'(?:db/)?(conf|journals)/([^/]+)', value)
    return (match[1], match[2].casefold()) if match else None


def name_tokens(value):
    # Parenthetic rename/organizer notes are retained in output but omitted from the name key.
    value = re.sub(r'\([^)]*\)', '', str(value).casefold())
    return frozenset(re.findall(r'[a-z0-9]+', value)) - STOP_WORDS


def organizations(value):
    return set(re.findall(r'\b(?:ieee|acm|ifip|usenix)\b', str(value).casefold()))


def compatible_names(left, right):
    a, b = organizations(left), organizations(right)
    return not (a and b and a.isdisjoint(b))


def match_record(record, core):
    """DBLP identity first; exact names for duplicate acronyms; no fuzzy autojoin."""
    data = record['data']
    key = dblp_key(data.get('dblp'))
    acronyms = [r for r in core if acronym_keys(data['title']) & acronym_keys(r['acronym'])]
    names = [r for r in core if name_tokens(data['description']) and
             name_tokens(data['description']) == name_tokens(r['name']) and
             compatible_names(data['description'], r['name'])]
    identity = [r for r in core if key and dblp_key(r.get('dblp_url')) == key]
    # A repository can contain an erroneous/shared DBLP slug. Require independent
    # acronym or full-name support rather than assigning a sibling conference.
    supported = [r for r in identity if r in acronyms or r in names]
    if len(supported) == 1:
        return supported[0], 'exact_dblp_supported_by_identity', []
    if len(supported) > 1:
        return None, 'ambiguous_dblp', supported
    narrowed = [r for r in acronyms if r in names]
    if len(narrowed) == 1:
        row = narrowed[0]
        other = dblp_key(row.get('dblp_url'))
        method = 'exact_acronym_and_name_dblp_conflict' if key and other and key != other else 'exact_acronym_and_name'
        return row, method, []
    if len(names) == 1:
        row = names[0]
        other = dblp_key(row.get('dblp_url'))
        if key and other and key != other:
            return None, 'name_match_dblp_conflict', [row]
        return row, 'exact_name', []
    if len(acronyms) == 1:
        row = acronyms[0]
        other = dblp_key(row.get('dblp_url'))
        if key and other and key != other:
            return None, 'acronym_match_dblp_conflict', [row]
        a, b = name_tokens(data['description']), name_tokens(row['name'])
        overlap = len(a & b) / max(1, min(len(a), len(b)))
        if overlap >= 0.6 and compatible_names(data['description'], row['name']):
            return row, 'unique_acronym_supported_by_name', []
        return None, 'acronym_needs_identity_review', [row]
    if acronyms or names:
        return None, 'ambiguous_name_or_acronym', acronyms or names
    if identity:
        return None, 'dblp_match_needs_identity_review', identity
    return None, 'not_matched', []


SourceLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping)

@lru_cache(maxsize=8192)
def name_key(value, acronym=''):
    text = re.sub(r'\([^)]*\)', ' ', str(value).casefold())
    text = re.sub(r'\b(?:19|20)\d{2}\b|\b\d+(?:st|nd|rd|th)\b', ' ', text)
    words = re.findall(r'[a-z0-9]+', text)
    acronym_words = set(re.findall(r'[a-z0-9]+', acronym.casefold()))
    return frozenset(w for w in words if w not in STOP and w not in acronym_words)


def wiki_search(html, page_url):
    soup = BeautifulSoup(html, 'html.parser')
    events = []
    for link in soup.select('a[href*="event.showcfp"]'):
        tr = link.find_parent('tr')
        cells = tr.find_all('td', recursive=False) if tr else []
        if len(cells) != 2 or cells[0].get('rowspan') != '2':
            continue
        title = cells[1].get_text(' ', strip=True)
        label = link.get_text(' ', strip=True)
        events.append({'label': label, 'name': title, 'url': urljoin(page_url, link['href'])})
    pages = []
    for link in soup.select('a[href*="tool.search"]'):
        target = urljoin(page_url, link['href'])
        if 'page' in parse_qs(urlparse(target).query) and target != page_url:
            pages.append(target)
    return events, list(dict.fromkeys(pages))


def wiki_identity(venue, title, label):
    if re.search(r'special\s+issue|\[journals?\]|call\s+for\s+chapters|(?:^|\s)(?:workshop|track)\s+(?:at|of)', title, re.I):
        return False
    label_without_year = re.sub(r'\b(?:19|20)\d{2}\b|\b\d+(?:st|nd|rd|th)\b', '', label)
    normalize = lambda s: ''.join(re.findall('[a-z0-9]+', s.casefold()))
    if normalize(label_without_year) != normalize(venue['acronym']):
        return False
    return (name_key(title, venue['acronym']) == name_key(venue['name'], venue['acronym'])
            and len(name_key(title, venue['acronym'])) >= 2
            and compatible_names(title, venue['name']))


def date_value(text):
    text = re.sub(r'\([^)]*\)', '', text).strip()
    for pattern in ('%b %d, %Y', '%B %d, %Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(text, pattern).date().isoformat()
        except ValueError:
            pass
    return None


def wiki_event(html, url):
    soup = BeautifulSoup(html, 'html.parser')
    headline = soup.find('h2') or soup.find('h1') or soup.title
    title = headline.get_text(' ', strip=True) if headline else ''
    parts = title.split(':', 1)
    label, name = (parts[0].strip(), parts[1].strip()) if len(parts) == 2 else ('', title)
    fields = {}
    for tr in soup.find_all('tr'):
        cells = tr.find_all(['th', 'td'], recursive=False)
        if len(cells) == 2:
            key = cells[0].get_text(' ', strip=True)
            if key in ('When', 'Where', 'Submission Deadline', 'Abstract Registration Due', 'Notification Due', 'Final Version Due', 'Rebuttal Deadline'):
                fields[key] = cells[1].get_text(' ', strip=True)
    mapping = {'Submission Deadline': 'deadline', 'Abstract Registration Due': 'abstract_deadline',
               'Notification Due': 'decision_deadline', 'Final Version Due': 'camera_ready_deadline', 'Rebuttal Deadline': 'rebuttal_deadline'}
    timeline = {}
    for source, target in mapping.items():
        if source in fields:
            timeline[target] = date_value(fields[source])
    links = [a.get('href') for a in soup.select('a[href]')
             if a.get_text(' ', strip=True).startswith(('http://', 'https://'))
             and urlparse(a.get('href', '')).hostname not in ('www.wikicfp.com', 'wikicfp.com')]
    years = re.findall(r'\b((?:19|20)\d{2})\b', label)
    extra = extract_wiki_cfp(html, timeline)
    return {'label': label, 'name': name, 'year': int(years[-1]) if years else None,
            'id': 'wikicfp-' + parse_qs(urlparse(url).query)['eventid'][0],
            'link': links[0] if len(set(links)) == 1 else None,
            'timeline': extra['timeline'], 'timezone': None,
            'scope_keywords': extra['scope_keywords'], 'keyword_evidence': extra['keyword_evidence'],
            'date_evidence': extra['date_evidence'], 'date_conflicts': extra['date_conflicts'],
            'date': fields.get('When'), 'place': fields.get('Where'), 'cfp_url': url,
            'raw_fields': fields, 'date_precision': 'calendar_date_only',
            'note': 'No clock time or timezone inferred from date-only HTML fields'}


def core_rank(value):
    """Normalize any input label by policy, without a list of countries or venue IDs."""
    label = unicodedata.normalize('NFKC', str(value or '')).strip()
    standard = re.sub(r'\s+', '', label).upper()
    if standard in ('A*', 'A', 'B', 'C'):
        return standard
    if not label or re.match(r'^un[\s_-]*ranked\b', label, flags=re.I):
        return None
    return re.sub(r'\s+', ' ', label)


def utc_deadline(value, source_timezone):
    """Return UTC instant, separate calendar date and conversion status; never infer time."""
    if value is None or str(value).strip().upper() in ('', 'TBD'):
        return None, None, 'unpublished'
    text = str(value).strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
        try:
            datetime.strptime(text, '%Y-%m-%d')
        except ValueError:
            return None, None, 'invalid_date'
        return None, text, 'date_only'
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?', text):
        return None, None, 'invalid_datetime'
    try:
        local = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError:
        return None, None, 'invalid_datetime'
    if local.tzinfo is None:
        zone = str(source_timezone or '').strip()
        if zone == 'PT':
            # The CCF source defines PT as US Pacific Time with DST, not fixed UTC-8.
            pacific = ZoneInfo('America/Los_Angeles')
            candidates = {local.replace(tzinfo=pacific, fold=fold).astimezone(timezone.utc)
                          for fold in (0, 1)
                          if local.replace(tzinfo=pacific, fold=fold).astimezone(timezone.utc)
                          .astimezone(pacific).replace(tzinfo=None) == local}
            if len(candidates) != 1:
                return None, None, 'ambiguous_local_time' if candidates else 'nonexistent_local_time'
            local = candidates.pop()
        else:
            if zone in ('UTC', 'AoE'):
                offset = 0 if zone == 'UTC' else -12
            else:
                match = re.fullmatch(r'UTC([+-]\d{1,2})', zone)
                if not match or abs(int(match[1])) > 14:
                    return None, None, 'missing_timezone' if not zone else 'unsupported_timezone'
                offset = int(match[1])
            local = local.replace(tzinfo=timezone(timedelta(hours=offset)))
    return local.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'), None, 'converted'


def rounds(editions):
    result = []
    for edition in editions:
        for timeline in edition.get('timeline', []):
            item = copy.deepcopy(timeline)
            per_field_zones = item.pop('source_timezones', {})
            originals = {key: copy.deepcopy(timeline[key]) for key in TIME_FIELDS if key in timeline}
            dates, statuses = {}, {}
            for key, value in originals.items():
                item[key], calendar_date, statuses[key] = utc_deadline(value, per_field_zones.get(key, edition.get('timezone')))
                if calendar_date is not None:
                    dates[key] = calendar_date
            item.update({'year': edition.get('year'), 'edition_id': edition.get('id'),
                         'timezone': 'UTC', 'original_timezone': edition.get('timezone'),
                         'original_deadlines': originals, 'deadline_dates': dates, 'utc_status': statuses,
                         'link': edition.get('link'),
                         'date': edition.get('date'), 'place': edition.get('place')})
            if per_field_zones:
                item['original_timezones'] = per_field_zones
            result.append(item)
    return result


def search_url(query):
    # WikiCFP's public selector: f = current year and later (2026+, then 2027+, ...).
    # Avoid re-downloading past CFP archives for an updater that exports future submissions.
    return BASE + '/cfp/servlet/tool.search?' + urlencode({'q': query, 'year': 'f', 'page': 1})


def canonical_search(url, query):
    p = urlparse(url); params = parse_qs(p.query)
    if p.hostname not in ('wikicfp.com', 'www.wikicfp.com') or not p.path.endswith('tool.search'):
        return None
    if params.get('q', [query])[0] != query or params.get('year', ['f'])[0] != 'f':
        return None
    page = params.get('page', ['1'])[0]
    if not page.isdigit() or int(page) < 1:
        return None
    return BASE + '/cfp/servlet/tool.search?' + urlencode({'q': query, 'year': 'f', 'page': int(page)})


def event_url(url):
    p = urlparse(url); ids = parse_qs(p.query).get('eventid', [])
    if p.hostname not in ('wikicfp.com', 'www.wikicfp.com') or not p.path.endswith('event.showcfp') or not ids or not ids[0].isdigit():
        return None
    return BASE + '/cfp/servlet/event.showcfp?' + urlencode({'eventid': ids[0]})

