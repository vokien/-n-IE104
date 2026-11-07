"""
Unit tests for tools/journal_update/normalizer.py.
Covers real-world dataset verification (8,277 journals) and all artificial edge cases.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from normalizer import (
    clean_text,
    normalize_issn,
    normalize_rank,
    safe_float,
    safe_int,
    safe_url,
    unique_string_list,
    normalize_deadline,
    normalize_journal,
    normalize_all,
    ValidationError
)

ROOT = Path(__file__).resolve().parents[2]
JOUR_JSON = ROOT / 'data' / 'jour.json'


class TestJournalNormalizer(unittest.TestCase):

    def test_clean_text(self):
        self.assertEqual(clean_text("  IEEE Transactions   on AI  "), "IEEE Transactions on AI")
        self.assertEqual(clean_text(None), "")
        self.assertEqual(clean_text("Hello\x00World\t!"), "Hello World !")

    def test_normalize_issn_valid_and_variants(self):
        self.assertEqual(normalize_issn("1234-5678"), "1234-5678")
        self.assertEqual(normalize_issn("12345678"), "1234-5678")
        self.assertEqual(normalize_issn("1234-567x"), "1234-567X")
        self.assertEqual(normalize_issn("  1234 5678 "), "1234-5678")
        self.assertIsNone(normalize_issn("12345"))
        self.assertIsNone(normalize_issn(""))
        self.assertIsNone(normalize_issn(None))

    def test_normalize_rank(self):
        self.assertEqual(normalize_rank("Q1"), "Q1")
        self.assertEqual(normalize_rank("q2"), "Q2")
        self.assertEqual(normalize_rank("Scopus Q3 Tier"), "Q3")
        # Missing rank fallback to SJR
        self.assertEqual(normalize_rank(None, sjr=0.9), "Q1")
        self.assertEqual(normalize_rank("", sjr=0.5), "Q2")
        self.assertEqual(normalize_rank(None, sjr=0.25), "Q3")
        self.assertEqual(normalize_rank(None, sjr=0.05), "Q4")

    def test_safe_float_and_int(self):
        self.assertEqual(safe_float("1.25"), 1.25)
        self.assertEqual(safe_float("2,85"), 2.85)  # European comma
        self.assertEqual(safe_float(None, default=0.0), 0.0)
        self.assertEqual(safe_float(-5.0, default=0.0), 0.0)  # Negative
        self.assertEqual(safe_float(float('nan'), default=0.0), 0.0)  # NaN

        self.assertEqual(safe_int(42), 42)
        self.assertEqual(safe_int("53"), 53)
        self.assertEqual(safe_int("12.8"), 12)
        self.assertEqual(safe_int(-10), 0)
        self.assertEqual(safe_int(None), 0)

    def test_safe_url(self):
        self.assertEqual(safe_url("https://example.com/journal"), "https://example.com/journal")
        self.assertEqual(safe_url("http://aloki.hu/"), "http://aloki.hu/")
        self.assertIsNone(safe_url("javascript:alert(1)"))
        self.assertIsNone(safe_url("ftp://server.com"))
        self.assertIsNone(safe_url("invalid-url"))
        self.assertIsNone(safe_url(None))

    def test_unique_string_list(self):
        items = ["AI", "Machine Learning", "ai", "  Deep Learning  ", ""]
        expected = ["AI", "Machine Learning", "Deep Learning"]
        self.assertEqual(unique_string_list(items), expected)

    def test_normalize_special_issue_deadline(self):
        # Case 1: Date string YYYY-MM-DD
        dl1 = {
            'year': 2026,
            'deadline': '2026-11-30',
            'comment': 'Special Issue on Foundation Models',
            'link': 'https://example.com/cfp'
        }
        res1 = normalize_deadline(dl1)
        self.assertIsNotNone(res1)
        self.assertEqual(res1['deadline'], '2026-11-30T23:59:59-12:00')
        self.assertEqual(res1['deadline_dates']['deadline'], '2026-11-30')
        self.assertEqual(res1['comment'], 'Special Issue on Foundation Models')

        # Case 2: Full ISO timestamp with UTC
        dl2 = {
            'year': 2026,
            'deadline': '2026-12-15T18:00:00Z',
            'comment': 'Special Issue on Quantum Computing'
        }
        res2 = normalize_deadline(dl2)
        self.assertIsNotNone(res2)
        self.assertEqual(res2['deadline_dates']['deadline'], '2026-12-15')

        # Case 3: Invalid deadline
        self.assertIsNone(normalize_deadline({'deadline': 'unknown'}))

    def test_normalize_journal_edge_cases(self):
        # Only eissn, no print issn
        item = {
            'id': 'JOUR-TEST-1',
            'name': 'Open Access Journal of Robotics',
            'issn': None,
            'eissn': '2095-123X',
            'sjr': '0,95',
            'citescore': 4.5,
            'h_index': 30,
            'scopus_rank': 'q1',
            'subject_area': ['Robotics', 'robotics'],
            'homepage_url': 'https://robotics-journal.org'
        }
        normalized = normalize_journal(item)
        self.assertIsNone(normalized['issn'])
        self.assertEqual(normalized['eissn'], '2095-123X')
        self.assertEqual(normalized['sjr'], 0.95)
        self.assertEqual(normalized['scopus_rank'], 'Q1')
        self.assertEqual(normalized['subject_area'], ['Robotics'])

    def test_all_real_data_8277_journals(self):
        """Verify that every single journal in data/jour.json passes without error."""
        if not JOUR_JSON.exists():
            self.skipTest(f"{JOUR_JSON} does not exist")
        
        raw_data = json.loads(JOUR_JSON.read_text(encoding='utf-8'))
        self.assertGreater(len(raw_data), 8000)

        cleaned, report = normalize_all(raw_data)
        
        self.assertEqual(report['rejected'], 0, f"Rejected journals: {report['errors']}")
        self.assertEqual(len(cleaned), len(raw_data))
        self.assertEqual(report['accepted'], len(raw_data))
        
        # Verify that all ranks are valid
        for item in cleaned:
            self.assertIn(item['scopus_rank'], ('Q1', 'Q2', 'Q3', 'Q4'))
            self.assertTrue(item['issn'] or item['eissn'])
            self.assertIsInstance(item['sjr'], float)
            self.assertIsInstance(item['citescore'], float)
            self.assertIsInstance(item['h_index'], int)


if __name__ == '__main__':
    unittest.main()
