"""Local static server for development and for opening the game on a phone in the same Wi-Fi.
Usage: python3 tools/serve.py [--port 8080] [--dist] [--lan]
--lan serves only the built dist/ (5.10: it served the repository root — .git, notes, the debug keystore — to the Wi-Fi)."""
import argparse, functools, http.server, ipaddress, os, socket
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def host_allowed(header):
    host = (header or '').strip().lower()
    host = host[1:host.index(']')] if host.startswith('[') and ']' in host else host.rsplit(':', 1)[0] if host.count(':') == 1 else host
    if host == 'localhost': return True
    try: ipaddress.ip_address(host); return True
    except ValueError: return False

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *args): pass
    def send_head(self):
        # `localhost` or an IP address only (5.11): a site that rebinds its own DNS name to this computer would
        # otherwise read the files; a phone in the Wi-Fi opens the server by its IP address.
        if not host_allowed(self.headers.get('Host')):
            self.send_error(421); return None
        # No dotfiles (.git), no tool caches (tools/.cache holds the debug keystore), no directory listings. Checked on
        # the decoded path the server will open (5.11: `/%2egit/config` passed the check on the raw path).
        rel = os.path.relpath(self.translate_path(self.path), self.directory)
        parts = rel.replace('\\', '/').split('/')
        if rel.startswith('..') or any(p.startswith('.') and p != '.' for p in parts) or parts[:2] == ['tools', '.cache']:
            self.send_error(404); return None
        return super().send_head()
    def list_directory(self, path):
        self.send_error(404); return None

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--port', type=int, default=8080)
    p.add_argument('--dist', action='store_true', help='serve the built dist/ folder')
    p.add_argument('--lan', action='store_true', help='listen on all interfaces (phone in the same Wi-Fi)')
    a = p.parse_args()
    root = ROOT / 'dist' if a.dist or a.lan else ROOT
    host = '0.0.0.0' if a.lan else '127.0.0.1'
    if a.lan: print('ВНИМАНИЕ: сервер доступен всем устройствам сети — только доверенная Wi-Fi.', flush=True)
    server = http.server.ThreadingHTTPServer((host, a.port), functools.partial(Handler, directory=str(root)))
    ip = socket.gethostbyname(socket.gethostname()) if a.lan else '127.0.0.1'
    print(f'Синергия: http://{ip}:{a.port}/  (Ctrl+C — стоп)', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__':
    main()
