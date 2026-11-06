"""Refresh CCF + WikiCFP, clean and atomically publish the conference-only schema."""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import time
import zipfile
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
import cleaning as prep
from http_client import WikiClient, CrawlPaused, SourceError, github_get
import sources

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIELDS = ('id', 'name', 'acronym', 'issn', 'eissn', 'publisher', 'core_rank',
          'subject_area', 'scope_keywords', 'submission_deadlines', 'homepage_url')
POLICY_VERSION = 1


@contextmanager
def run_lock(state_dir):
    # Keep the local lock outside the cache restored on another GitHub runner.
    state_dir.parent.mkdir(parents=True, exist_ok=True)
    lock = state_dir.with_name(state_dir.name + '.lock')
    try:
        with lock.open('x', encoding='utf-8') as stream:
            json.dump({'pid': os.getpid()}, stream)
    except FileExistsError as error:
        raise RuntimeError('Another refresh owns the lock; verify the process before removing ' + str(lock)) from error
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_seed(seed):
    if seed.get('schema_version') != 1 or seed.get('ranking_source') != 'ICORE2026':
        raise ValueError('Unexpected conference seed version')
    records = seed['records']
    if not records or len({r['core']['id'] for r in records}) != len(records):
        raise ValueError('Empty seed or duplicate CORE identity')
    prep.check_structure([r['venue'] for r in records], 'conference')
    for record in records:
        if record['core']['source'] != seed['ranking_source']:
            raise ValueError('Mixed ranking versions')
    return records


def deadline_day(timeline):
    value = timeline.get('deadline')
    if value:
        try:
            stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if stamp.tzinfo:
                return stamp.astimezone(timezone.utc).date()
        except (ValueError, TypeError):
            pass
    value = timeline.get('deadline_dates', {}).get('deadline')
    try:
        return date.fromisoformat(value) if value else None
    except (ValueError, TypeError):
        return None


def unique_terms(terms):
    result = {}
    for value in terms:
        if isinstance(value, str) and value.strip():
            result.setdefault(prep.key(value), prep.text(value))
    return list(result.values())


def merged_rounds(editions, report):
    """Keep distinct cycles; fill missing CCF milestones from a uniquely matched Wiki round."""
    result, seen = [], {}
    origins = []
    report.setdefault('cross_source_date_conflicts', [])

    def published_day(item):
        value = item.get('original_deadlines', {}).get('deadline')
        return str(value)[:10] if value else None

    def cycle_label(item):
        label = prep.key(str(item.get('comment') or ''))
        match = re.search(r'\b(first|second|third|fourth|\d+(?:st|nd|rd|th)?)\s*(?:round|cycle)\b|\b(?:round|cycle)\s*(\d+)\b', label)
        if match:
            value = match[1] or match[2]
            return {'first': '1', 'second': '2', 'third': '3', 'fourth': '4'}.get(value, re.sub(r'\D', '', value))
        if re.search(r'\b(?:track|round|cycle)\b', label):
            return re.sub(r'^wikicfp cfp text\s*:\s*', '', label)
        return None

    for edition in editions:
        for item in sources.rounds([edition]):
            if edition.get('_origin') == 'wiki' and published_day(item):
                matches = [i for i, existing in enumerate(result) if origins[i] == 'ccf'
                           and existing.get('year') == item.get('year')
                           and published_day(existing) == published_day(item)
                           and (not cycle_label(existing) or not cycle_label(item)
                                or cycle_label(existing) == cycle_label(item))]
                if len(matches) == 1:
                    existing = result[matches[0]]
                    for field in sources.TIME_FIELDS:
                        old_value = existing.get(field) or existing.get('deadline_dates', {}).get(field)
                        new_value = item.get(field) or item.get('deadline_dates', {}).get(field)
                        if not old_value and new_value:
                            existing[field] = item.get(field)
                            for bucket in ('deadline_dates', 'original_deadlines', 'utc_status'):
                                if field in item.get(bucket, {}):
                                    existing.setdefault(bucket, {})[field] = item[bucket][field]
                            zone = item.get('original_timezones', {}).get(field, item.get('original_timezone'))
                            existing.setdefault('original_timezones', {})[field] = zone
                        elif old_value and new_value:
                            # Date-only and AoE UTC dates may differ legitimately. Compare
                            # original published dates rather than inventing another round.
                            old_day = str(existing.get('original_deadlines', {}).get(field, old_value))[:10]
                            new_day = str(item.get('original_deadlines', {}).get(field, new_value))[:10]
                            both_clock = (existing.get('utc_status', {}).get(field) == 'converted'
                                          and item.get('utc_status', {}).get(field) == 'converted')
                            if old_day != new_day or (both_clock and old_value != new_value):
                                report['cross_source_date_conflicts'].append({'year': item.get('year'),
                                    'field': field, 'ccf': old_value, 'wiki': new_value,
                                    'policy': 'retain_ccf_value'})
                    report['duplicate_rounds_removed'] += 1
                    continue
                if len(matches) > 1:
                    report['cross_source_date_conflicts'].append({'year': item.get('year'),
                        'published_day': published_day(item), 'policy': 'wiki_round_ambiguous_kept_separate'})
            # Preserve distinguishable tracks/cycles even when they share a deadline.
            timing = tuple((field, item.get(field), item.get('deadline_dates', {}).get(field))
                           for field in sources.TIME_FIELDS)
            identity = (item.get('year'), prep.key(str(item.get('comment') or '')),
                        item.get('link'), timing)
            if identity in seen:
                report['duplicate_rounds_removed'] += 1
                continue
            seen[identity] = len(result)
            result.append(item)
            origins.append(edition.get('_origin'))
    return result


