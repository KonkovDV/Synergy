"""Synergy bridge — a dependency-free WebSocket server that streams SignalFrames to the game.

Use it to plug ANY emulator or sensor into the game (Settings → Источник → Внешний → ws://host:8765):
  python3 bridge/ws_bridge.py --demo            scripted two-channel pattern (no input needed)
  python3 bridge/ws_bridge.py --demo-gestures   scripted cycle through the 7 states of the СПППР (task of 28.10)
  some_emulator | python3 bridge/ws_bridge.py --stdin
                                                one frame per line: "a b", "a,b" or JSON {"a":..,"b":..,"gesture":..};
                                                a packet of the task {"timestamp_ms":..,"dist":{..}} is forwarded once,
                                                as it came (6.0: node tools/spppr-emulator.mjs | … --stdin)
  python3 bridge/ws_bridge.py --lab             4-ch raw synthetic EMG → filter → features → LDA (7 gestures);
                                                the on-screen pads of the game choose what to synthesize
                                                (needs numpy/scipy/scikit-learn: pip install -r lab/requirements.txt)
  python3 bridge/ws_bridge.py --lab --spppr     the same lab, but each decision is the packet of the task
                                                {"timestamp_ms": MCU time, "dist": {7 states}}
Frames: {"a": 0..1, "b": 0..1, "gesture"?: id, "confidence"?: 0..1, "effort"?: 0..1} at 50 Hz.

Security (EMG is health data): a web page from another site must not read the stream (cross-site WebSocket
hijacking, OWASP WSTG). Native clients (no Origin) and pages served from this computer connect freely; any
other page — the standalone HTML (Origin "null"), GitHub Pages, a phone in the LAN — needs the token printed
at start (ws://host:port/?token=…) or an explicit --allow-origin. A peer from another computer always needs the
token, with or without an Origin header (5.10: a LAN process without Origin read the stream freely).
"""
import argparse, asyncio, base64, hashlib, json, math, secrets, struct, sys, threading, time
from collections import deque
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
MAX_PAYLOAD = 4096        # a frame is ~50 bytes; anything larger is not a frame (same limit as the game's parser)
MAX_CLIENTS = 8
MAX_BUFFER = 1 << 20      # a client that stops reading is dropped before it eats the memory
LOOPBACK = ('127.0.0.1', 'localhost', '::1')


def origin_allowed(origin, token_given, token, allowed=(), peer='127.0.0.1'):
    """CSWSH guard: on this computer — no Origin (native client), an allowed origin or a page from this computer —
    free; anything else (incl. "null" of file:// and sandboxed frames, and any peer from another computer) must
    present the session token."""
    has_token = bool(token) and secrets.compare_digest(token_given or '', token)
    if peer not in LOOPBACK and not str(peer).startswith('::ffff:127.'):
        return has_token
    if origin is None or origin in allowed:
        return True
    if origin != 'null' and urlsplit(origin).hostname in LOOPBACK:
        return True
    return has_token


def clean_intent(msg):
    """An intent from the game, as the lab expects it: a known gesture or none, numbers in 0..1 (5.10: one
    {"effort": null} raised TypeError in the pump and stopped the whole bridge)."""
    num = lambda v, d: max(0.0, min(1.0, float(v))) if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v else d
    gesture = msg.get('gesture') if msg.get('gesture') in GESTURES else None
    return {'type': 'intent', 'gesture': gesture, 'effort': num(msg.get('effort'), 0.6), 'a': num(msg.get('a'), 0.0), 'b': num(msg.get('b'), 0.0)}
# 6.0 — the 7 states of the СПППР (task of 28.10.2026), in the class order of src/core/vocabulary.js (the gate checks it).
GESTURES = ['rest', 'flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction']
CLOSING, OPENING = 'flexion', 'extension'  # the flexors close the hand, the extensors open it


class DemoSource:
    """Rest → A ramps → rest → B → co-contraction, repeating (period 12 s)."""
    def frame(self, t, _intent):
        p = t % 12
        a = b = 0.0
        if 1 <= p < 4: a = min(1, (p - 1) / 1.5) * 0.7
        elif 5 <= p < 7: b = 0.5
        elif 8 <= p < 8.5: a = b = 0.75
        elif 9.5 <= p < 11: a = 0.3 + 0.05 * math.sin(p * 9)
        return {'a': round(a, 4), 'b': round(b, 4)}


