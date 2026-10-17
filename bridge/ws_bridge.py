"""Synergy bridge — a dependency-free WebSocket server that streams SignalFrames to the game.

Use it to plug ANY emulator or sensor into the game (Settings → Источник → Внешний → ws://host:8765):
  python3 bridge/ws_bridge.py --demo            scripted two-channel pattern (no input needed)
  python3 bridge/ws_bridge.py --demo-gestures   scripted cycle through the 7 gestures
  some_emulator | python3 bridge/ws_bridge.py --stdin
                                                one frame per line: "a b", "a,b" or JSON {"a":..,"b":..,"gesture":..}
  python3 bridge/ws_bridge.py --lab             4-ch raw synthetic EMG → filter → features → LDA (7 gestures);
                                                the on-screen pads of the game choose what to synthesize
                                                (needs numpy/scipy/scikit-learn: pip install -r lab/requirements.txt)
Frames: {"a": 0..1, "b": 0..1, "gesture"?: id, "confidence"?: 0..1, "effort"?: 0..1} at 50 Hz.
"""
import argparse, asyncio, base64, hashlib, json, math, struct, sys, threading, time
from pathlib import Path

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
GESTURES = ['rest', 'fist', 'open', 'pinch', 'point', 'key', 'thumb']


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
        return {'a': 0.6 if g not in ('rest', 'open') else 0.02, 'b': 0.6 if g == 'open' else 0.02, 'gesture': g, 'confidence': 0.9, 'effort': 0.6 if g != 'rest' else 0}


class StdinSource:
    def __init__(self):
        self.latest = None
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                self.latest = json.loads(line) if line[0] in '{[' else {'a': float(line.replace(',', ' ').split()[0]), 'b': float(line.replace(',', ' ').split()[1])}
            except (ValueError, IndexError):
                pass

    def frame(self, _t, _intent):
        return self.latest


class LabSource:
    """Raw-EMG lab: the game sends {"type":"intent","gesture":..,"effort":..} or {"a":..,"b":..}."""
    def __init__(self):
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
            gesture, effort = ('fist', a) if a > b and a > .12 else ('open', b) if b > .12 else ('rest', 0)
        window = self.pre.push(self.emu.read(gesture, max(0.0, min(1.0, effort)), n=20))
        if len(window) < 100:
            return None
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in self.clf.predict(window).items()}


class Bridge:
    def __init__(self, source, hz=50):
        self.source, self.hz, self.clients, self.intent = source, hz, set(), {}

    async def handle(self, reader, writer):
        try:
            head = await reader.readuntil(b'\r\n\r\n')
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            writer.close(); return
        headers = {k.strip().lower(): v.strip() for k, _, v in (l.partition(':') for l in head.decode('latin1').split('\r\n')[1:] if ':' in l)}
        key = headers.get('sec-websocket-key')
        if not key:
            writer.write(b'HTTP/1.1 400 Bad Request\r\n\r\nWebSocket only'); await writer.drain(); writer.close(); return
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
                mask = await reader.readexactly(4) if b2 & 0x80 else b'\0\0\0\0'
                data = bytes(c ^ mask[i % 4] for i, c in enumerate(await reader.readexactly(n)))
                if op == 8: break
                if op == 1:
                    try:
                        msg = json.loads(data)
                        if isinstance(msg, dict) and msg.get('type') == 'intent': self.intent = msg
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
            frame = self.source.frame(time.monotonic() - start, self.intent)
            if frame is not None and self.clients:
                packet = self.encode(json.dumps(frame))
                for w in list(self.clients):
                    try: w.write(packet)
                    except Exception: self.clients.discard(w)
            await asyncio.sleep(1 / self.hz)


async def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument('--demo', action='store_true'); mode.add_argument('--demo-gestures', action='store_true')
    mode.add_argument('--stdin', action='store_true'); mode.add_argument('--lab', action='store_true')
    p.add_argument('--host', default='127.0.0.1', help='0.0.0.0 — доступ с телефона в той же сети')
    p.add_argument('--port', type=int, default=8765)
    a = p.parse_args()
    if a.host not in ('127.0.0.1', 'localhost', '::1'):
        print('ВНИМАНИЕ: мост доступен всем устройствам сети. Только доверенная Wi-Fi, не публичная сеть; без авторизации и шифрования.', flush=True)
    source = DemoSource() if a.demo else GestureDemoSource() if a.demo_gestures else StdinSource() if a.stdin else LabSource()
    bridge = Bridge(source)
    server = await asyncio.start_server(bridge.handle, a.host, a.port)
    print(f'Synergy bridge: ws://{a.host}:{a.port}  (Ctrl+C — стоп)', flush=True)
    async with server:
        await asyncio.gather(server.serve_forever(), bridge.pump())

if __name__ == '__main__':
    try: asyncio.run(main())
    except KeyboardInterrupt: pass
