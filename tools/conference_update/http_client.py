"""Bounded source requests, shared WikiCFP rate gate, robots and resumable cache."""
import base64
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from urllib.parse import urljoin, urlsplit
from robots import Robots

from sources import write_json

AGENT = 'IE104-Conference-Update/1.0'
BLOCKED = {401, 403, 429}


class SourceError(RuntimeError):
    pass


class CrawlPaused(RuntimeError):
    pass


def raw_request(url, timeout=180):
    try:
        response = subprocess.run([sys.executable, str(Path(__file__).with_name('http_worker.py'))],
                                  input=json.dumps({'url': url}), text=True, encoding='utf-8',
                                  capture_output=True, check=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise SourceError('HTTP operation exceeded 180 seconds') from error
    except subprocess.CalledProcessError as error:
        raise SourceError('HTTP worker failed') from error
    result = json.loads(response.stdout)
    body = base64.b64decode(result.pop('body', ''))
    if result['status'] == 'network_error':
        raise SourceError('Network error: ' + result['error_type'] + '/' + str(result.get('reason_type'))
                          + '; errno=' + str(result.get('errno')))
    return result, body


def github_get(url):
    meta, body = raw_request(url)
    if meta['status'] != 200:
        raise SourceError(f'GitHub source HTTP {meta["status"]}')
    return body


class WikiClient:
    def __init__(self, directory, deadline, delay=5, request=raw_request):
        self.directory = Path(directory)
        self.deadline = deadline
        self.delay = max(5, delay)
        self.request = request
        self.gate = threading.Lock()
        self.guard = threading.Lock()
        self.robots = {}
        self.locks = {}
        self.last_start = 0
        self.stopped = threading.Event()
        self.requests = 0

    def check(self):
        if self.stopped.is_set():
            raise SourceError('WikiCFP stopped after a source error')
        if time.monotonic() >= self.deadline:
            raise CrawlPaused('Job budget reached; checkpoint retained')

    def _request(self, url, end):
        self.check()
        with self.gate:
            self.check()
            wait = max(0, self.delay - (time.monotonic() - self.last_start))
            if time.monotonic() + wait >= min(end, self.deadline):
                raise CrawlPaused('Rate-limit wait exceeds remaining budget')
            if self.stopped.wait(wait):
                raise SourceError('WikiCFP stopped')
            self.last_start = time.monotonic()
            self.requests += 1
        remaining = min(end, self.deadline) - time.monotonic()
        if remaining <= 0:
            raise CrawlPaused('Job budget reached')
        meta, body = self.request(url, timeout=min(180, remaining))
        if meta['status'] in BLOCKED:
            self.stopped.set()
            raise SourceError(f'WikiCFP blocked: HTTP {meta["status"]}; no bypass/retry')
        try:
            html = body.decode(meta.get('charset', 'utf-8'), errors='replace')
        except LookupError:
            html = body.decode('utf-8', errors='replace')
        if re.search(r'<title[^>]*>\s*(?:just a moment|access denied|captcha)|verify you are human|id=["\']challenge-form', html[:200000], re.I):
            self.stopped.set()
            raise SourceError('WikiCFP CAPTCHA/challenge; no bypass/retry')
        return meta, html

    def _allowed(self, url, end):
        parsed = urlsplit(url)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        # One robot fetch per origin, serialized before the first page request.
        with self.guard:
            if origin not in self.robots:
                meta, text = self._request(origin + '/robots.txt', end)
                for _ in range(3):
                    if meta['status'] not in (301, 302, 303, 307, 308):
                        break
                    target = urljoin(origin + '/robots.txt', meta.get('location') or '')
                    p = urlsplit(target)
                    if p.hostname not in ('www.wikicfp.com', 'wikicfp.com') or not p.path.endswith('/robots.txt'):
                        raise SourceError('Unverified robots redirect')
                    meta, text = self._request(target, end)
                robot = Robots(origin + '/robots.txt')
                if meta['status'] in (404, 410):
                    robot.parse(['User-agent: *', 'Allow: /'])
                elif meta['status'] == 200 and not text.lstrip().lower().startswith(('<html', '<!doctype')):
                    robot.parse(text.splitlines())
                else:
                    raise SourceError('Cannot verify WikiCFP robots.txt')
                try:
                    crawl_delay = robot.crawl_delay(AGENT) or 0
                except (AttributeError, Exception):
                    crawl_delay = 0
                try:
                    rate = robot.request_rate(AGENT)
                except (AttributeError, Exception):
                    rate = None
                self.delay = max(self.delay, crawl_delay, rate.seconds / rate.requests if rate and rate.requests else 0)
                self.robots[origin] = robot
            allowed = self.robots[origin].can_fetch(AGENT, url)
        if not allowed:
            self.stopped.set()
            raise SourceError('WikiCFP robots disallows this URL')

    def fetch(self, url):
        self.check()
        end = min(time.monotonic() + 180, self.deadline)
        parsed = urlsplit(url)
        if (parsed.hostname not in ('www.wikicfp.com', 'wikicfp.com') or parsed.username
                or parsed.password or parsed.scheme not in ('http', 'https')):
            raise SourceError('Unexpected WikiCFP URL')
        with self.guard:
            lock = self.locks.setdefault(url, threading.Lock())
        if not lock.acquire(timeout=max(0, end - time.monotonic())):
            raise SourceError('Page cache lock exceeded the 180-second operation cap')
        try:
            cache = self.directory / (hashlib.sha256(url.encode()).hexdigest() + '.json')
            if cache.exists():
                record = json.loads(cache.read_text(encoding='utf-8'))
                if record.get('url') == url:
                    return record['html']
            # The entire page operation, including robots and redirect/rate waits, has one cap.
            current = url
            for _ in range(4):
                self._allowed(current, end)
                meta, html = self._request(current, end)
                if meta['status'] in (301, 302, 303, 307, 308):
                    current = urljoin(current, meta.get('location') or '')
                    if urlsplit(current).hostname not in ('www.wikicfp.com', 'wikicfp.com'):
                        raise SourceError('WikiCFP redirected outside its domain')
                    continue
                if meta['status'] != 200:
                    raise SourceError(f'WikiCFP HTTP {meta["status"]}')
                if not html.strip() or 'html' not in meta.get('content_type', '').lower():
                    raise SourceError('WikiCFP returned non-HTML/empty response')
                write_json(cache, {'url': url, 'html': html})
                return html
            raise SourceError('Too many WikiCFP redirects')
        finally:
            lock.release()
