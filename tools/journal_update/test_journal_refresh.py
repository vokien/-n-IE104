"""
Comprehensive test suite for tools/journal_update module.
Covers Spider mocking, OpenAlex response parsing, Special Issue extraction,
and end-to-end refresh execution.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from normalizer import normalize_all, normalize_journal
from sources import (
    OpenAlexSource, SpecialIssueSource, SCImagoSource, normalize_title_key
)
from spider import JournalSpider, MockResponse, SpiderError
from refresh import refresh_journals, atomic_write_json


MOCK_OPENALEX_JSON = {
    "results": [
        {
            "id": "https://openalex.org/S12345",
            "display_name": "Applied Ecology and Environmental Research",
            "host_organization_name": "Corvinus University of Budapest",
            "issn": ["1589-1623", "1785-0037"],
            "summary_stats": {
                "2yr_mean_citedness": 3.85,
                "h_index": 72
            },
            "homepage_url": "https://example.com/journal-ecology",
            "is_oa": True,
            "topics": [
                {
                    "display_name": "Agricultural Science and Fertilization",
                    "subfield": {"display_name": "Soil Science"},
                    "field": {"display_name": "Agricultural and Biological Sciences"}
                },
                {
                    "display_name": "Plant Stress Responses and Tolerance",
                    "subfield": {"display_name": "Plant Science"},
                    "field": {"display_name": "Agricultural and Biological Sciences"}
                }
            ]
        }
    ]
}

MOCK_SJR_CSV = (
    'Rank;Sourceid;Title;Type;Issn;Publisher;Open Access;Open Access Diamond;'
    'SJR;SJR Best Quartile;H index;Country;Region;Publisher;Coverage;Categories;Areas\n'
    '1;100147015;"Applied Ecology and Environmental Research";journal;'
    '"15891623, 17850037";"Corvinus University of Budapest";Yes;No;2,850;Q2;60;'
    'Hungary;Eastern Europe;"Corvinus University of Budapest";"2003-2026";'
    '"Ecology (Q2); Agronomy and Crop Science (Q2)";"Agricultural and Biological Sciences"\n'
    '2;999001;"Ambiguous Title";journal;"11112222";"Pub A";No;No;1,100;Q1;20;'
    'US;North America;"Pub A";"2020-2026";"Computer Science (Q1)";"Computer Science"\n'
    '3;999002;"Ambiguous Title";journal;"33334444";"Pub B";No;No;0,500;Q3;10;'
    'UK;Western Europe;"Pub B";"2020-2026";"Mathematics (Q3)";"Mathematics"\n'
)

MOCK_SJR_DETAIL_HTML = """
<html>
<body>
  <div class="cuadrado fullwidth">
    <h2>Scope</h2>
    Applied Ecology and Environmental Research publishes original peer-reviewed
    research papers covering ecosystem dynamics, biodiversity conservation,
    and sustainable agriculture across global environments.
    <a class="join_comments_button" href="#comments">Join the conversation about this journal</a>
    <script>console.log('ignore');</script>
  </div>
</body>
</html>
"""

MOCK_WIKICFP_HTML = """
<html>
<body>
<table>
  <tr>
    <td><a href="/cfp/servlet/event.showcfp?eventid=99999">AI-SPECIAL-2026</a></td>
    <td>IEEE Transactions on Neural Networks - Special Issue on Deep Learning</td>
  </tr>
  <tr>
    <td>Location: Online</td>
    <td>2026-11-20</td>
    <td>Dec 01, 2026</td>
  </tr>
