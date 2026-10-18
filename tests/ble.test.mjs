// Web Bluetooth source with a fake device (5.10, architecture review C4): a failed first connection must leave no
// listener behind — it started a reconnect loop on a later disconnect that nothing could stop.
import test from 'node:test';
import assert from 'node:assert/strict';

test('BLE: a failed first connection removes its listener and starts no reconnect loop', async () => {
  const listeners = {};
  let connects = 0;
  const device = {
    name: 'fake', addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: t => { delete listeners[t]; },
    gatt: { connected: true, connect: async () => { connects++; return { getPrimaryService: async () => { throw new Error('no NUS'); } }; }, disconnect() {} },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: { requestDevice: async () => device } }, configurable: true });
  const { connectBle } = await import('../src/input/ble.js');
  await assert.rejects(connectBle({ onLine() {} }), /no NUS/);
  assert.equal(listeners.gattserverdisconnected, undefined, 'no listener left after the rejection');
  const before = connects;
  await new Promise(r => setTimeout(r, 50));
  assert.equal(connects, before, 'no reconnect attempts');
});
