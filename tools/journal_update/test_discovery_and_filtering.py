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

