"""Local preview of the site with a stand-in for contact.php, so the contact form can be tried without PHP.

  python tools/dev/serve.py            # http://localhost:8000/  (German)  and  /en/  (English)
  python tools/dev/serve.py --fail     # the form gets an error, to see the error message
  python tools/dev/serve.py --rate     # the form gets "too many requests"

The stand-in sends nothing: it waits a moment and answers like contact.php does on the live server.
Local only, never deployed (tools/ is excluded from the upload)."""
import http.server, json, os, sys, time

SITE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 8000
MODE = 'fail' if '--fail' in sys.argv else 'rate' if '--rate' in sys.argv else 'ok'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)

    def do_GET(self):
        # Bot check: an ALTCHA challenge in the same format as contact.php (the stand-in does not check the answer)
        if self.path.split('?')[0] == '/contact.php' and 'challenge' in self.path:
            p = {'algorithm': 'SHA-256', 'cost': 4, 'expiresAt': int(time.time()) + 7200, 'keyLength': 32,
                 'keyPrefix': '000', 'nonce': os.urandom(16).hex(), 'salt': os.urandom(16).hex()}
            data = json.dumps({'parameters': p, 'signature': 'local-preview'}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/contact.php':
            self.send_error(404)
            return
        self.rfile.read(int(self.headers.get('Content-Length') or 0))
        time.sleep(0.8)
        status, body = {'ok': (200, {'ok': True}), 'fail': (500, {'ok': False, 'error': 'send'}),
                        'rate': (429, {'ok': False, 'error': 'rate'})}[MODE]
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        print(f'  contact form sent -> answered {body}')


print(f'Serving {SITE}\n  German:  http://localhost:{PORT}/\n  English: http://localhost:{PORT}/en/\n'
      f'  Contact form answers: {MODE}   (Ctrl+C to stop)')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
