"""
Main coordinator for journal metadata update and Special Issues crawling.
Performs batch extraction, atomic file replacement, and checkpoint resilience.
"""

from __future__ import annotations

import argparse
import copy
import json
import logging
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_DATA = ROOT / 'data' / 'jour.json'

if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from normalizer import normalize_all, normalize_journal, clean_text
from sources import OpenAlexSource, SpecialIssueSource, WIKICFP_SEARCH_URL
from spider import JournalSpider, SpiderError

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)


def chunk_list(items: list, size: int):
    """Yield successive n-sized chunks from items."""
    for i in range(0, len(items), size):
        yield items[i:i + size]


def atomic_write_json(target_path: Path, data: any):
    """Write data to a temporary file in the same directory, then atomically replace."""
    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_fd, temp_file = tempfile.mkstemp(dir=target_path.parent, prefix='jour_tmp_', suffix='.json')
    try:
        with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        shutil.move(temp_file, target_path)
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except OSError:
                pass


def write_journal_gh_output(status: str, completed: int | None = None, total: int | None = None, target: Path | str | None = None):
    output_target = target or os.environ.get('GITHUB_OUTPUT')
    if output_target:
        try:
            with open(output_target, 'a', encoding='utf-8') as stream:
                stream.write(f"status={status}\n")
                if completed is not None:
                    stream.write(f"completed_count={completed}\n")
                if total is not None:
                    stream.write(f"total_count={total}\n")
        except OSError:
            pass


