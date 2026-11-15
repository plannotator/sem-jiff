# Study server: serves www/ only (the answer key is outside it), saves answers on every click.
import http.server, json, os, sys, datetime
HERE = os.path.dirname(os.path.abspath(__file__)); WWW = os.path.join(HERE, 'www')
SAVE = os.path.join(HERE, 'responses.json'); FINAL = os.path.join(HERE, 'responses-final.json')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=WWW, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def do_GET(self):
        if self.path == '/state':
            body = open(SAVE, 'rb').read() if os.path.exists(SAVE) else b'null'
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); data = json.loads(self.rfile.read(n) or b'null')
        if self.path not in ('/save', '/done') or not isinstance(data, dict): self.send_response(400); self.end_headers(); return
        json.dump(data, open(SAVE + '.tmp', 'w'), indent=1); os.replace(SAVE + '.tmp', SAVE)
        if self.path == '/done':
            json.dump(data, open(FINAL, 'w'), indent=1)
            print('submitted', datetime.datetime.now().isoformat(), flush=True)
        self.send_response(204); self.end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
