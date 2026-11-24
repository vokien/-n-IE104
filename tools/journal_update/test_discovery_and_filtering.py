import sys
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from sources import OpenAlexSource
from normalizer import normalize_all


class FakeSpider:
    def __init__(self, payload):
        self.payload = payload

    def fetch(self, url, timeout=10):
        class Resp:
            def __init__(self, data):
                self._data = data
            def json(self):
                return self._data
        return Resp(self.payload)


class TestJournalDiscoveryAndFilter(unittest.TestCase):
    def test_discover_new_journals_allocates_sequential_ids(self):
        existing = [
            {'id': 'JOUR-0001', 'name': 'IEEE Transactions on Software Engineering', 'issn': '0098-5589', 'eissn': None}
        ]
        mock_payload = {
            'results': [
                {
                    'display_name': 'ACM Transactions on Privacy and Security',
                    'issn': ['2471-2566', '2471-2574'],
                    'host_organization_name': 'Association for Computing Machinery',
                    'works_count': 500,
                    'homepage_url': 'https://tops.acm.org',
                    'summary_stats': {'2yr_mean_citedness': 3.5, 'h_index': 45},
                    'x_concepts': [{'display_name': 'Computer Security'}]
                }
            ]
        }
        spider = FakeSpider(mock_payload)
        discovered = OpenAlexSource.discover_new_journals(spider, existing, max_to_add=5)
        self.assertEqual(len(discovered), 1)
        item = discovered[0]
        self.assertEqual(item['id'], 'JOUR-0002')
        self.assertEqual(item['name'], 'ACM Transactions on Privacy and Security')
        self.assertEqual(item['issn'], '2471-2566')
        self.assertEqual(item['eissn'], '2471-2574')
        self.assertEqual(item['publisher'], 'Association for Computing Machinery')
        self.assertEqual(item['scopus_rank'], 'Q2')  # derived from sjr = 3.5 * 0.18 = 0.63 -> Q2

    def test_discover_new_journals_gap_recovery(self):
        existing = [
            {'id': 'JOUR-0001', 'name': 'Journal A', 'issn': '1111-1111', 'eissn': None},
            {'id': 'JOUR-0003', 'name': 'Journal C', 'issn': '3333-3333', 'eissn': None}
        ]
        mock_payload = {
            'results': [
                {
                    'display_name': 'Journal B',
                    'issn': ['2222-2222'],
                    'host_organization_name': 'Publisher B',
                    'works_count': 300,
                    'homepage_url': 'https://example.com/b',
                    'summary_stats': {'2yr_mean_citedness': 2.0, 'h_index': 20},
                    'x_concepts': [{'display_name': 'Computer Science'}]
                },
                {
                    'display_name': 'Journal D',
                    'issn': ['4444-4444'],
                    'host_organization_name': 'Publisher D',
                    'works_count': 400,
                    'homepage_url': 'https://example.com/d',
                    'summary_stats': {'2yr_mean_citedness': 2.5, 'h_index': 25},
                    'x_concepts': [{'display_name': 'Computer Science'}]
                }
            ]
        }
        spider = FakeSpider(mock_payload)
        discovered = OpenAlexSource.discover_new_journals(spider, existing, max_to_add=5)
        self.assertEqual(len(discovered), 2)
        # First discovered should recover gap JOUR-0002
        self.assertEqual(discovered[0]['id'], 'JOUR-0002')
        self.assertEqual(discovered[0]['name'], 'Journal B')
        # Second discovered should allocate JOUR-0004
        self.assertEqual(discovered[1]['id'], 'JOUR-0004')
        self.assertEqual(discovered[1]['name'], 'Journal D')

    def test_discover_new_journals_deduplication_by_normalized_name(self):
        existing = [
            {'id': 'JOUR-0001', 'name': 'ACM Transactions on Privacy and Security', 'issn': '0000-0000'}
        ]
        mock_payload = {
            'results': [
                {
                    'display_name': '  acm TRANSACTIONS on privacy and security  ',
                    'issn': ['9999-9999'],
                    'host_organization_name': 'Another Publisher',
                    'works_count': 500,
                    'homepage_url': 'https://example.com/fake',
                    'summary_stats': {'2yr_mean_citedness': 3.0, 'h_index': 30},
                    'x_concepts': [{'display_name': 'Security'}]
                }
            ]
        }
        spider = FakeSpider(mock_payload)
        discovered = OpenAlexSource.discover_new_journals(spider, existing, max_to_add=5)
        self.assertEqual(len(discovered), 0, "Journal with duplicate normalized name must be skipped")

    def test_discover_new_journals_deduplication_by_issn(self):
        existing = [
            {'id': 'JOUR-0001', 'name': 'Original Name', 'issn': '2471-2566'}
        ]
        mock_payload = {
            'results': [
                {
                    'display_name': 'Different Name Entirely',
                    'issn': ['2471-2566'],
                    'host_organization_name': 'Publisher',
                    'works_count': 500,
                    'homepage_url': 'https://example.com/orig',
                    'summary_stats': {'2yr_mean_citedness': 3.0, 'h_index': 30},
                    'x_concepts': [{'display_name': 'Security'}]
                }
            ]
        }
        spider = FakeSpider(mock_payload)
        discovered = OpenAlexSource.discover_new_journals(spider, existing, max_to_add=5)
        self.assertEqual(len(discovered), 0, "Journal with duplicate ISSN must be skipped")

    def test_discover_new_journals_empty_existing(self):
        existing = []
        mock_payload = {
            'results': [
                {
                    'display_name': 'First Journal Ever',
                    'issn': ['1234-5678'],
                    'host_organization_name': 'Publisher Alpha',
                    'works_count': 500,
                    'homepage_url': 'https://example.com/alpha',
                    'summary_stats': {'2yr_mean_citedness': 4.0, 'h_index': 40},
                    'x_concepts': [{'display_name': 'AI'}]
                }
            ]
        }
        spider = FakeSpider(mock_payload)
        discovered = OpenAlexSource.discover_new_journals(spider, existing, max_to_add=5)
        self.assertEqual(len(discovered), 1)
        self.assertEqual(discovered[0]['id'], 'JOUR-0001')

    def test_filter_inactive_journals(self):
        journals = [
            {'id': 'JOUR-0001', 'name': 'Active Journal', 'issn': '1111-1111'},
            {'id': 'JOUR-0002', 'name': 'Defunct Journal', 'issn': '2222-2222'}
        ]
        metrics = {
            '1111-1111': {'is_active': True, 'citescore': 2.0},
            '2222-2222': {'is_active': False, 'citescore': 0.0}
        }
        active, inactive = OpenAlexSource.filter_inactive_journals(journals, metrics)
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]['id'], 'JOUR-0001')
        self.assertEqual(len(inactive), 1)
        self.assertEqual(inactive[0]['id'], 'JOUR-0002')


if __name__ == '__main__':
    unittest.main()

