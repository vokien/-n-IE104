import copy
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import yaml
import cleaning as prep
from http_client import WikiClient, SourceError, CrawlPaused, raw_request
from refresh import (ROOT, HERE, FIELDS, run, run_lock, load, validate_seed, clean_select,
                     build_rows, publish, deadline_day, merged_rounds, crawl_one)
from schedule import ANCHOR, is_due
import sources
from wiki_extract import extract


def record(number=1):
    word = ('Alpha', 'Beta', 'Gamma')[number - 1]
    name = 'Example Computing Symposium ' + word
    acronym = 'ECS' + word
    venue = dict(zip(FIELDS, [f'CONF-{number:03d}', name, acronym, None, None,
                  None, 'A', [], ['Machine learning'], [], 'https://example.org/conf']))
    return {'core': {'id': str(number), 'name': name, 'acronym': acronym,
                    'source': 'ICORE2026', 'rank': 'B', 'dblp_url': 'https://dblp.org/db/conf/ecs' + word},
            'venue': venue}


def ccf(record):
    core = record['core']
    return {'source_file': 'conference/AI/ecs.yml', 'source_index': 0, 'data': {
        'title': core['acronym'], 'description': core['name'],
        'dblp': core['dblp_url'], 'rank': {'core': 'A*'}, 'confs': [
            {'year': 2027, 'id': core['acronym'] + '27', 'link': 'https://example.org/conf',
             'timezone': 'AoE', 'timeline': [{'deadline': '2027-01-01 23:59:59', 'comment': 'First round'}]}]}}


class FakeWiki:
    def __init__(self, fail_text=None, failure=SourceError):
        self.stopped = threading.Event()
        self.requests = 0
        self.urls = []
        self.fail_text, self.failure = fail_text, failure

    def check(self):
        if self.stopped.is_set():
            raise SourceError('stopped')

    def fetch(self, url):
        self.check()
        self.requests += 1
        self.urls.append(url)
        if self.fail_text and self.fail_text in url:
            raise self.failure('simulated source failure')
        return ('<html><title>WikiCFP : Call for Papers</title>'
                '<form action="/cfp/servlet/tool.search"><input name="q"></form>'
                '<p>Matched Call For Papers for query</p></html>')