def build_rows(records, ccf_records, wiki, report):
    core = [r['core'] for r in records]
    matched = {}
    report['ccf_matches'] = []
    for entry in ccf_records:
        hit, method, candidates = sources.match_record(entry, core)
        report['ccf_matches'].append({'title': entry['data']['title'],
            'core_id': hit['id'] if hit else None, 'method': method,
            'candidates': [r['id'] for r in candidates]})
        if hit:
            matched.setdefault(hit['id'], []).extend(copy.deepcopy(entry['data']['confs']))
    rows = []
    report['duplicate_rounds_removed'] = 0
    report['wiki_date_conflicts'] = []
    for record in records:
        key, venue = record['core']['id'], copy.deepcopy(record['venue'])
        venue['core_rank'] = sources.core_rank(record['core']['rank'])
        events = wiki.get(key, [])
        # Verify detail identity again when consuming restored checkpoint data.
        events = [e for e in events if verified_event(record, e)]
        venue['scope_keywords'] = unique_terms(venue['scope_keywords'] +
            [term for e in sorted(events, key=lambda e: e.get('year') or 0, reverse=True)
             for term in e.get('scope_keywords', [])])
        editions = [dict(e, _origin='ccf') for e in matched.get(key, [])] + [dict(e, _origin='wiki') for e in events]
        venue['submission_deadlines'] = merged_rounds(editions, report)
        usable = [e for e in editions if prep.clean_url(e.get('link')) and isinstance(e.get('year'), int)]
        if usable:
            latest = max(e['year'] for e in usable)
            urls = {prep.clean_url(e['link']) for e in usable if e['year'] == latest}
            # Do not pick an arbitrary first URL among conflicting candidates.
            if len(urls) == 1:
                venue['homepage_url'] = next(iter(urls))
        report['wiki_date_conflicts'].extend({'core_id': key, 'event_id': e['id'], 'conflicts': e['date_conflicts']}
            for e in events if e.get('date_conflicts'))
        rows.append({field: venue[field] for field in FIELDS})
    return rows


def verified_event(record, event):
    return any(sources.wiki_identity(candidate, event.get('name', ''), event.get('label', ''))
               for candidate in (record['core'], record['venue']))


def crawl_one(record, client):
    queries = list(dict.fromkeys([record['core']['name'], record['core']['acronym'],
                                 record['venue']['name'], record['venue']['acronym']]))
    accepted = {}
    for query in queries:
        pages, visited, seen_events = [sources.search_url(query)], set(), set()
        while pages:
            client.check()
            url = pages.pop(0)
            if url in visited:
                continue
            if len(visited) >= 300:
                raise SourceError('WikiCFP pagination exceeds safety limit; no partial publish')
            html = client.fetch(url)
            # A maintenance/error page must not become a successful empty search.
            soup = BeautifulSoup(html, 'html.parser')
            valid_form = any('tool.search' in str(form.get('action', '')) and form.find('input', attrs={'name': 'q'})
                             for form in soup.find_all('form'))
            if (not soup.title or 'wikicfp' not in soup.title.get_text().casefold()
                    or not valid_form or not re.search(r'Matched\s+Call\s+For\s+Papers\s+for', soup.get_text(' ', strip=True), re.I)):
                raise SourceError('Unrecognized WikiCFP search HTML')
            candidates, pagination = sources.wiki_search(html, url)
            visited.add(url)
            for candidate in candidates:
                event_url = sources.event_url(candidate['url'])
                if not event_url or event_url in seen_events or not verified_event(record, candidate):
                    continue
                seen_events.add(event_url)
                event = sources.wiki_event(client.fetch(event_url), event_url)
                if verified_event(record, event):
                    accepted[event['id']] = event
            for target in pagination:
                canonical = sources.canonical_search(target, query)
                if canonical and canonical not in visited and canonical not in pages:
                    pages.append(canonical)
    return list(accepted.values())