class GestureDemoSource:
    def frame(self, t, _intent):
        i = int(t // 2) % (len(GESTURES) * 2)
        g = GESTURES[i // 2] if i % 2 else 'rest'
        return {'a': 0.6 if g == CLOSING else 0.02, 'b': 0.6 if g == OPENING else 0.02, 'gesture': g, 'confidence': 0.9, 'effort': 0.6 if g != 'rest' else 0}


def is_task_packet(msg):
    """6.0 — the packet of the task: {"timestamp_ms": .., "dist": {..}}. Its time is the MCU's, so it is never resent."""
    return isinstance(msg, dict) and 'timestamp_ms' in msg and isinstance(msg.get('dist'), dict)


class StdinSource:
    """One frame per line. A frame is resent at the bridge's rate (the game's watchdog wants a stream), a packet of
    the task is queued and forwarded exactly once, in order: its timestamp is the MCU's, a copy would be a duplicate."""
    MAX_QUEUE = 512

    def __init__(self):
        self.latest = None
        self.queue = deque(maxlen=self.MAX_QUEUE)
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line) if line[0] in '{[' else {'a': float(line.replace(',', ' ').split()[0]), 'b': float(line.replace(',', ' ').split()[1])}
            except (ValueError, IndexError):
                continue
            if is_task_packet(msg): self.queue.append(msg)
            else: self.latest = msg

    def packets(self):
        out = []
        while self.queue: out.append(self.queue.popleft())
        return out

    def frame(self, _t, _intent):
        return self.latest


class LabSource:
    """Raw-EMG lab: the game sends {"type":"intent","gesture":..,"effort":..} or {"a":..,"b":..}.
    With spppr=True each decision goes out as the packet of the task (MCU time from the bridge's start)."""
    def __init__(self, spppr=False):
        self.spppr = spppr
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lab'))
        from lab7 import Emulator7, Classifier7
        from signals import Preprocessor
        print('Обучаю LDA на синтетических данных 7 жестов…', flush=True)
        self.emu, self.pre, self.clf = Emulator7(seed=int(time.time()) % 1000), Preprocessor(), Classifier7().bootstrap()
        print('Готово.', flush=True)

    def frame(self, _t, intent):
        gesture, effort = intent.get('gesture'), float(intent.get('effort', 0.6))
        if not gesture:  # two-channel pads → nearest gesture
            a, b = float(intent.get('a', 0)), float(intent.get('b', 0))
            gesture, effort = (CLOSING, a) if a > b and a > .12 else (OPENING, b) if b > .12 else ('rest', 0)
        window = self.pre.push(self.emu.read(gesture, max(0.0, min(1.0, effort)), n=20))
        if len(window) < 100:
            return None
        if self.spppr: return self.clf.packet(window, 1000 + _t * 1000)
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.clf.predict(window).items()}