def refresh_journals(
    input_file: Path = DEFAULT_DATA,
    output_file: Path = DEFAULT_DATA,
    state_dir: Path | None = None,
    batch_size: int = 50,
    limit: int | None = None,
    dry_run: bool = False,
    skip_openalex: bool = False,
    skip_special_issues: bool = False,
    skip_discovery: bool = False,
    discover_limit: int = 15,
    spider: JournalSpider | None = None,
    max_minutes: int = 25,
    github_output: Path | str | None = None
) -> dict:
    """Execute end-to-end journal refresh pipeline."""
    start_time = time.time()
    deadline = start_time + max_minutes * 60
    input_file = Path(input_file)
    output_file = Path(output_file)

    if state_dir is None:
        state_dir = ROOT / '.cache' / 'journal_update'
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_file = state_dir / 'checkpoint.json'
    report_file = state_dir / 'report.json'

    if not input_file.exists():
        raise FileNotFoundError(f"Input journal file not found: {input_file}")

    checkpoint = {}
    if checkpoint_file.exists():
        try:
            checkpoint = json.loads(checkpoint_file.read_text(encoding='utf-8'))
        except Exception as e:
            logger.warning(f"Could not load checkpoint: {e}")

    is_resumed = (checkpoint.get('run_status') == 'paused')

    logger.info(f"Loading journals from {input_file}...")
    raw_journals = json.loads(input_file.read_text(encoding='utf-8'))
    total_journals = len(raw_journals)
    logger.info(f"Loaded {total_journals} journal records.")

    # Apply limit if specified
    records_to_process = raw_journals[:limit] if limit else raw_journals

    if spider is None:
        spider = JournalSpider(delay=0.5, max_retries=3)

    metrics_updated = checkpoint.get('metrics_updated', 0) if is_resumed else 0
    special_issues_found = 0
    special_issues_matched = 0

    # 1. Update Metrics via OpenAlex (Batch mode)
    all_openalex_metrics = checkpoint.get('all_openalex_metrics', {}) if is_resumed else {}
    start_batch_idx = checkpoint.get('openalex_batch_idx', 0) if is_resumed else 0

    if not skip_openalex:
        logger.info("Starting OpenAlex batch metric update...")
        # Collect ISSNs
        issn_map = {}
        for r in records_to_process:
            for field in ('issn', 'eissn'):
                val = r.get(field)
                if val:
                    issn_map.setdefault(val, []).append(r)

        issn_list = list(issn_map.keys())
        chunks = list(chunk_list(issn_list, batch_size))
        logger.info(f"Querying OpenAlex for {len(issn_list)} ISSNs across {len(chunks)} batches (resuming from batch {start_batch_idx})...")

        for idx, chunk in enumerate(chunks, 1):
            if idx <= start_batch_idx:
                continue

            # Time budget check between batches
            if time.time() >= deadline:
                logger.info(f"[PAUSED] Time slice budget reached ({max_minutes}m) at OpenAlex batch {idx-1}/{len(chunks)}.")
                cp_data = {
                    'run_status': 'paused',
                    'phase': 'openalex',
                    'openalex_batch_idx': idx - 1,
                    'total_batches': len(chunks),
                    'all_openalex_metrics': all_openalex_metrics,
                    'records_to_process': records_to_process,
                    'metrics_updated': metrics_updated
                }
                atomic_write_json(checkpoint_file, cp_data)
                write_journal_gh_output('paused', completed=idx - 1, total=len(chunks), target=github_output)
                return {
                    'status': 'paused',
                    'run_status': 'paused',
                    'phase': 'openalex',
                    'completed_batches': idx - 1,
                    'total_batches': len(chunks),
                    'metrics_updated': metrics_updated
                }

            batch_url = OpenAlexSource.build_batch_url(chunk)
            if not batch_url:
                continue
            try:
                resp = spider.fetch(batch_url, timeout=12)
                payload = resp.json() if hasattr(resp, 'json') else json.loads(getattr(resp, 'text', '{}'))
                parsed_metrics = OpenAlexSource.parse_response(payload)
                all_openalex_metrics.update(parsed_metrics)

                for matched_issn, info in parsed_metrics.items():
                    for target_rec in issn_map.get(matched_issn, []):
                        # Merge metrics if valid and recent
                        if info.get('citescore') and info['citescore'] > 0:
                            target_rec['citescore'] = info['citescore']
                            target_rec['citescore_year'] = 2026
                        if info.get('h_index') and info['h_index'] > 0:
                            target_rec['h_index'] = info['h_index']
                        if info.get('homepage_url') and not target_rec.get('homepage_url'):
                            target_rec['homepage_url'] = info['homepage_url']
                        metrics_updated += 1
            except Exception as e:
                logger.warning(f"Batch {idx}/{len(chunks)} failed gracefully: {e}")

    # 2. Filter inactive or discontinued journals
    records_to_process, inactive_journals = OpenAlexSource.filter_inactive_journals(records_to_process, all_openalex_metrics)
    if inactive_journals:
        logger.info(f"Filtered out {len(inactive_journals)} inactive/discontinued journals.")

    # 3. Discover novel peer-reviewed journals
    discovered_journals = []
    if not skip_discovery:
        logger.info("Discovering novel peer-reviewed journals via OpenAlex...")
        discovered_journals = OpenAlexSource.discover_new_journals(spider, records_to_process, max_to_add=discover_limit)
        if discovered_journals:
            records_to_process.extend(discovered_journals)
            logger.info(f"Appended {len(discovered_journals)} newly discovered journals.")

    # Check time budget before Special Issues
    if not skip_special_issues and time.time() >= deadline:
        logger.info(f"[PAUSED] Time slice budget reached ({max_minutes}m) before Special Issues.")
        cp_data = {
            'run_status': 'paused',
            'phase': 'special_issues',
            'openalex_batch_idx': len(chunks) if 'chunks' in locals() else 0,
            'total_batches': len(chunks) if 'chunks' in locals() else 0,
            'all_openalex_metrics': all_openalex_metrics,
            'records_to_process': records_to_process,
            'metrics_updated': metrics_updated
        }
        atomic_write_json(checkpoint_file, cp_data)
        write_journal_gh_output('paused', completed=len(records_to_process), total=len(records_to_process), target=github_output)
        return {
            'status': 'paused',
            'run_status': 'paused',
            'phase': 'special_issues',
            'metrics_updated': metrics_updated
        }

    # 4. Extract Special Issues (Option B)
    if not skip_special_issues:
        logger.info("Crawling Special Issues Call-for-Papers...")
        current_year = time.strftime('%Y')
        search_url = WIKICFP_SEARCH_URL.format(year=current_year)
        try:
            resp = spider.fetch(search_url, timeout=15)
            html_text = getattr(resp, 'text', '')
            issues = SpecialIssueSource.extract_from_html(html_text)
            special_issues_found = len(issues)
            logger.info(f"Extracted {special_issues_found} Special Issue CFP candidates.")

            matched = SpecialIssueSource.match_to_journals(records_to_process, issues)
            special_issues_matched = matched
            logger.info(f"Successfully matched {matched} Special Issues to journals.")
        except Exception as e:
            logger.warning(f"Special Issues extraction paused: {e}")

    # 5. Defensive Normalization Gate
    logger.info("Running defensive normalization and schema verification...")
    cleaned_journals, norm_report = normalize_all(records_to_process)

    # 6. Atomic Write
    if not dry_run:
        logger.info(f"Writing {len(cleaned_journals)} verified journals to {output_file}...")
        atomic_write_json(output_file, cleaned_journals)
    else:
        logger.info("Dry-run mode active; skipping file overwrite.")

    elapsed = round(time.time() - start_time, 2)
    final_report = {
        'status': 'success',
        'run_status': 'complete',
        'elapsed_seconds': elapsed,
        'total_input': total_journals,
        'processed': len(records_to_process),
        'metrics_updated': metrics_updated,
        'special_issues_found': special_issues_found,
        'special_issues_matched': special_issues_matched,
        'discovered_count': len(discovered_journals),
        'inactive_dropped': len(inactive_journals),
        'rank_distribution': norm_report['rank_counts'],
        'journals_with_deadlines': norm_report['with_deadlines'],
        'dry_run': dry_run
    }

    atomic_write_json(checkpoint_file, {'run_status': 'complete', 'phase': 'complete', 'updated_at': time.time()})
    atomic_write_json(report_file, final_report)
    write_journal_gh_output('complete', completed=len(cleaned_journals), total=total_journals, target=github_output)
    logger.info(f"Refresh completed successfully in {elapsed}s.")
    return final_report


