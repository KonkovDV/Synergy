"""Red Team tests of the WebSocket bridge (standard library only): python -m unittest bridge/test_ws_bridge.py"""
import asyncio, base64, os, struct, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ws_bridge import Bridge, origin_allowed, clean_intent, is_task_packet, GESTURES, MAX_PAYLOAD


class Silent:
    def frame(self, _t, _intent):
        return {'a': 0.1, 'b': 0.0}


class OriginTest(unittest.TestCase):
    def test_policy(self):
        token = 'secret-token'
        self.assertTrue(origin_allowed(None, '', token), 'native client without Origin')
        self.assertTrue(origin_allowed('http://127.0.0.1:8091', '', token))
        self.assertTrue(origin_allowed('http://localhost:8080', '', token))
        self.assertTrue(origin_allowed('http://[::1]:8080', '', token))
        self.assertFalse(origin_allowed('https://evil.example', '', token), 'cross-site page')
        self.assertFalse(origin_allowed('null', '', token), 'file:// or a sandboxed iframe')
        self.assertFalse(origin_allowed('https://evil.example', 'wrong', token))
        self.assertTrue(origin_allowed('null', token, token), 'standalone HTML with the token')
        self.assertTrue(origin_allowed('https://team.github.io', '', token, ('https://team.github.io',)))
        self.assertFalse(origin_allowed('http://127.0.0.1.evil.example', '', token), 'host, not prefix')


class ServerTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bridge = Bridge(Silent(), token='tok')
        self.server = await asyncio.start_server(self.bridge.handle, '127.0.0.1', 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        self.server.close(); await self.server.wait_closed()

    async def handshake(self, origin=None, path='/'):
        reader, writer = await asyncio.open_connection('127.0.0.1', self.port)
        key = base64.b64encode(os.urandom(16)).decode()
        head = f'GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n'
        if origin: head += f'Origin: {origin}\r\n'
        writer.write((head + '\r\n').encode()); await writer.drain()
        status = (await reader.readuntil(b'\r\n')).decode()
        await reader.readuntil(b'\r\n\r\n')
        return status, reader, writer

    async def test_cross_site_page_is_refused_and_token_admits(self):
        status, _, w = await self.handshake('https://evil.example'); w.close()
        self.assertIn('403', status)
        status, _, w = await self.handshake('null', '/?token=tok'); w.close()
        self.assertIn('101', status)
        status, _, w = await self.handshake('http://127.0.0.1:8091'); w.close()
        self.assertIn('101', status)

    async def closed_after(self, frame):
        status, reader, writer = await self.handshake()
        self.assertIn('101', status)
        writer.write(frame); await writer.drain()
        try:
            data = await asyncio.wait_for(reader.read(), 2)  # read until the server closes the socket
        finally:
            writer.close()
        return data

    async def test_oversized_frame_is_closed_with_1009(self):
        data = await self.closed_after(bytes([0x81, 0x80 | 127]) + struct.pack('!Q', MAX_PAYLOAD * 1000))
        self.assertIn(bytes([0x88, 2]) + struct.pack('!H', 1009), data)

    async def test_unmasked_frame_is_closed_with_1002(self):
        data = await self.closed_after(bytes([0x81, 2]) + b'{}')
        self.assertIn(bytes([0x88, 2]) + struct.pack('!H', 1002), data)


class HardeningTest(unittest.TestCase):
    """5.10 (Red Team C-13): a LAN peer needs the token; a malformed intent or a failing source does not stop the bridge."""

    def test_peer_from_another_computer_needs_the_token(self):
        token = 'secret-token'
        self.assertTrue(origin_allowed(None, '', token, peer='127.0.0.1'), 'native client on this computer')
        self.assertFalse(origin_allowed(None, '', token, peer='192.168.1.20'), 'a LAN process without Origin')
        self.assertFalse(origin_allowed('http://127.0.0.1:8091', '', token, peer='192.168.1.20'), 'a spoofed loopback Origin from the LAN')
        self.assertTrue(origin_allowed(None, token, token, peer='192.168.1.20'), 'with the token')

    def test_intent_is_cleaned(self):
        self.assertEqual(clean_intent({'type': 'intent', 'effort': None, 'gesture': 'nope', 'a': 7, 'b': float('nan')}),
                         {'type': 'intent', 'gesture': None, 'effort': 0.6, 'a': 1.0, 'b': 0.0})
        self.assertEqual(clean_intent({'gesture': 'pronation', 'effort': 0.4})['gesture'], 'pronation')
        self.assertEqual(GESTURES[0], 'rest', 'the task numbers neutral 0; the game calls it rest')

    def test_a_failing_source_does_not_stop_the_pump(self):
        class Broken:
            calls = 0
            def frame(self, _t, _intent):
                Broken.calls += 1
                raise TypeError('boom')
        async def run():
            bridge = Bridge(Broken(), hz=200)
            task = asyncio.create_task(bridge.pump())
            await asyncio.sleep(0.05)
            alive = not task.done()
            task.cancel()
            return alive
        self.assertTrue(asyncio.run(run()))
        self.assertGreater(Broken.calls, 2, 'the pump keeps going after an error')


    def test_an_oversized_source_frame_is_skipped_not_fatal(self):
        class Big:
            calls = 0
            def frame(self, _t, _intent):
                Big.calls += 1
                return {'a': 0.1, 'junk': 'x' * 70000} if Big.calls == 1 else {'a': 0.2, 'b': 0.0}
        class Writer:
            def __init__(self): self.sent = []; self.transport = self
            def get_write_buffer_size(self): return 0
            def write(self, data): self.sent.append(data)
            def close(self): pass
        async def run():
            bridge = Bridge(Big(), hz=200)
            client = Writer(); bridge.clients.add(client)
            task = asyncio.create_task(bridge.pump())
            await asyncio.sleep(0.05)
            alive = not task.done()
            task.cancel()
            return alive, client.sent
        alive, sent = asyncio.run(run())
        self.assertTrue(alive, 'a 70 KB line used to crash the encoder and close the bridge')
        self.assertTrue(sent and all(len(p) < 4200 for p in sent), 'later frames still go out, the big one does not')

    def test_task_packets_go_out_once_in_order(self):
        # 6.0 — the packet of the task carries the MCU time: the bridge forwards it as it came, never resends it
        pk = lambda t, f: {'timestamp_ms': t, 'dist': {'neutral': 1 - f, 'flexion': f, 'extension': 0, 'pronation': 0, 'supination': 0, 'adduction': 0, 'abduction': 0}}
        self.assertTrue(is_task_packet(pk(1, 0.5)))
        self.assertFalse(is_task_packet({'a': 0.1, 'b': 0.2}))
        self.assertFalse(is_task_packet({'timestamp_ms': 1, 'dist': [0.1]}))
        class Queue:
            def __init__(self): self.q = [pk(1720000000123, 0.65), pk(1720000000143, 0.70)]
            def packets(self): out, self.q = self.q, []; return out
            def frame(self, _t, _intent): return None
        class Writer:
            def __init__(self): self.sent = []; self.transport = self
            def get_write_buffer_size(self): return 0
            def write(self, data): self.sent.append(data)
            def close(self): pass
        async def run():
            bridge = Bridge(Queue(), hz=200)
            client = Writer(); bridge.clients.add(client)
            task = asyncio.create_task(bridge.pump())
            await asyncio.sleep(0.05)
            task.cancel()
            return client.sent
        sent = asyncio.run(run())
        self.assertEqual(len(sent), 2, 'each packet once')
        # a client that stopped reading is dropped (6.0, Red Team: the packet loop had no buffer check)
        class Stuck(Writer):
            def get_write_buffer_size(self): return 1 << 30
        async def stuck():
            bridge = Bridge(Queue(), hz=200)
            client = Stuck(); bridge.clients.add(client)
            task = asyncio.create_task(bridge.pump())
            await asyncio.sleep(0.05)
            task.cancel()
            return client.sent, client in bridge.clients
        stuck_sent, kept = asyncio.run(stuck())
        self.assertEqual((stuck_sent, kept), ([], False))
        self.assertIn(b'1720000000123', sent[0]); self.assertIn(b'1720000000143', sent[1])

if __name__ == '__main__':
    unittest.main()
