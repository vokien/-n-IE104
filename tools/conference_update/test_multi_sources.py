import sys
from pathlib import Path
import unittest
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from multi_sources import (
    clean_str,
    normalize_acronym,
    parse_deadline_entry,
    detect_publisher_from_metadata,
    integrate_curated_into_seed,
    safe_fetch
)


class TestMultiSources(unittest.TestCase):
    def test_clean_str_and_normalize_acronym(self):
        self.assertEqual(clean_str("  NeurIPS \n 2026 "), "NeurIPS 2026")
        self.assertEqual(normalize_acronym("NeurIPS 2026"), "NEURIPS")
        self.assertEqual(normalize_acronym("IEEE S&P 2025"), "IEEESP")
        self.assertEqual(normalize_acronym("ACM CCS"), "ACMCCS")

    def test_parse_deadline_entry_various_formats(self):
        # ISO format
        dl1 = parse_deadline_entry("2026-05-15 23:59:59", 2026, "Round 1", "https://conf.org")
        self.assertIsNotNone(dl1)
        self.assertEqual(dl1['deadline_dates']['deadline'], "2026-05-15")
        self.assertEqual(dl1['original_timezone'], "AoE")
        self.assertTrue(dl1['deadline'].endswith("-12:00"))

        # Month string format
        dl2 = parse_deadline_entry("15 Jan 2026", 2026, "Round 2", "https://conf.org")
        self.assertIsNotNone(dl2)
        self.assertEqual(dl2['deadline_dates']['deadline'], "2026-01-15")

        # Unknown / None / TBD
        self.assertIsNone(parse_deadline_entry("TBD", 2026))
        self.assertIsNone(parse_deadline_entry(None, 2026))

    def test_detect_publisher_from_metadata(self):
        self.assertEqual(detect_publisher_from_metadata("IEEE Conference on Security", "https://sp2026.ieee.org"), "IEEE")
        self.assertEqual(detect_publisher_from_metadata("ACM SIGSAC Conference", "https://sigsac.org/ccs"), "ACM")
        self.assertEqual(detect_publisher_from_metadata("USENIX Security Symposium", "https://usenix.org/sec26"), "USENIX")
        self.assertEqual(detect_publisher_from_metadata("LNCS Conference", "https://springer.com/lncs"), "Springer")

    def test_integrate_curated_into_seed(self):
        seed_records = [
            {
                'core': {'id': '1', 'name': 'Existing Conf', 'acronym': 'EXCONF', 'source': 'ICORE2026', 'rank': 'A'},
                'venue': {'id': 'CONF-001', 'name': 'Existing Conf', 'acronym': 'EXCONF', 'submission_deadlines': []}
            }
        ]
        curated_venues = [
            # Existing venue candidate
            {
                'name': 'Existing Conf',
                'acronym': 'EXCONF',
                'norm_acronym': 'EXCONF',
                'homepage_url': 'https://exconf.org',
                'subject_area': ['Computer Science'],
                'scope_keywords': ['Testing'],
                'submission_deadlines': [{'deadline': '2026-06-01T23:59:59-12:00', 'deadline_dates': {'deadline': '2026-06-01'}}],
                'source': 'test'
            },
            # Novel venue candidate
            {
                'name': 'Novel AI Conference',
                'acronym': 'NOVELAI',
                'norm_acronym': 'NOVELAI',
                'homepage_url': 'https://novelai.org',
                'subject_area': ['Artificial Intelligence'],
                'scope_keywords': ['AI', 'Robotics'],
                'submission_deadlines': [{'deadline': '2026-07-01T23:59:59-12:00', 'deadline_dates': {'deadline': '2026-07-01'}}],
                'source': 'ai-deadlines'
            }
        ]

        updated, stats = integrate_curated_into_seed(seed_records, curated_venues, '2026-01-01')
        self.assertEqual(stats['existing_venues_matched'], 1)
        self.assertEqual(stats['new_venues_discovered'], 1)
        self.assertEqual(len(updated), 2)

        novel = updated[1]
        self.assertEqual(novel['venue']['id'], 'CONF-002')
        self.assertEqual(novel['venue']['acronym'], 'NOVELAI')
        self.assertIsNone(novel['venue']['core_rank'])  # None is Unranked per cleaning policy

    def test_safe_fetch_graceful_degradation(self):
        # Non-existent domain should gracefully return None without raising exception
        res = safe_fetch("https://invalid-non-existent-domain-123456789.org/test.yml", timeout=1, max_retries=1)
        self.assertIsNone(res)


if __name__ == '__main__':
    unittest.main()