def fetch_ccf(directory):
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / 'snapshot.zip'
    metadata = directory / 'commit.json'
    if not archive.exists() or not metadata.exists():
        commit = json.loads(github_get('https://api.github.com/repos/ccfddl/ccf-deadlines/commits/main'))
        sha = commit['sha']
        if not re.fullmatch(r'[0-9a-f]{40}', sha):
            raise SourceError('Unexpected CCF commit identity')
        body = github_get(f'https://codeload.github.com/ccfddl/ccf-deadlines/zip/{sha}')
        temporary = directory / 'snapshot.download'
        temporary.write_bytes(body)
        with zipfile.ZipFile(temporary) as zipped:
            if sum(item.file_size for item in zipped.infolist()) > 96 * 1024 * 1024 or zipped.testzip():
                raise SourceError('Invalid/oversize CCF archive')
        temporary.replace(archive)
        sources.write_json(metadata, {'sha': sha, 'archive_sha256': digest(archive),
            'downloaded_at': datetime.now(timezone.utc).isoformat(), 'url': commit['html_url']})
    info = load(metadata)
    if digest(archive) != info['archive_sha256']:
        raise SourceError('CCF checkpoint archive checksum mismatch')
    entries, _categories = sources.read_ccf(archive, directory / 'raw')
    return entries, info


def clean_select(rows, cutoff, report):
    # Same pure functions as notebook 14; all cleaning runs before date filtering.
    with tempfile.TemporaryDirectory(prefix='ie104-conf-') as work:
        raw = Path(work) / 'conf_raw.json'
        sources.write_json(raw, rows)
        original, audit = prep.load_input(raw, 'conference')
        cleaned = prep.run_cleaning(original, audit)
    removed = 0
    for row in cleaned:
        old = row['submission_deadlines']
        row['submission_deadlines'] = [t for t in old if (day := deadline_day(t)) is not None and day > cutoff]
        removed += len(old) - len(row['submission_deadlines'])
    # filter_required is kept identical to the notebook implementation.
    from selection import filter_required
    retained, dropped = filter_required(cleaned, ['scope_keywords', 'submission_deadlines'])
    report.update(input_conferences=len(rows), retained_conferences=len(retained),
                  retained_rounds=sum(len(r['submission_deadlines']) for r in retained),
                  removed_past_or_unknown_rounds=removed, dropped_conferences=dropped,
                  changes=audit['changes'], issues=audit['issues'])
    assert_final(retained, cutoff)
    return retained


def assert_final(rows, cutoff):
    prep.check_structure(rows, 'conference')
    if any(tuple(row) != FIELDS for row in rows):
        raise ValueError('Unexpected conference field order')
    for row in rows:
        if not row['scope_keywords'] or not row['submission_deadlines']:
            raise ValueError('Required keywords/deadlines missing')
        for timeline in row['submission_deadlines']:
            if (day := deadline_day(timeline)) is None or day <= cutoff:
                raise ValueError('Past/unknown submission deadline in output')
    json.dumps(rows, ensure_ascii=False, allow_nan=False)


