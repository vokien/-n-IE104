import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import cleaning as prep
import enricher
from refresh import FIELDS


class TestEnricher(unittest.TestCase):
    def test_fields_match_cleaning_conference_schema(self):
        self.assertIn('scope', FIELDS)
        self.assertEqual(set(FIELDS), prep.SCHEMAS['conference'])

    def test_cleaning_normalizes_scope_whitespace_and_empty_to_none(self):
        rows = [
            {
                'id': 'CONF-001',
                'name': 'Example Conf',
                'acronym': 'EC',
                'issn': None,
                'eissn': None,
                'publisher': None,
                'core_rank': 'A',
                'subject_area': ['Artificial Intelligence'],
                'scope_keywords': ['Machine Learning'],
                'scope': '  Research   on\n\tCafe\u0301   systems.  ',
                'submission_deadlines': [],
                'homepage_url': None,
            },
            {
                'id': 'CONF-002',
                'name': 'Second Conf',
                'acronym': 'SC',
                'issn': None,
                'eissn': None,
                'publisher': None,
                'core_rank': None,
                'subject_area': [],
                'scope_keywords': ['Security'],
                'scope': '   ',
                'submission_deadlines': [],
                'homepage_url': None,
            },
        ]
        audit = {'kind': 'conference', 'changes': [], 'issues': []}
        cleaned = prep.run_cleaning(rows, audit)
        self.assertEqual(cleaned[0]['scope'], 'Research on Caf\u00e9 systems.')
        self.assertIsNone(cleaned[1]['scope'])

    def test_for_code_mapping_covers_2020_2008_and_cse(self):
        core = {'primary_for': '4612 4613', 'secondary_for': 'CSE', 'tertiary_for': '0801'}
        subjects = enricher.subjects_from_core(core)
        self.assertEqual(
            subjects,
            [
                'Software Engineering',
                'Theory of Computation',
                'Computer Systems Engineering',
                'Artificial Intelligence and Image Processing',
            ],
        )

    def test_fill_subject_areas_from_core_preserves_nonempty(self):
        records = [
            {
                'core': {'id': '1', 'primary_for': '4604', 'secondary_for': '4606', 'tertiary_for': ''},
                'venue': {'id': 'CONF-001', 'subject_area': []},
            },
            {
                'core': {'id': '2', 'primary_for': '4600', 'secondary_for': '', 'tertiary_for': ''},
                'venue': {'id': 'CONF-002', 'subject_area': ['Artificial Intelligence']},
            },
        ]
        filled = enricher.fill_subject_areas_from_core(records)
        self.assertEqual(filled, 1)
        self.assertEqual(
            records[0]['venue']['subject_area'],
            ['Cybersecurity and Privacy', 'Distributed Computing and Systems Software'],
        )
        self.assertEqual(records[1]['venue']['subject_area'], ['Artificial Intelligence'])

    def test_fetch_icore_conference_info_parses_html_and_handles_network_errors(self):
        sample_html = b'''
        <html><body>
        <div class="detail">
            <div class="row">Source: ICORE2026</div>
            <div class="row">Rank: A*</div>
            <div class="row">Field Of Research: 4613 - Theory of computation</div>
        </div>
        <div class="detail">
            <div class="row">Source: CORE2018</div>
            <div class="row">Field Of Research: 0802 - Computation Theory and Mathematics\xe2\x80\xa0</div>
        </div>
        </body></html>
        '''
        info = enricher.fetch_icore_conference_info('1772', fetcher=lambda url, timeout=15: sample_html)
        self.assertIsNotNone(info)
        self.assertEqual(info['for_codes'], ['4613', '0802'])
        self.assertEqual(info['for_labels']['4613'], 'Theory of computation')
        self.assertEqual(info['for_labels']['0802'], 'Computation Theory and Mathematics')

        def failing_fetcher(url, timeout=15):
            raise TimeoutError('simulated timeout')

        # Network errors should return None/default mapping gracefully without raising.
        self.assertIsNone(enricher.fetch_icore_conference_info('1772', fetcher=lambda u, timeout=15: None))
        subj_map = enricher.fetch_icore_subjects_map(core_ids=['1772'], fetcher=failing_fetcher)
        self.assertIn('4602', subj_map)

    def test_strict_openalex_matching_prevents_false_acronym_collision(self):
        venue = {
            'id': 'CONF-043',
            'name': 'International Conference on Function Programming',
            'acronym': 'ICFP',
        }
        wrong_candidate = {
            'id': 'https://openalex.org/S1',
            'display_name': 'International Conference on Flavor Physics (ICFP)',
            'type': 'conference',
            'alternate_titles': [],
        }
        right_candidate = {
            'id': 'https://openalex.org/S2',
            'display_name': 'ACM SIGPLAN International Conference on Functional Programming (ICFP)',
            'type': 'conference',
            'alternate_titles': [],
        }
        self.assertFalse(enricher.is_strict_openalex_match(venue, wrong_candidate))
        self.assertTrue(enricher.is_strict_openalex_match(venue, right_candidate))

    def test_enrich_conferences_uses_mock_openalex_cache_and_limit(self):
        rows = [
            {
                'id': 'CONF-043',
                'name': 'International Conference on Function Programming',
                'acronym': 'ICFP',
                'subject_area': [],
                'scope_keywords': ['functional programming'],
                'scope': None,
            },
            {
                'id': 'CONF-096',
                'name': 'International Conference on Research on Development in Information Retrieval',
                'acronym': 'SIGIR',
                'subject_area': [],
                'scope_keywords': ['IR'],
                'scope': None,
            },
        ]
        core_by_id = {
            'CONF-043': {'primary_for': '4612', 'secondary_for': '', 'tertiary_for': ''},
            'CONF-096': {'primary_for': '4605', 'secondary_for': '', 'tertiary_for': ''},
        }
        calls = []

        def mock_fetcher(url, timeout=15):
            calls.append(url)
            if 'ICFP' in url:
                payload = {
                    'results': [
                        {
                            'id': 'https://openalex.org/S999',
                            'display_name': 'International Conference on Flavor Physics (ICFP)',
                            'type': 'conference',
                            'topics': [{'display_name': 'Particle physics', 'count': 100}],
                        },
                        {
                            'id': 'https://openalex.org/S100',
                            'display_name': 'ACM SIGPLAN International Conference on Functional Programming (ICFP)',
                            'type': 'conference',
                            'works_count': 800,
                            'topics': [
                                {
                                    'display_name': 'Logic, programming, and type systems',
                                    'count': 200,
                                    'subfield': {'display_name': 'Software'},
                                },
                                {
                                    'display_name': 'Formal Methods in Verification',
                                    'count': 120,
                                    'subfield': {'display_name': 'Software'},
                                },
                            ],
                        },
                    ]
                }
                return json.dumps(payload).encode('utf-8')
            return json.dumps({'results': []}).encode('utf-8')

        with tempfile.TemporaryDirectory() as tmp:
            state_dir = Path(tmp)
            # Budget limit 1 allows only the first conference to hit the mock network.
            stats = enricher.enrich_conferences(
                rows,
                core_by_id=core_by_id,
                state_dir=state_dir,
                enrich_limit=1,
                enable_network=True,
                fetcher=mock_fetcher,
            )
            self.assertEqual(stats['subject_area_filled_from_for'], 2)
            self.assertEqual(stats['openalex_network_queries'], 1)
            self.assertEqual(stats['openalex_matched'], 1)
            self.assertEqual(rows[0]['subject_area'], ['Software Engineering'])
            self.assertIn('Logic, programming, and type systems', rows[0]['scope_keywords'])
            self.assertIsNotNone(rows[0]['scope'])
            self.assertIn('Software Engineering', rows[0]['scope'])
            self.assertLessEqual(len(rows[0]['scope']), 480)
            self.assertTrue((state_dir / 'enrichment_cache.json').exists())

            # Second run should reuse cache for CONF-043 without repeating that network call.
            rows[0]['scope'] = None
            rows[0]['scope_keywords'] = ['functional programming']
            calls.clear()
            stats2 = enricher.enrich_conferences(
                rows,
                core_by_id=core_by_id,
                state_dir=state_dir,
                enrich_limit=1,
                enable_network=True,
                fetcher=mock_fetcher,
            )
            self.assertGreaterEqual(stats2['openalex_cache_hits'], 1)
            self.assertIn('Logic, programming, and type systems', rows[0]['scope_keywords'])
            self.assertTrue(all('ICFP' not in u for u in calls))


if __name__ == '__main__':
    unittest.main()