class Bridge:
    def __init__(self, source, hz=50, token='', allowed=()):
        self.source, self.hz, self.clients, self.intent = source, hz, set(), {}
        self.token, self.allowed = token, tuple(allowed)

    async def refuse(self, writer, status, why):
        writer.write(f'HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'.encode())
        await writer.drain(); writer.close()
        print(f'отказано ({status}): {why}', flush=True)

    async def handle(self, reader, writer):
        try:  # a client that opens a connection and never sends the handshake is dropped
            head = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), timeout=5)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError):
            writer.close(); return
        lines = head.decode('latin1').split('\r\n')
        headers = {k.strip().lower(): v.strip() for k, _, v in (l.partition(':') for l in lines[1:] if ':' in l)}
        key = headers.get('sec-websocket-key')
        if not key:
            return await self.refuse(writer, '400 Bad Request', 'не WebSocket')
        target = (lines[0].split(' ') + ['/', '/'])[1]
        token_given = parse_qs(urlsplit(target).query).get('token', [''])[0]
        peer = (writer.get_extra_info('peername') or ('127.0.0.1',))[0]
        if not origin_allowed(headers.get('origin'), token_given, self.token, self.allowed, peer):
            return await self.refuse(writer, '403 Forbidden', f"Origin {headers.get('origin')} без токена")
        if len(self.clients) >= MAX_CLIENTS:
            return await self.refuse(writer, '503 Service Unavailable', 'слишком много клиентов')
        accept = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
        writer.write(f'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n'.encode())
        await writer.drain()
        self.clients.add(writer)
        print(f'+ клиент ({len(self.clients)})', flush=True)
        try:
            while True:
                b1, b2 = await reader.readexactly(2)
                op, n = b1 & 0x0F, b2 & 0x7F
                if n == 126: n = struct.unpack('!H', await reader.readexactly(2))[0]
                elif n == 127: n = struct.unpack('!Q', await reader.readexactly(8))[0]
                if n > MAX_PAYLOAD or not b2 & 0x80:  # too big (DoS) or unmasked (RFC 6455 §5.1): close 1009 / 1002
                    writer.write(bytes([0x88, 2]) + struct.pack('!H', 1009 if n > MAX_PAYLOAD else 1002)); break
                mask = await reader.readexactly(4)
                data = bytes(c ^ mask[i % 4] for i, c in enumerate(await reader.readexactly(n)))
                if op == 8: break
                if op == 1:
                    try:
                        msg = json.loads(data)
                        if isinstance(msg, dict) and msg.get('type') == 'intent': self.intent = clean_intent(msg)
                    except ValueError:
                        pass
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            self.clients.discard(writer); writer.close()
            print(f'- клиент ({len(self.clients)})', flush=True)

    @staticmethod
    def encode(text):
        data = text.encode()
        n = len(data)
        head = bytes([0x81, n]) if n < 126 else bytes([0x81, 126]) + struct.pack('!H', n)
        return head + data

    async def pump(self):
        start = time.monotonic()
        while True:
            # 6.0: packets of the task go out as they came, in order, once each (StdinSource.packets)
            for pk in (self.source.packets() if hasattr(self.source, 'packets') else []):
                text = json.dumps(pk)
                if len(text.encode()) > MAX_PAYLOAD: continue
                for w in list(self.clients):
                    try:  # a client that stops reading is dropped, as for frames (no unbounded buffer)
                        if w.transport.get_write_buffer_size() > MAX_BUFFER: raise ConnectionError('client stopped reading')
                        w.write(self.encode(text))
                    except Exception: self.clients.discard(w); w.close()
            try:  # a source error is reported, not fatal: the pump is the bridge
                frame = self.source.frame(time.monotonic() - start, self.intent)
            except Exception as e:
                frame = None
                if not getattr(self, 'reported', False): print(f'ошибка источника: {e!r}', flush=True); self.reported = True
            packet = None
            if frame is not None and self.clients:
                try:
                    text = json.dumps(frame)
                    # The game drops anything over 4096 characters; a 70 KB line used to crash the encoder (5.11).
                    packet = self.encode(text) if len(text.encode()) <= MAX_PAYLOAD else None
                except (TypeError, ValueError, struct.error):
                    packet = None
                if packet is None and not getattr(self, 'oversize_reported', False):
                    print('кадр пропущен: больше 4 КБ или не JSON', flush=True); self.oversize_reported = True
            if packet is not None:
                for w in list(self.clients):
                    try:
                        if w.transport.get_write_buffer_size() > MAX_BUFFER: raise ConnectionError('client stopped reading')
                        w.write(packet)
                    except Exception:
                        self.clients.discard(w); w.close()
            # a queue of task packets is drained every 5 ms: the jitter of the emulator is its own, not the bridge's
            await asyncio.sleep(0.005 if hasattr(self.source, 'packets') else 1 / self.hz)


async def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--demo', action='store_true'); mode.add_argument('--demo-gestures', action='store_true')
    mode.add_argument('--stdin', action='store_true'); mode.add_argument('--lab', action='store_true')
    p.add_argument('--spppr', action='store_true', help='с --lab: решения как пакеты ТЗ {"timestamp_ms", "dist"}')
    p.add_argument('--host', default='127.0.0.1', help='0.0.0.0 — доступ с телефона в той же сети')
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--allow-origin', action='append', default=[], metavar='ORIGIN',
                   help='страница, которой можно без токена, напр. https://team.github.io (можно несколько)')
    a = p.parse_args()
    if a.host not in ('127.0.0.1', 'localhost', '::1'):
        print('ВНИМАНИЕ: мост доступен всем устройствам сети. Только доверенная Wi-Fi, не публичная сеть; без авторизации и шифрования.', flush=True)
    source = DemoSource() if a.demo else GestureDemoSource() if a.demo_gestures else StdinSource() if a.stdin else LabSource(spppr=a.spppr)
    bridge = Bridge(source, token=secrets.token_urlsafe(9), allowed=a.allow_origin)
    server = await asyncio.start_server(bridge.handle, a.host, a.port)
    print(f'Synergy bridge: ws://{a.host}:{a.port}  (Ctrl+C — стоп)', flush=True)
    print(f'Для standalone HTML, телефона и других сайтов: ws://{a.host}:{a.port}/?token={bridge.token}', flush=True)
    async with server:
        await asyncio.gather(server.serve_forever(), bridge.pump())

if __name__ == '__main__':
    try: asyncio.run(main())
    except KeyboardInterrupt: pass
