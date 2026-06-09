#!/usr/bin/env python3
"""Local dev server with clean URL routing for SigFix."""

import http.server
import socketserver
from pathlib import Path

PORT = 8080
ROOT = Path(__file__).parent

ROUTES = {
    '/': 'index.html',
    '/privacy-policy': 'privacy-policy/index.html',
    '/terms-and-conditions': 'terms-and-conditions/index.html',
    '/refund-policy': 'refund-policy/index.html',
}


class SigFixHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        clean_path = self.path.split('?')[0].rstrip('/') or '/'

        if clean_path in ROUTES:
            self.path = '/' + ROUTES[clean_path]

        return super().do_GET()


if __name__ == '__main__':
    with socketserver.TCPServer(('', PORT), SigFixHandler) as httpd:
        print(f'SigFix dev server → http://localhost:{PORT}')
        print('Routes: /  /privacy-policy  /terms-and-conditions  /refund-policy')
        httpd.serve_forever()
