"""Extract only explicitly labelled WikiCFP dates and published topic lists."""
import re
from datetime import datetime
from bs4 import BeautifulSoup

MONTH = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
DATE = re.compile(r'\b(?:\d{4}-\d{2}-\d{2}|' + MONTH + r'\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+' + MONTH + r'[,]?\s+\d{4})\b', re.I)
FIELDS = {'deadline', 'abstract_deadline', 'decision_deadline', 'camera_ready_deadline', 'rebuttal_deadline'}


def clock_zone(text):
    clock = re.search(r'\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b', text, re.I)
    zone = re.search(r'\bUTC\s*([+-]\s*\d{1,2}(?::\d{2})?)?\b|\bAoE\b|Anywhere on Earth|Pacific Time|\bPT\b', text, re.I)
    if not clock or not zone:
        return None
    hour, minute, second = int(clock[1]), int(clock[2]), int(clock[3] or 0)
    if clock[4]:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if clock[4].lower() == 'pm' else 0)
    if hour > 23 or minute > 59 or second > 59:
        return None
    name = zone.group().casefold()
    tz = 'AoE' if name in ('aoe', 'anywhere on earth') else 'PT' if name in ('pt', 'pacific time') else re.sub(r'\s+', '', zone.group()).upper()
    return f'{hour:02}:{minute:02}:{second:02}', tz


def calendar_date(text):
    value = re.sub(r'(\d)(st|nd|rd|th)\b', r'\1', text, flags=re.I).replace(',', '').replace('.', '')
    value = re.sub(r'\bSept\b', 'Sep', value, flags=re.I)
    for fmt in ('%Y-%m-%d', '%b %d %Y', '%B %d %Y', '%d %b %Y', '%d %B %Y'):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def deadline_kind(label):
    label = label.casefold()
    if 'abstract' in label and re.search(r'due|deadline|submission|registration', label):
        return 'abstract_deadline'
    if re.search(r'camera[ -]?ready|final version|final paper', label):
        return 'camera_ready_deadline'
    if re.search(r'rebuttal|author response', label):
        return 'rebuttal_deadline'
    if re.search(r'notification|acceptance|decision', label):
        return 'decision_deadline'
    if re.search(r'submission|papers? due', label):
        return 'deadline'
    return None


def extract(html, structured):
    soup = BeautifulSoup(html, 'html.parser')
    cfp = soup.select_one('div.cfp')
    # Superseded dates may be struck out; retain the original page in the HTML cache.
    if cfp:
        for node in cfp.select('s, strike, del, script, style'):
            node.decompose()
        for br in cfp.find_all('br'):
            br.replace_with('\n')
        for block in cfp.find_all(['li', 'p', 'h1', 'h2', 'h3', 'h4', 'tr']):
            block.insert_before('\n'); block.insert_after('\n')
    lines = [re.sub(r'\s+', ' ', t).strip() for t in cfp.get_text(' ', strip=False).splitlines()] if cfp else []
    keywords, evidence = [], []
    for heading in soup.find_all(['h5', 'h4']):
        if 'Categories' in heading.get_text(' ', strip=True):
            for a in heading.select('a[href*="conference="]'):
                term = a.get_text(' ', strip=True)
                if term:
                    keywords.append(term); evidence.append({'term': term, 'method': 'wikicfp_category'})
    active = False
    for line in lines:
        if re.search(r'topics?\s+of\s+interest|(?:^|\b)(?:topics|areas)\s+(?:include|covered)|^topics\s*:', line, re.I):
            active = True
            continue
        if not active:
            continue
        if re.search(r'important dates|submission|notification|camera.ready|registration|organizing|programme committee|program committee|publication|^contact|^key dates', line, re.I):
            active = False
            continue
        term = re.sub(r'^\s*[-*•–▪]+\s*', '', line).strip()
        if not term:
            continue
        if len(term) > 180 or len(term.split()) > 25 or DATE.search(term) or re.search(r'https?://|@', term):
            active = False
            continue
        if term.endswith(':'):
            active = False
            continue
        if not term.endswith(('.', '!', '?')):
            keywords.append(term); evidence.append({'term': term, 'method': 'literal_cfp_topic_list', 'line': line})
    unique = {}
    for term in keywords:
        unique.setdefault(term.casefold(), term)
    globals_found = {value for line in lines if re.search(r'\ball\b.*\bdeadlines?\b', line, re.I) and (value := clock_zone(line))}
    global_clock = next(iter(globals_found)) if len(globals_found) == 1 else None
    rounds, pending, context, date_evidence, conflicts, uncertain = [], {}, None, [], [], set()
    def flush():
        nonlocal pending, uncertain
        if any(k in pending for k in FIELDS):
            pending['comment'] = 'WikiCFP CFP text' + (': ' + context if context else '')
            rounds.append(pending)
            pending = {}
        uncertain = set()
    for line in lines:
        # A short, explicit cycle heading prevents collapsing multiple submission rounds.
        if len(line) < 100 and not DATE.search(line) and re.search(r'\b(?:round|cycle)\b', line, re.I) and re.search(r'\d|first|second|third|spring|summer|fall|autumn|winter', line, re.I):
            flush(); context = line
            continue
        for piece in line.split(';'):
            matches = list(DATE.finditer(piece))
            kind = deadline_kind(piece)
            if not kind or not matches:
                continue
            if kind in uncertain:
                continue
            values = list(dict.fromkeys(calendar_date(m.group()) for m in matches))
            values = [v for v in values if v]
            if len(values) != 1:
                conflicts.append({'field': kind, 'line': piece, 'reason': 'multiple_dates_in_one_label'})
                continue
            value = values[0]
            timing = clock_zone(piece) or global_clock
            if timing:
                value += ' ' + timing[0]
            if kind in pending and pending[kind] != value:
                conflicts.append({'field': kind, 'line': piece, 'reason': 'conflicting_dates_without_cycle_heading'})
                pending.pop(kind); uncertain.add(kind)
                pending.get('source_timezones', {}).pop(kind, None)
                continue
            pending[kind] = value
            if timing:
                pending.setdefault('source_timezones', {})[kind] = timing[1]
            date_evidence.append({'field': kind, 'value': value, 'line': piece, 'cycle': context, 'timezone': timing[1] if timing else None, 'method': 'labelled_cfp_text'})
    flush()
    summary = {k: v for k, v in structured.items() if k in FIELDS}
    if global_clock:
        summary = {k: v + ' ' + global_clock[0] if v else v for k, v in summary.items()}
    if summary:
        matched = [r for r in rounds if summary.get('deadline') and str(r.get('deadline', ''))[:10] == summary['deadline'][:10]]
        if len(matched) == 1:
            r = matched[0]
            for k, v in summary.items():
                if k not in r:
                    r[k] = v
                    if global_clock and v:
                        r.setdefault('source_timezones', {})[k] = global_clock[1]
                elif str(r[k])[:10] != str(v)[:10]:
                    conflicts.append({'field': k, 'summary_value': v, 'text_value': r[k], 'reason': 'summary_text_conflict'})
        elif not rounds:
            rounds.append(dict(summary, comment='WikiCFP labelled date table'))
            if global_clock:
                rounds[-1]['source_timezones'] = {k: global_clock[1] for k, v in summary.items() if v}
        else:
            # Do not fabricate an additional submission cycle from an inconsistent summary.
            conflicts.append({'summary': summary, 'reason': 'summary_not_assigned_to_unique_text_cycle'})
    return {'timeline': rounds, 'scope_keywords': list(unique.values()), 'keyword_evidence': evidence,
            'date_evidence': date_evidence, 'date_conflicts': conflicts}