def main():
    parser = argparse.ArgumentParser(description="Automated Journal Data and Special Issues Refresher")
    parser.add_argument('--input', type=Path, default=DEFAULT_DATA, help="Path to input jour.json")
    parser.add_argument('--output', type=Path, default=DEFAULT_DATA, help="Path to output jour.json")
    parser.add_argument('--state-dir', type=Path, default=None, help="Directory for checkpoint and report")
    parser.add_argument('--batch-size', type=int, default=50, help="Batch size for OpenAlex queries")
    parser.add_argument('--limit', type=int, default=None, help="Process only first N journals (testing)")
    parser.add_argument('--dry-run', action='store_true', help="Run without overwriting output file")
    parser.add_argument('--skip-openalex', action='store_true', help="Skip OpenAlex metrics update")
    parser.add_argument('--skip-special-issues', action='store_true', help="Skip Special Issues crawling")
    parser.add_argument('--skip-discovery', action='store_true', help="Skip novel journal discovery")
    parser.add_argument('--discover-limit', type=int, default=15, help="Maximum new journals to discover per run")
    parser.add_argument('--max-minutes', type=int, default=25, help="Time slice budget in minutes")
    parser.add_argument('--github-output', type=Path, default=None, help="Path to GITHUB_OUTPUT file")

    args = parser.parse_args()
    report = refresh_journals(
        input_file=args.input,
        output_file=args.output,
        state_dir=args.state_dir,
        batch_size=args.batch_size,
        limit=args.limit,
        dry_run=args.dry_run,
        skip_openalex=args.skip_openalex,
        skip_special_issues=args.skip_special_issues,
        skip_discovery=args.skip_discovery,
        discover_limit=args.discover_limit,
        max_minutes=args.max_minutes,
        github_output=args.github_output
    )
    print(json.dumps(report, indent=2))
    if report.get('status') == 'paused' or report.get('run_status') == 'paused':
        sys.exit(0)
    sys.exit(0)


if __name__ == '__main__':
    main()
