"""Single HTTP request in a killable child; never follows redirects or retries."""
import base64
import ipaddress
import json
import os
import socket
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

AGENT = 'IE104-Conference-Update/1.0'
MAX_BYTES = 24 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url):
    parsed = urlsplit(url)
    if (parsed.scheme not in ('http', 'https') or parsed.username or parsed.password
            or parsed.port not in (None, 80, 443) or parsed.hostname not in
            {'api.github.com', 'codeload.github.com', 'raw.githubusercontent.com', 'wikicfp.com', 'www.wikicfp.com', 'dblp.org'}):
        raise ValueError('Unapproved source URL')
    if parsed.hostname.endswith('github.com') and parsed.scheme != 'https':
        raise ValueError('GitHub API requires HTTPS')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Non-public destination')
    headers = {'User-Agent': AGENT, 'Accept-Encoding': 'identity'}
    # The GitHub token is never forwarded to WikiCFP, codeload or a redirect.
    if parsed.hostname == 'api.github.com':
        headers['Accept'] = 'application/vnd.github+json'
        token = os.environ.get('GH_TOKEN', '').strip()
        if token:
            headers['Authorization'] = 'Bearer ' + token
    try:
        response = build_opener(NoRedirect()).open(Request(url, headers=headers), timeout=30)
    except HTTPError as error:
        response = error
    with response:
        chunks, size = [], 0
        end = time.monotonic() + 165
        while True:
            if time.monotonic() >= end:
                raise TimeoutError('Response body timeout')
            chunk = response.read1(64 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError('Response too large')
            chunks.append(chunk)
        return {'status': response.code, 'location': response.headers.get('Location'),
                'charset': response.headers.get_content_charset() or 'utf-8',
                'content_type': response.headers.get('Content-Type', ''),
                'body': base64.b64encode(b''.join(chunks)).decode('ascii')}


if __name__ == '__main__':
    try:
        result = request(json.load(sys.stdin)['url'])
    except Exception as error:
        # Avoid emitting request headers, tokens or full exception representations.
        reason = getattr(error, 'reason', error)
        result = {'status': 'network_error', 'error_type': type(error).__name__,
                  'reason_type': type(reason).__name__, 'errno': getattr(reason, 'errno', None)}
    print(json.dumps(result))
