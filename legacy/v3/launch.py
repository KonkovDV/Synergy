"""No dependencies; static app only, loopback bound, fixed asset allowlist."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import argparse, mimetypes, webbrowser
ROOT=Path(__file__).resolve().parent
FILES={'/':'index.html','/index.html':'index.html','/host-example.html':'host-example.html','/assets/host-example.js':'assets/host-example.js','/assets/app.bundle.js':'assets/app.bundle.js','/assets/app.bundle.js.map':'assets/app.bundle.js.map','/assets/style.css':'assets/style.css','/assets/icon.svg':'assets/icon.svg','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest'}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Permissions-Policy','camera=(), microphone=(), geolocation=(), usb=()')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
    def do_GET(self):
        port=self.server.server_address[1]
        if self.headers.get('Host','') not in {f'localhost:{port}',f'127.0.0.1:{port}'}:return self.send_error(403)
        origin=self.headers.get('Origin')
        if origin and origin!=f"http://{self.headers.get('Host')}":return self.send_error(403)
        path=urlparse(self.path).path
        if path not in FILES:return self.send_error(404)
        f=ROOT/FILES[path]
        if not f.exists():return self.send_error(404)
        b=f.read_bytes();self.send_response(200);self.send_header('Content-Type',(mimetypes.guess_type(str(f))[0] or 'application/octet-stream')+'; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers()
        try:self.wfile.write(b)
        except (BrokenPipeError,ConnectionResetError):pass
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8780);p.add_argument('--no-open',action='store_true');a=p.parse_args()
    if not 1024<=a.port<=65535:p.error('Port must be 1024..65535')
    http=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);url=f'http://127.0.0.1:{a.port}/';print(url,flush=True)
    if not a.no_open:webbrowser.open(url)
    try:http.serve_forever()
    except KeyboardInterrupt:pass
    finally:http.server_close()