class ConferenceUpdateTests(unittest.TestCase):
    def test_schedule_every_three_days_across_months_years_and_leap_day(self):
        due = [ANCHOR + timedelta(days=n) for n in range(1700) if is_due(ANCHOR + timedelta(days=n))]
        self.assertTrue(all((b - a).days == 3 for a, b in zip(due, due[1:])))
        self.assertFalse(is_due(ANCHOR - timedelta(days=1)))
        self.assertTrue(is_due(date(2026, 11, 9)))
        self.assertFalse(is_due(date(2026, 11, 10)))

    def test_real_seed_covers_all_core_and_preserves_every_public_id(self):
        records = validate_seed(load(HERE / 'seed.json'))
        self.assertEqual(len(records), 987)
        registry = {r['venue']['id']: r['venue'] for r in records}
        for row in load(ROOT / 'data/conf.json'):
            if row['id'] in registry:
                self.assertEqual(row['name'], registry[row['id']]['name'])
                self.assertEqual(row['acronym'], registry[row['id']]['acronym'])
            else:
                # Novel discovered conferences allocated with sequential ID > 987
                num = int(row['id'].split('-')[1])
                self.assertGreater(num, 987)
                self.assertTrue(bool(row['name']))
                self.assertTrue(bool(row['acronym']))
            self.assertEqual(set(row), set(FIELDS))

    def test_ccf_identity_same_acronym_wrong_dblp_not_joined(self):
        r = record()
        item = ccf(r)
        wrong = dict(r['core'], name='Different Security Symposium', dblp_url='https://dblp.org/db/conf/wrong')
        self.assertIsNone(sources.match_record(item, [wrong])[0])

    def test_core_rank_has_priority_over_ccf_rank(self):
        r = record()
        rows = build_rows([r], [ccf(r)], {}, {})
        self.assertEqual(rows[0]['core_rank'], 'B')
        self.assertNotIn('scopus_rank', rows[0])

    def test_yaml_preserves_date_strings_and_rejects_duplicate_keys(self):
        self.assertEqual(yaml.load('deadline: 2027-01-01\n', Loader=sources.SourceLoader)['deadline'], '2027-01-01')
        with self.assertRaises(ValueError):
            yaml.load('deadline: a\ndeadline: b\n', Loader=sources.SourceLoader)

    def test_aoe_pt_dst_and_no_timezone_guess(self):
        self.assertEqual(sources.utc_deadline('2027-01-01 23:59:59', 'AoE')[0], '2027-01-02T11:59:59Z')
        self.assertEqual(sources.utc_deadline('2027-07-01 23:59:59', 'PT')[0], '2027-07-02T06:59:59Z')
        self.assertEqual(sources.utc_deadline('2027-01-01 23:59:59', None)[2], 'missing_timezone')
        self.assertEqual(sources.utc_deadline('2027-01-01', None), (None, '2027-01-01', 'date_only'))
        self.assertEqual(sources.utc_deadline('2026-11-01 01:30:00', 'PT')[2], 'ambiguous_local_time')

    def test_wiki_multiple_cycles_all_milestones_and_literal_topics(self):
        html = '''<div class="cfp">Topics of interest:<br>Machine learning<br>Robotics<br>
        Important dates<br>First round<br>Abstract deadline: January 1, 2027<br>
        Paper submission deadline: January 3, 2027<br>Notification: February 2, 2027<br>
        Second round<br>Submission deadline: May 3, 2027<br>Camera-ready: June 2, 2027</div>'''
        found = extract(html, {'deadline': '2027-05-03'})
        self.assertEqual(len(found['timeline']), 2)
        self.assertEqual(found['timeline'][0]['abstract_deadline'], '2027-01-01')
        self.assertEqual(found['timeline'][1]['camera_ready_deadline'], '2027-06-02')
        self.assertEqual(found['scope_keywords'], ['Machine learning', 'Robotics'])

    def test_wiki_does_not_infer_midnight_from_rdf_or_unlabelled_dates(self):
        found = extract('<span content="2027-01-01T00:00:00">January 1, 2027</span>', {'deadline': '2027-01-01'})
        timeline = sources.rounds([{'timeline': found['timeline']}])[0]
        self.assertIsNone(timeline['deadline'])
        self.assertEqual(timeline['deadline_dates']['deadline'], '2027-01-01')

    def test_wiki_identity_rejects_special_issue_and_wrong_full_title(self):
        r = record()['core']
        self.assertFalse(sources.wiki_identity(r, 'Special issue ' + r['name'], r['acronym'] + ' 2027'))
        self.assertFalse(sources.wiki_identity(r, 'Other Computing Conference', r['acronym'] + ' 2027'))

    def test_canonical_links_cannot_switch_query_or_domain(self):
        self.assertIn('year=f', sources.search_url('AI'))
        self.assertIsNone(sources.canonical_search('http://www.wikicfp.com/cfp/servlet/tool.search?q=AI&year=a&page=2', 'AI'))
        self.assertIsNone(sources.canonical_search('https://evil.example/tool.search?q=AI&page=2', 'AI'))
        self.assertIsNone(sources.canonical_search('http://www.wikicfp.com/cfp/servlet/tool.search?q=OTHER&page=2', 'AI'))
        self.assertEqual(sources.event_url('http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=12&copyownerid=3'),
                         'http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=12')

    def test_merge_keeps_more_wiki_rounds_same_year_and_complements_ccf(self):
        base = ccf(record())['data']['confs'][0]
        base['_origin'] = 'ccf'
        wiki = {'year': 2027, 'id': 'wikicfp-12', '_origin': 'wiki', 'timeline': [
            {'deadline': '2027-01-01', 'abstract_deadline': '2026-12-25'},
            {'deadline': '2027-05-01'}]}
        report = {'duplicate_rounds_removed': 0}
        rows = merged_rounds([base, wiki], report)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['deadline'], '2027-01-02T11:59:59Z')
        self.assertEqual(rows[0]['deadline_dates']['abstract_deadline'], '2026-12-25')
        self.assertEqual(report['duplicate_rounds_removed'], 1)

    def test_distinct_cycle_with_same_date_is_not_collapsed(self):
        base = dict(ccf(record())['data']['confs'][0], _origin='ccf')
        wiki = {'year': 2027, '_origin': 'wiki', 'timeline': [
            {'deadline': '2027-01-01', 'comment': 'WikiCFP CFP text: Second round'}]}
        report = {'duplicate_rounds_removed': 0}
        self.assertEqual(len(merged_rounds([base, wiki], report)), 2)

    def test_conflicting_explicit_clocks_are_reported_and_ccf_retained(self):
        base = dict(ccf(record())['data']['confs'][0], _origin='ccf')
        wiki = {'year': 2027, '_origin': 'wiki', 'timezone': 'AoE', 'timeline': [
            {'deadline': '2027-01-01 22:59:59'}]}
        report = {'duplicate_rounds_removed': 0}
        result = merged_rounds([base, wiki], report)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['deadline'], '2027-01-02T11:59:59Z')
        self.assertEqual(len(report['cross_source_date_conflicts']), 1)

    def test_cleaning_dedupes_keywords_and_subjects_before_filtering(self):
        r = record()['venue']
        r.update(scope_keywords=['Machine learning', ' machine LEARNING ', 'Robotics'],
                 subject_area=['AI', ' AI '], publisher='Example\u00a0Press',
                 submission_deadlines=sources.rounds(ccf(record())['data']['confs']))
        cleaned = clean_select([r], date(2026, 11, 6), {})[0]
        self.assertEqual(cleaned['scope_keywords'], ['Machine learning', 'Robotics'])
        self.assertEqual(cleaned['subject_area'], ['AI'])
        self.assertEqual(cleaned['publisher'], 'Example Press')

    def test_filter_is_strictly_after_today_and_keeps_utc_calendar_policy(self):
        r = record()['venue']
        editions = [{'year': 2026, 'timezone': 'AoE', 'timeline': [
            {'deadline': '2026-11-05 23:59:59'},  # UTC day is Nov 6: removed.
            {'deadline': '2026-11-06 23:59:59'},  # UTC day is Nov 7: retained.
            {'deadline': '2026-11-06'}, {'deadline': '2026-11-07'},
            {'abstract_deadline': '2027-01-01'}]}]
        r['submission_deadlines'] = sources.rounds(editions)
        out = clean_select([r], date(2026, 11, 6), {})
        self.assertEqual(len(out[0]['submission_deadlines']), 2)
        self.assertTrue(all(deadline_day(t) == date(2026, 11, 7) for t in out[0]['submission_deadlines']))

    def test_missing_keywords_or_no_valid_submission_are_dropped(self):
        rows = [record(i)['venue'] for i in (1, 2, 3)]
        for r in rows:
            r['submission_deadlines'] = sources.rounds(ccf(record())['data']['confs'])
        rows[1]['scope_keywords'] = []
        rows[2]['submission_deadlines'] = []
        report = {}
        result = clean_select(rows, date(2026, 11, 6), report)
        self.assertEqual([r['id'] for r in result], ['CONF-001'])
        self.assertEqual(len(report['dropped_conferences']), 2)

    def test_empty_result_refuses_to_replace_output(self):
        with self.assertRaisesRegex(ValueError, 'No venue remains'):
            clean_select([record()['venue']], date(2026, 11, 6), {})

    def test_publish_preserves_registry_and_does_not_change_journal_or_version_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            journal = directory / 'jour.json'
            journal.write_text('unchanged', encoding='utf-8')
            r = record()
            output = directory / 'conf.json'
            self.assertTrue(publish([r['venue']], output, [r]))
            self.assertFalse(publish([r['venue']], output, [r]))
            self.assertEqual(sorted(p.name for p in directory.iterdir()), ['conf.json', 'jour.json'])
            self.assertEqual(journal.read_text(), 'unchanged')
            altered = copy.deepcopy(r)
            altered['venue']['name'] = 'Different Conference'
            with self.assertRaisesRegex(ValueError, 'Existing public ID'):
                publish([altered['venue']], output, [altered])

    def test_network_failure_checkpoint_resume_and_repeat_are_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            records = [record(i) for i in (1, 2, 3)]
            seed = folder / 'seed.json'
            sources.write_json(seed, {'schema_version': 1, 'ranking_source': 'ICORE2026', 'records': records})
            output = folder / 'conf.json'
            sources.write_json(output, [r['venue'] for r in records])
            before = output.read_bytes()
            fetch = lambda _: ([ccf(r) for r in records], {'sha': 'test'})
            with self.assertRaises(SourceError):
                run(seed, folder / 'state', output, date(2026, 11, 6), workers=1,
                    request_client=FakeWiki('Gamma'), ccf_fetch=fetch)
            self.assertEqual(output.read_bytes(), before)
            checkpoint = load(folder / 'state/state.json')
            self.assertEqual(checkpoint['completed_ids'], ['1', '2'])
            resumed = FakeWiki()
            report = run(seed, folder / 'state', output, date(2026, 11, 9), workers=1,
                         request_client=resumed, ccf_fetch=fetch)
            self.assertEqual(report['retained_conferences'], 3)
            self.assertTrue(report['changed'])
            self.assertTrue(all('Gamma' in url for url in resumed.urls))
            self.assertEqual(load(folder / 'state/state.json')['run_status'], 'complete')
            again = run(seed, folder / 'state', output, date(2026, 11, 9), workers=1,
                        request_client=FakeWiki(), ccf_fetch=fetch)
            self.assertFalse(again['changed'])

    def test_lock_refuses_second_coordinator(self):
        with tempfile.TemporaryDirectory() as tmp:
            with run_lock(Path(tmp) / 'state'):
                with self.assertRaisesRegex(RuntimeError, 'Another refresh'):
                    with run_lock(Path(tmp) / 'state'):
                        self.fail('Must not enter')
            self.assertFalse((Path(tmp) / 'state.lock').exists())

    def test_raw_http_timeout_kills_worker_instead_of_hanging(self):
        with patch('http_client.subprocess.run', side_effect=subprocess.TimeoutExpired('worker', 1)) as call:
            with self.assertRaises(SourceError):
                raw_request('http://www.wikicfp.com', timeout=1)
            self.assertEqual(call.call_args.kwargs['timeout'], 1)

    def test_crawl_follows_pagination_and_detail_and_rejects_wrong_identity(self):
        r = record()
        first = sources.search_url(r['core']['name'])
        page2 = first.replace('page=1', 'page=2')
        event_url = sources.event_url('http://www.wikicfp.com/cfp/servlet/event.showcfp?eventid=55')
        detail = ('<h2>' + r['core']['acronym'] + ' 2027: ' + r['core']['name'] + '</h2>'
                  '<div class="cfp">Topics of interest:<br>Robotics<br>Important dates<br>'
                  'Submission deadline: January 20, 2027</div>')
        default = FakeWiki().fetch(first)
        page = ('<html><title>WikiCFP</title><form action="/cfp/servlet/tool.search"><input name="q"></form>'
                '<p>Matched Call For Papers for query</p><table><tr><td rowspan="2"><a href="' + event_url + '">'
                + r['core']['acronym'] + ' 2027</a></td><td>' + r['core']['name'] + '</td></tr></table>'
                '<a href="' + page2 + '">Next</a></html>')
        client = FakeWiki()
        def fetch(url):
            client.urls.append(url)
            return page if url == first else detail if url == event_url else default
        client.fetch = fetch
        result = crawl_one(r, client)
        self.assertIn(page2, client.urls)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['scope_keywords'], ['Robotics'])
        self.assertEqual(result[0]['timeline'][0]['deadline'], '2027-01-20')

    def test_shared_title_error_page_is_not_a_successful_empty_search(self):
        client = FakeWiki()
        client.fetch = lambda _: '<html><title>WikiCFP</title><p>Maintenance</p></html>'
        with self.assertRaisesRegex(SourceError, 'Unrecognized'):
            crawl_one(record(), client)

    def test_run_budget_pause_preserves_output_and_does_not_complete_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            r = record()
            seed = folder / 'seed.json'
            sources.write_json(seed, {'schema_version': 1, 'ranking_source': 'ICORE2026', 'records': [r]})
            output = folder / 'conf.json'
            sources.write_json(output, [r['venue']])
            before = output.read_bytes()
            with self.assertRaises(CrawlPaused):
                run(seed, folder / 'state', output, date(2026, 11, 6), workers=1,
                    request_client=FakeWiki('Alpha', CrawlPaused), ccf_fetch=lambda _: ([ccf(r)], {'sha': 'test'}))
            self.assertEqual(output.read_bytes(), before)
            state = load(folder / 'state/state.json')
            self.assertEqual(state['run_status'], 'paused')
            self.assertEqual(state['completed_ids'], [])

    def test_unowned_directory_is_never_cleaned(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            seed = folder / 'seed.json'
            sources.write_json(seed, {'schema_version': 1, 'ranking_source': 'ICORE2026', 'records': [record()]})
            state = folder / 'state'
            state.mkdir()
            unrelated = state / 'keep.txt'
            unrelated.write_text('keep')
            with self.assertRaisesRegex(ValueError, 'without a conference cache owner'):
                run(seed, state, folder / 'conf.json', date(2026, 11, 6))
            self.assertEqual(unrelated.read_text(), 'keep')

    def test_robots_block_prevents_page_request(self):
        calls = []
        def request(url, timeout):
            calls.append(url)
            return {'status': 200, 'charset': 'utf-8'}, b'User-agent: *\nDisallow: /cfp\n'
        with tempfile.TemporaryDirectory() as tmp:
            client = WikiClient(tmp, time.monotonic() + 300, request=request)
            with self.assertRaisesRegex(SourceError, 'robots disallows'):
                client.fetch(sources.search_url('AI'))
            self.assertEqual(len(calls), 1)

    def test_403_and_challenge_stop_without_retry(self):
        for status, body in [(401, b'Unauthorized'), (403, b'Forbidden'), (429, b'Too many requests'),
                             (200, b'<title>Just a moment</title>')]:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                calls = []
                def request(url, timeout):
                    calls.append(url)
                    if url.endswith('robots.txt'):
                        return {'status': 200}, b'User-agent: *\nAllow: /\n'
                    return {'status': status, 'content_type': 'text/html'}, body
                client = WikiClient(tmp, time.monotonic() + 300, request=request)
                # Skip real waiting while retaining the client's gate and stop checks.
                with patch.object(client.stopped, 'wait', return_value=False):
                    with self.assertRaises(SourceError):
                        client.fetch(sources.search_url('AI'))
                    with self.assertRaises(SourceError):
                        client.fetch(sources.search_url('OTHER'))
                self.assertEqual(len(calls), 2)

    def test_successful_page_cache_resumes_without_network_and_robots_uses_longest_rule(self):
        calls = []
        def request(url, timeout):
            calls.append(url)
            if url.endswith('robots.txt'):
                return {'status': 200}, b'User-agent: *\nDisallow: /cfp/*\nAllow: /cfp/servlet/tool.search\n'
            return {'status': 200, 'content_type': 'text/html'}, b'<html>cached page</html>'
        with tempfile.TemporaryDirectory() as tmp:
            client = WikiClient(tmp, time.monotonic() + 300, request=request)
            with patch.object(client.stopped, 'wait', return_value=False):
                first = client.fetch(sources.search_url('AI'))
            self.assertEqual(len(calls), 2)
            resumed = WikiClient(tmp, time.monotonic() + 300, request=request)
            self.assertEqual(resumed.fetch(sources.search_url('AI')), first)
            self.assertEqual(len(calls), 2)

    def test_workflow_only_stages_conf_and_runs_tests_before_refresh(self):
        workflow = yaml.load((ROOT / '.github/workflows/update-conferences.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        self.assertEqual(workflow['on']['schedule'][0]['cron'], '17 20 * * *')
        jobs = workflow['jobs']
        self.assertIn('validate', jobs['refresh']['needs'])
        pr = next(s for s in jobs['refresh']['steps'] if s.get('id') == 'pr')
        self.assertEqual(pr['with']['add-paths'], 'data/conf.json')
        self.assertEqual(pr['with']['branch'], 'automation/update-conferences')
        self.assertEqual(pr['if'], 'success()')
        self.assertNotIn('branch-suffix', pr['with'])


if __name__ == '__main__':
    unittest.main()