def publish(rows, output, seed_records):
    registry = {r['venue']['id']: r['venue'] for r in seed_records}
    if output.exists():
        previous_rows = load(output)
        prep.check_structure(previous_rows, 'conference')
        for previous in previous_rows:
            seeded = registry.get(previous['id'])
            if not seeded or (prep.key(previous['name']), prep.key(previous['acronym'])) != (prep.key(seeded['name']), prep.key(seeded['acronym'])):
                raise ValueError('Existing public ID differs from seed; reconcile before publishing')
    content = json.dumps(rows, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if output.exists() and output.read_text(encoding='utf-8') == content:
        return False
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(content, encoding='utf-8')
    temporary.replace(output)
    return True


def _run(seed_path, state_dir, output, cutoff, workers=4, max_minutes=240, request_client=None, ccf_fetch=fetch_ccf):
    records = validate_seed(load(seed_path))
    fingerprint = hashlib.sha256((digest(seed_path) + ''.join(digest(HERE / name) for name in
        ('refresh.py', 'sources.py', 'wiki_extract.py', 'cleaning.py', 'selection.py', 'http_client.py', 'http_worker.py', 'robots.py'))).encode()).hexdigest()
    state_dir.mkdir(parents=True, exist_ok=True)
    owner = state_dir / 'owner.json'
    owner_value = {'schema': 'ie104-conference-update-cache-v1'}
    if owner.exists():
        if load(owner) != owner_value:
            raise ValueError('Unexpected cache owner')
    elif any(state_dir.iterdir()):
        raise ValueError('Refuse to use a nonempty directory without a conference cache owner')
    else:
        sources.write_json(owner, owner_value)
    state_file = state_dir / 'state.json'
    state = load(state_file) if state_file.exists() else {}
    if state.get('fingerprint') != fingerprint or state.get('run_status') == 'complete':
        # A completed cycle never makes the next refresh reuse stale network pages.
        for name in ('pages', 'ccf'):
            child = state_dir / name
            if child.exists():
                if child.is_symlink() or not child.resolve().is_relative_to(state_dir.resolve()):
                    raise ValueError('Unsafe cache cleanup path')
                shutil.rmtree(child)
        (state_dir / 'report.json').unlink(missing_ok=True)
        state = {'fingerprint': fingerprint, 'cycle_date': cutoff.isoformat(),
                 'run_status': 'running', 'wiki': {}, 'completed_ids': [], 'error': None}
    state.update(run_status='running', error=None, cutoff_date=cutoff.isoformat())
    sources.write_json(state_file, state)
    end = time.monotonic() + max_minutes * 60
    client = request_client or WikiClient(state_dir / 'pages', end)
    try:
        ccf_entries, ccf_info = ccf_fetch(state_dir / 'ccf')
        state['ccf_commit'] = ccf_info
        sources.write_json(state_file, state)
        completed = set(state['completed_ids'])
        if not completed <= {r['core']['id'] for r in records}:
            raise ValueError('Unknown CORE key in checkpoint')
        jobs = iter([record for record in records if record['core']['id'] not in completed])
        print(f'WikiCFP resume {len(completed)}/{len(records)}; cycle={state["cycle_date"]}', flush=True)
        error = None
        with ThreadPoolExecutor(max_workers=workers) as executor:
            pending = {}
            def submit_one():
                job = next(jobs, None)
                if job:
                    pending[executor.submit(crawl_one, job, client)] = job['core']['id']
            for _ in range(workers):
                submit_one()
            while pending:
                done, _ = wait(pending, timeout=1, return_when=FIRST_COMPLETED)
                for future in done:
                    key = pending.pop(future)
                    try:
                        events = future.result()
                        state['wiki'][key] = events
                        completed.add(key)
                        state['completed_ids'] = sorted(completed)
                        sources.write_json(state_file, state)
                        print(f'WikiCFP {len(completed)}/{len(records)} CORE:{key}: {len(events)} verified editions', flush=True)
                    except Exception as exc:
                        error = error or exc
                        client.stopped.set()
                if error is None:
                    for _ in done:
                        submit_one()
        if error:
            raise error
        if len(completed) != len(records):
            raise SourceError('Incomplete WikiCFP input; refuse to publish')
        if len(records) >= 100 and not any(state['wiki'].values()):
            raise SourceError('No verified WikiCFP events for the entire catalogue; inspect parser/source before publishing')
        report = {'cutoff_date': cutoff.isoformat(), 'comparison': 'deadline calendar date > cutoff',
                  'calendar_policy': 'UTC for timestamps; published date for date-only values',
                  'ranking_source': 'ICORE2026', 'ccf_commit': ccf_info,
                  'wiki_complete_for_input': True, 'wiki_processed': len(completed),
                  'wiki_requests_this_run': client.requests, 'seed_sha256': digest(seed_path)}
        rows = clean_select(build_rows(records, ccf_entries, state['wiki'], report), cutoff, report)
        # Report must serialize successfully before touching the public dataset.
        sources.write_json(state_dir / 'report.json', report)
        report['changed'] = publish(rows, output, records)
        sources.write_json(state_dir / 'report.json', report)
        state.update(run_status='complete', error=None)
        sources.write_json(state_file, state)
        print(json.dumps({k: report[k] for k in ('cutoff_date', 'input_conferences', 'retained_conferences', 'retained_rounds', 'changed')}, indent=2))
        return report
    except Exception as exc:
        state.update(run_status='paused' if isinstance(exc, CrawlPaused) else 'failed', error=str(exc))
        sources.write_json(state_file, state)
        raise


def run(seed_path, state_dir, output, cutoff, **kwargs):
    with run_lock(state_dir):
        return _run(seed_path, state_dir, output, cutoff, **kwargs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=Path, default=HERE / 'seed.json')
    parser.add_argument('--state-dir', type=Path, default=ROOT / '.cache/conference-update')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/conf.json')
    parser.add_argument('--after', type=date.fromisoformat)
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 5))
    parser.add_argument('--max-minutes', type=int, default=240, choices=range(1, 281))
    args = parser.parse_args()
    if args.output.resolve() != (ROOT / 'data/conf.json').resolve():
        parser.error('Only data/conf.json may be published by this entry point')
    try:
        run(args.seed.resolve(), args.state_dir.resolve(), args.output.resolve(),
            args.after or datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date(),
            workers=args.workers, max_minutes=args.max_minutes)
    except Exception as error:
        print(f'Conference update failed; public data kept unless publication completed: {error}', flush=True)
        raise SystemExit(1)
