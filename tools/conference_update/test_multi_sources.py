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
    safe_fetch,
    FOR_MAP,
    map_for_code,
    subjects_from_core,
    CCF_TAG_MAP
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
        self.assertIn('scope', novel['venue'])
        self.assertIsNone(novel['venue']['scope'])

    def test_safe_fetch_graceful_degradation(self):
        # Non-existent domain should gracefully return None without raising exception
        res = safe_fetch("https://invalid-non-existent-domain-123456789.org/test.yml", timeout=1, max_retries=1)
        self.assertIsNone(res)

    def test_integrate_curated_into_seed_gap_recovery(self):
        seed_records = [
            {
                'core': {'id': '1', 'name': 'Conf One', 'acronym': 'C1', 'source': 'ICORE2026', 'rank': 'A'},
                'venue': {'id': 'CONF-001', 'name': 'Conf One', 'acronym': 'C1', 'submission_deadlines': []}
            },
            {
                'core': {'id': '3', 'name': 'Conf Three', 'acronym': 'C3', 'source': 'ICORE2026', 'rank': 'B'},
                'venue': {'id': 'CONF-003', 'name': 'Conf Three', 'acronym': 'C3', 'submission_deadlines': []}
            }
        ]
        curated_venues = [
            {
                'name': 'Novel Conf Two',
                'acronym': 'C2',
                'norm_acronym': 'C2',
                'homepage_url': 'https://c2.org',
                'subject_area': ['Computer Science'],
                'scope_keywords': ['C2'],
                'submission_deadlines': [],
                'source': 'test'
            },
            {
                'name': 'Novel Conf Four',
                'acronym': 'C4',
                'norm_acronym': 'C4',
                'homepage_url': 'https://c4.org',
                'subject_area': ['Computer Science'],
                'scope_keywords': ['C4'],
                'submission_deadlines': [],
                'source': 'test'
            }
        ]
        updated, stats = integrate_curated_into_seed(seed_records, curated_venues, '2026-01-01', conf_path=None)
        self.assertEqual(stats['new_venues_discovered'], 2)
        # First novel venue fills gap CONF-002
        self.assertEqual(updated[2]['venue']['id'], 'CONF-002')
        # Second novel venue takes next sequential CONF-004
        self.assertEqual(updated[3]['venue']['id'], 'CONF-004')

    def test_integrate_curated_into_seed_reuse_existing_public_id(self):
        import json, tempfile
        seed_records = [
            {
                'core': {'id': '1', 'name': 'Existing Conf', 'acronym': 'EX', 'source': 'ICORE2026', 'rank': 'A'},
                'venue': {'id': 'CONF-001', 'name': 'Existing Conf', 'acronym': 'EX', 'submission_deadlines': []}
            }
        ]
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump([
                {'id': 'CONF-990', 'name': 'Public Conf', 'acronym': 'PC', 'submission_deadlines': []}
            ], f)
            temp_conf = Path(f.name)

        try:
            curated_venues = [
                {
                    'name': 'Public Conf',
                    'acronym': 'PC',
                    'norm_acronym': 'PC',
                    'homepage_url': 'https://pc.org',
                    'subject_area': ['Computer Science'],
                    'scope_keywords': ['PC'],
                    'submission_deadlines': [],
                    'source': 'test'
                }
            ]
            updated, stats = integrate_curated_into_seed(seed_records, curated_venues, '2026-01-01', conf_path=temp_conf)
            self.assertEqual(stats['new_venues_discovered'], 1)
            # Reuses CONF-990 from public conf.json
            self.assertEqual(updated[1]['venue']['id'], 'CONF-990')
        finally:
            temp_conf.unlink(missing_ok=True)

    def test_for_map_and_subjects_from_core(self):
        self.assertEqual(FOR_MAP['46'], 'Computer Science')
        self.assertEqual(FOR_MAP['4601'], 'Applied Computing')
        self.assertEqual(FOR_MAP['4602'], 'Artificial Intelligence')
        self.assertEqual(FOR_MAP['4603'], 'Computer Vision and Multimedia')
        self.assertEqual(FOR_MAP['4604'], 'Cybersecurity and Privacy')
        self.assertEqual(FOR_MAP['4605'], 'Data Management and Data Science')
        self.assertEqual(FOR_MAP['4606'], 'Distributed Computing and Systems Software')
        self.assertEqual(FOR_MAP['4607'], 'Graphics, Augmented Reality and Games')
        self.assertEqual(FOR_MAP['4608'], 'Human-Centred Computing')
        self.assertEqual(FOR_MAP['4609'], 'Information Systems')
        self.assertEqual(FOR_MAP['4610'], 'Machine Learning')
        self.assertEqual(FOR_MAP['4611'], 'Natural Language Processing')
        self.assertEqual(FOR_MAP['4612'], 'Software Engineering')
        self.assertEqual(FOR_MAP['4613'], 'Theory of Computation')

        core_rec = {
            'primary_for': '4602 4604',
            'secondary_for': '4605',
            'tertiary_for': ''
        }
        subjects = subjects_from_core(core_rec)
        self.assertEqual(
            subjects,
            ['Artificial Intelligence', 'Cybersecurity and Privacy', 'Data Management and Data Science']
        )

    def test_integrate_curated_enriches_empty_seed_subject_area(self):
        seed_records = [
            {
                'core': {'id': '10', 'name': 'AI Conf', 'acronym': 'AIC', 'source': 'ICORE2026', 'rank': 'A', 'primary_for': '4602'},
                'venue': {'id': 'CONF-010', 'name': 'AI Conf', 'acronym': 'AIC', 'subject_area': [], 'submission_deadlines': []}
            }
        ]
        curated_venues = [
            {
                'name': 'AI Conf',
                'acronym': 'AIC',
                'norm_acronym': 'AIC',
                'homepage_url': 'https://aic.org',
                'subject_area': ['Artificial Intelligence'],
                'scope_keywords': ['Deep Learning'],
                'submission_deadlines': [],
                'source': 'ai-deadlines'
            }
        ]
        updated, stats = integrate_curated_into_seed(seed_records, curated_venues, '2026-01-01')
        self.assertEqual(stats['existing_venues_matched'], 1)
        self.assertEqual(updated[0]['venue']['subject_area'], ['Artificial Intelligence'])
        self.assertIn('Deep Learning', updated[0]['venue']['scope_keywords'])

    def test_wiki_extract_supplemental_bullet_topics(self):
        from wiki_extract import extract
        html = '''<div class="cfp">
        Call for Papers: Example Systems 2027
        Important Dates:
        - Submission Deadline: 2027-02-15
        - Contact: chair@systems2027.org
        Research Topics:
        - Distributed consensus protocols
        - Fault-tolerant replication
        - Cloud computing architectures
        </div>'''
        res = extract(html, {})
        self.assertIn('Distributed consensus protocols', res['scope_keywords'])
        self.assertIn('Fault-tolerant replication', res['scope_keywords'])
        self.assertIn('Cloud computing architectures', res['scope_keywords'])
        # Noise must not be in keywords
        self.assertNotIn('Submission Deadline: 2027-02-15', res['scope_keywords'])
        self.assertNotIn('Contact: chair@systems2027.org', res['scope_keywords'])


if __name__ == '__main__':
    unittest.main()
