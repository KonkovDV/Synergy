"""Local static server for development and for opening the game on a phone in the same Wi-Fi.
Usage: python3 tools/serve.py [--port 8080] [--dist] [--lan]"""
import argparse, functools, http.server, socket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *args): pass

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8080)
    p.add_argument('--dist', action='store_true', help='serve the built dist/ folder')
    p.add_argument('--lan', action='store_true', help='listen on all interfaces (phone in the same Wi-Fi)')
    a = p.parse_args()
    root = ROOT / 'dist' if a.dist else ROOT
    host = '0.0.0.0' if a.lan else '127.0.0.1'
    server = http.server.ThreadingHTTPServer((host, a.port), functools.partial(Handler, directory=str(root)))
    ip = socket.gethostbyname(socket.gethostname()) if a.lan else '127.0.0.1'
    print(f'Синергия: http://{ip}:{a.port}/  (Ctrl+C — стоп)', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__':
    main()
