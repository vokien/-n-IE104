"""
Scrapling HTTP client and spider runner for journal metadata and Special Issues.
Implements rate limiting, automatic backoff, and safe response handling.
"""

from __future__ import annotations

import logging
import time
from urllib.parse import urlsplit

try:
    from scrapling.fetchers import Fetcher
    SCRAPLING_AVAILABLE = True
except ImportError:
    SCRAPLING_AVAILABLE = False
    Fetcher = None

logger = logging.getLogger(__name__)


class SpiderError(Exception):
    """Raised when spider encounters fatal error or blocked request."""
    pass


class JournalSpider:
    """
    Lightweight, high-performance spider built on top of Scrapling Fetcher.
    Designed for zero-dependency bloat and memory safety.
    """

    def __init__(self, delay: float = 1.0, max_retries: int = 3, fetcher_cls=None):
        self.delay = max(0.2, delay)
        self.max_retries = max_retries
        self._last_request_time = 0.0
        self.fetcher = fetcher_cls or (Fetcher if SCRAPLING_AVAILABLE else None)

    def _throttle(self):
        """Enforce polite rate limiting between sequential requests."""
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request_time = time.monotonic()

    def fetch(self, url: str, headers: dict | None = None, timeout: int = 15):
        """
        Fetch a single URL using Scrapling Fetcher with exponential backoff.
        Returns the parsed Scrapling response object (or compatible fallback).
        """
        self._throttle()

        parsed = urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            raise SpiderError(f"Invalid URL schema: {url}")

        default_headers = {
            'User-Agent': 'ScopusVenueBot/1.0 (+https://github.com/vokien/-n-IE104; educational project)',
            'Accept': 'text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8'
        }
        if headers:
            default_headers.update(headers)

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                if self.fetcher:
                    response = self.fetcher.get(url, headers=default_headers, timeout=timeout)
                    status = getattr(response, 'status', getattr(response, 'status_code', 200))
                    if status in (401, 403, 429):
                        raise SpiderError(f"Access denied or rate limited (HTTP {status}) at {url}")
                    return response
                else:
                    # Fallback using standard urllib if scrapling is unavailable
                    import urllib.request
                    req = urllib.request.Request(url, headers=default_headers)
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        content = resp.read()
                        return MockResponse(content=content, status=resp.status, url=url)
            except SpiderError:
                raise
            except Exception as e:
                last_error = e
                backoff = self.delay * (2 ** (attempt - 1))
                time.sleep(backoff)

        raise SpiderError(f"Failed to fetch {url} after {self.max_retries} attempts: {last_error}")


class MockResponse:
    """Fallback response wrapper mimicking Scrapling response interface."""
    def __init__(self, content: bytes, status: int, url: str):
        self.content = content
        self.text = content.decode('utf-8', errors='replace')
        self.status = status
        self.url = url

    def json(self):
        import json
        return json.loads(self.text)
