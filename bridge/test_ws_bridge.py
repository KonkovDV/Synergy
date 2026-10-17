"""Red Team tests of the WebSocket bridge (standard library only): python -m unittest bridge/test_ws_bridge.py"""
import asyncio, base64, os, struct, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ws_bridge import Bridge, origin_allowed, MAX_PAYLOAD


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


if __name__ == '__main__':
    unittest.main()