</table>
</body>
</html>
"""


class DummySpider:
    """Mock spider returning deterministic responses for offline testing."""
    def __init__(self, delay=0.0, max_retries=1):
        self.delay = delay
        self.max_retries = max_retries

    def fetch(self, url: str, headers=None, timeout=15):
        if "openalex" in url:
            content = json.dumps(MOCK_OPENALEX_JSON).encode('utf-8')
            return MockResponse(content=content, status=200, url=url)
        elif "wikicfp" in url:
            content = MOCK_WIKICFP_HTML.encode('utf-8')
            return MockResponse(content=content, status=200, url=url)
        return MockResponse(content=b"{}", status=200, url=url)


class TestJournalUpdateIntegration(unittest.TestCase):

    def test_openalex_parsing(self):
        parsed = OpenAlexSource.parse_response(MOCK_OPENALEX_JSON)
        self.assertIn("1589-1623", parsed)
        self.assertIn("1785-0037", parsed)
        entry = parsed["1589-1623"]
        self.assertEqual(entry["citescore"], 3.85)
        self.assertEqual(entry["h_index"], 72)
        self.assertEqual(entry["homepage_url"], "https://example.com/journal-ecology")
        self.assertIn("Agricultural Science and Fertilization", entry["topics_keywords"])
        self.assertIn("Soil Science", entry["subject_areas"])
        self.assertIn("scope_keywords", entry)
        self.assertIn("subject_area", entry)
        self.assertLessEqual(len(entry["scope_keywords"]), 8)
        self.assertLessEqual(len(entry["subject_area"]), 3)
        self.assertIsNotNone(entry["scope"])
        self.assertIn("Applied Ecology and Environmental Research", entry["scope"])

    def test_openalex_parsing_x_concepts_fallback(self):
        payload = {
            "results": [
                {
                    "id": "https://openalex.org/S99",
                    "display_name": "Fallback Journal",
                    "issn": ["2041-1723"],
                    "summary_stats": {"2yr_mean_citedness": 4.2, "h_index": 50},
                    "x_concepts": [
                        {"display_name": "Artificial Intelligence"},
                        {"display_name": "Machine Learning"},
                    ],
                }
            ]
        }
        parsed = OpenAlexSource.parse_response(payload)
        entry = parsed["2041-1723"]
        self.assertEqual(entry["topics_keywords"], ["Artificial Intelligence", "Machine Learning"])
        self.assertEqual(entry["subject_areas"], ["Artificial Intelligence", "Machine Learning"])
        self.assertIn("Artificial Intelligence", entry["scope"])

    def test_scimago_fetch_and_match_csv(self):
        class SjrCsvSpider:
            def fetch(self, url, headers=None, timeout=15):
                return MockResponse(
                    content=MOCK_SJR_CSV.encode('utf-8'),
                    status=200,
                    url=url
                )

        rows = SCImagoSource.fetch_sjr_catalog(SjrCsvSpider())
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['source_id'], '100147015')
        self.assertEqual(rows[0]['sjr'], 2.85)
        self.assertEqual(rows[0]['scopus_rank'], 'Q2')
        self.assertEqual(rows[0]['issns'], ['1589-1623', '1785-0037'])
        self.assertEqual(rows[0]['subject_area'], ['Ecology', 'Agronomy and Crop Science'])

        journals = [
            {
                'id': 'JOUR-0001',
                'name': 'Different Name',
                'issn': '1589-1623',
                'eissn': None,
                'sjr': 0.1,
                'sjr_year': 2024,
                'scopus_rank': 'Q4',
                'h_index': 10,
                'publisher': 'Unknown Publisher',
                'subject_area': ['General Multidisciplinary'],
            },
            {
                'id': 'JOUR-AMBIG',
                'name': 'Ambiguous Title',
                'issn': '9999-9999',
                'eissn': None,
                'sjr': 0.2,
                'scopus_rank': 'Q4',
                'h_index': 5,
            }
        ]
        sjr_map = SCImagoSource.match_sjr_to_journals(journals, rows, sjr_year=2025)
        self.assertEqual(sjr_map, {'JOUR-0001': '100147015'})
        self.assertEqual(journals[0]['sjr'], 2.85)
        self.assertEqual(journals[0]['sjr_year'], 2025)
        self.assertEqual(journals[0]['scopus_rank'], 'Q2')
        self.assertEqual(journals[0]['h_index'], 60)
        self.assertEqual(journals[0]['publisher'], 'Corvinus University of Budapest')
        self.assertEqual(journals[0]['subject_area'], ['Ecology', 'Agronomy and Crop Science'])
        self.assertEqual(journals[1]['sjr'], 0.2)

    def test_scimago_extract_scope_from_detail_html(self):
        scope = SCImagoSource.extract_scope_from_detail_html(MOCK_SJR_DETAIL_HTML)
        self.assertIsNotNone(scope)
        self.assertIn('ecosystem dynamics', scope)
        self.assertNotIn('Join the conversation', scope)
        self.assertNotIn('console.log', scope)

        cf_html = '<html><title>Just a moment...</title><body>Checking your browser</body></html>'
        self.assertIsNone(SCImagoSource.extract_scope_from_detail_html(cf_html))

    def test_scimago_incremental_cache_and_403_fallback(self):
        class FlakySjrSpider:
            def __init__(self):
                self.calls = []

            def fetch(self, url, headers=None, timeout=15):
                self.calls.append(url)
                if 'q=101' in url:
                    return MockResponse(
                        content=MOCK_SJR_DETAIL_HTML.encode('utf-8'),
                        status=200,
                        url=url
                    )
                raise SpiderError('Access denied or rate limited (HTTP 403)')

        with tempfile.TemporaryDirectory() as tmp_dir:
            cache_path = Path(tmp_dir) / 'sjr_scope_cache.json'
            journals = [
                {'id': 'JOUR-1', 'name': 'Journal One', 'scope': None},
                {'id': 'JOUR-2', 'name': 'Journal Two', 'scope': 'Existing OpenAlex scope'},
            ]
            sjr_map = {'JOUR-1': '101', 'JOUR-2': '202'}
            spider = FlakySjrSpider()

            stats1 = SCImagoSource.enrich_sjr_scopes_incremental(
                spider, journals, sjr_map, cache_path, limit=5
            )
            self.assertEqual(stats1['newly_fetched'], 1)
            self.assertTrue(stats1['blocked'])
            self.assertEqual(stats1['errors'], 1)
            self.assertIn('ecosystem dynamics', journals[0]['scope'])
            self.assertEqual(journals[1]['scope'], 'Existing OpenAlex scope')
            self.assertTrue(cache_path.exists())

            # Second run should apply cached scope for JOUR-1 without refetching 101
            journals_round2 = [{'id': 'JOUR-1', 'name': 'Journal One', 'scope': None}]
            spider2 = FlakySjrSpider()
            stats2 = SCImagoSource.enrich_sjr_scopes_incremental(
                spider2, journals_round2, {'JOUR-1': '101'}, cache_path, limit=5
            )
            self.assertEqual(stats2['cached_applied'], 1)
            self.assertEqual(stats2['newly_fetched'], 0)
            self.assertEqual(spider2.calls, [])
            self.assertIn('ecosystem dynamics', journals_round2[0]['scope'])

    def test_refresh_pipeline_merges_keywords_and_prefers_sjr_scope(self):
        class CombinedSpider:
            def fetch(self, url, headers=None, timeout=15):
                if 'openalex' in url:
                    return MockResponse(
                        content=json.dumps(MOCK_OPENALEX_JSON).encode('utf-8'),
                        status=200,
                        url=url
                    )
                if 'journalrank.php' in url:
                    return MockResponse(
                        content=MOCK_SJR_CSV.encode('utf-8'),
                        status=200,
                        url=url
                    )
                if 'journalsearch.php' in url:
                    return MockResponse(
                        content=MOCK_SJR_DETAIL_HTML.encode('utf-8'),
                        status=200,
                        url=url
                    )
                return MockResponse(content=b'{}', status=200, url=url)

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            in_file = tmp_path / 'in.json'
            out_file = tmp_path / 'out.json'
            in_file.write_text(json.dumps([
                {
                    'id': 'JOUR-0001',
                    'name': 'Applied Ecology and Environmental Research',
                    'issn': '1589-1623',
                    'eissn': '1785-0037',
                    'scopus_rank': 'Q3',
                    'citescore': 1.2,
                    'sjr': 0.231,
                    'h_index': 53,
                    'scope_keywords': ['Existing Keyword', 'Soil Science'],
                }
            ]), encoding='utf-8')

            report = refresh_journals(
                input_file=in_file,
                output_file=out_file,
                state_dir=tmp_path / 'cache',
                dry_run=False,
                skip_special_issues=True,
                skip_discovery=True,
                sjr_scope_limit=5,
                spider=CombinedSpider(),
            )
            self.assertEqual(report['sjr_matched'], 1)
            self.assertEqual(report['sjr_scopes_fetched'], 1)
            written = json.loads(out_file.read_text(encoding='utf-8'))
            item = written[0]
            self.assertIn('Existing Keyword', item['scope_keywords'])
            self.assertIn('Agricultural Science and Fertilization', item['scope_keywords'])
            self.assertLessEqual(len(item['scope_keywords']), 15)
            # Authentic SJR scope must override OpenAlex summary
            self.assertIn('ecosystem dynamics', item['scope'])
            self.assertEqual(item['sjr'], 2.85)
            self.assertEqual(item['scopus_rank'], 'Q2')

    def test_special_issue_extraction(self):
        issues = SpecialIssueSource.extract_from_html(MOCK_WIKICFP_HTML, min_date="2026-01-01")
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["title"], "AI-SPECIAL-2026")
        self.assertEqual(issues[0]["deadline"], "2026-11-20")
        self.assertIn("Special Issue", issues[0]["comment"])

    def test_special_issue_matching(self):
        journals = [
            {
                'id': 'JOUR-0010',
                'name': 'IEEE Transactions on Neural Networks',
                'issn': '1045-9227',
                'scopus_rank': 'Q1',
                'citescore': 10.5,
                'sjr': 2.1,
                'h_index': 150
            }
        ]
        issues = [
            {
                'journal_candidate': 'IEEE Transactions on Neural Networks',
                'title': 'Deep Learning Special Issue',
                'deadline': '2026-12-15',
                'link': 'https://example.com/cfp/dl2026',
                'comment': 'Special Issue on Deep Learning'
            }
        ]
        matched = SpecialIssueSource.match_to_journals(journals, issues)
        self.assertEqual(matched, 1)
        self.assertIn('submission_deadlines', journals[0])
        self.assertEqual(len(journals[0]['submission_deadlines']), 1)
        dl = journals[0]['submission_deadlines'][0]
        self.assertEqual(dl['deadline_dates']['deadline'], '2026-12-15')
        self.assertEqual(dl['deadline'], '2026-12-15T23:59:59-12:00')

    def test_refresh_journals_dry_run(self):
        dummy_spider = DummySpider()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            sample_file = tmp_path / 'sample_jour.json'
            sample_data = [
                {
                    'id': 'JOUR-0001',
                    'name': 'Applied Ecology and Environmental Research',
                    'issn': '1589-1623',
                    'eissn': '1785-0037',
                    'scopus_rank': 'Q3',
                    'citescore': 1.2,
                    'sjr': 0.231,
                    'h_index': 53
                }
            ]
            sample_file.write_text(json.dumps(sample_data), encoding='utf-8')
            output_file = tmp_path / 'out_jour.json'

            report = refresh_journals(
                input_file=sample_file,
                output_file=output_file,
                state_dir=tmp_path / 'cache',
                limit=1,
                dry_run=True,
                spider=dummy_spider
            )

            self.assertEqual(report['status'], 'success')
            self.assertEqual(report['processed'], 1)
            self.assertFalse(output_file.exists())  # Dry-run doesn't write output

            # Now run without dry_run
            report2 = refresh_journals(
                input_file=sample_file,
                output_file=output_file,
                state_dir=tmp_path / 'cache',
                limit=1,
                dry_run=False,
                spider=dummy_spider
            )
            self.assertTrue(output_file.exists())
            written = json.loads(output_file.read_text(encoding='utf-8'))
            self.assertEqual(len(written), 1)
            # Check updated citescore from OpenAlex mock (rounded to 1 decimal place)
            self.assertEqual(written[0]['citescore'], 3.9)
            self.assertEqual(written[0]['h_index'], 72)

    def test_refresh_journals_time_budget_pause_and_resume(self):
        dummy_spider = DummySpider()
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            sample_file = tmp_path / 'sample_jour.json'
            sample_data = [
                {
                    'id': f'JOUR-{i:04d}',
                    'name': f'Journal of Testing {i}',
                    'issn': f'1589-{i:04d}',
                    'scopus_rank': 'Q2',
                    'citescore': 2.0,
                    'sjr': 0.5,
                    'h_index': 40
                }
                for i in range(1, 10)
            ]
            sample_file.write_text(json.dumps(sample_data), encoding='utf-8')
            output_file = tmp_path / 'out_jour.json'
            gh_out = tmp_path / 'gh_out.txt'
            cache_dir = tmp_path / 'cache'

            # Slice 1: with max_minutes=0 (force pause)
            report = refresh_journals(
                input_file=sample_file,
                output_file=output_file,
                state_dir=cache_dir,
                batch_size=2,
                max_minutes=0,
                github_output=gh_out,
                spider=dummy_spider
            )
            self.assertEqual(report['status'], 'paused')
            self.assertEqual(report['run_status'], 'paused')
            cp_file = cache_dir / 'checkpoint.json'
            self.assertTrue(cp_file.exists())
            cp_data = json.loads(cp_file.read_text(encoding='utf-8'))
            self.assertEqual(cp_data['run_status'], 'paused')
            self.assertIn('status=paused', gh_out.read_text())

            # Slice 2: resume and complete
            report2 = refresh_journals(
                input_file=sample_file,
                output_file=output_file,
                state_dir=cache_dir,
                batch_size=2,
                max_minutes=25,
                github_output=gh_out,
                spider=dummy_spider
            )
            self.assertEqual(report2['status'], 'success')
            self.assertEqual(report2['run_status'], 'complete')
            self.assertTrue(output_file.exists())
            cp_data2 = json.loads(cp_file.read_text(encoding='utf-8'))
            self.assertEqual(cp_data2['run_status'], 'complete')
            self.assertIn('status=complete', gh_out.read_text())


if __name__ == '__main__':
    unittest.main()
