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
from sources import OpenAlexSource, SpecialIssueSource, normalize_title_key
from spider import JournalSpider, MockResponse
from refresh import refresh_journals, atomic_write_json


MOCK_OPENALEX_JSON = {
    "results": [
        {
            "id": "https://openalex.org/S12345",
            "issn": ["1589-1623", "1785-0037"],
            "summary_stats": {
                "2yr_mean_citedness": 3.85,
                "h_index": 72
            },
            "homepage_url": "https://example.com/journal-ecology",
            "is_oa": True
        }
    ]
}

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


if __name__ == '__main__':
    unittest.main()
