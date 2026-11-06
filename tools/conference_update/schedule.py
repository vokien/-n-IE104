"""Calendar cadence anchored once, including month/year boundaries (not cron */3)."""
import argparse
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ANCHOR = date(2026, 11, 6)


def is_due(day):
    elapsed = (day - ANCHOR).days
    return elapsed >= 0 and elapsed % 3 == 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event', default='schedule')
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args()
    today = datetime.now(ZoneInfo('Asia/Ho_Chi_Minh')).date()
    due = args.event == 'workflow_dispatch' or is_due(today)
    output = f'due={str(due).lower()}\ndate={today.isoformat()}\n'
    if args.github_output:
        with args.github_output.open('a', encoding='utf-8') as stream:
            stream.write(output)
    print(output, end='')
