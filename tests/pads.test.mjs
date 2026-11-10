import './pin-set.mjs'; // the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Q&A of the organizers (04.11.2026), answer 13: the main control is the stream; touch is for menus, settings and emulation;
// on the screen of an emulator buttons, sliders, even multi-touch are fine, but with real EMG multi-touch is not — one area
// for the healthy hand, the rest by EMG. Until 6.1 the play screen kept the pads of the emulator under every external
// source, a prosthesis included. Now they appear only for a source that reads them: the raw-EMG lab says so on connect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExternal, BridgeSource } from '../src/input/bridge.js';
import { bridgeControls } from '../src/ui/play.js';

const HELLO = '{"type": "bridge-hello", "intents": true}';

test('ответ № 13: a source that reads the pads says so — «bridge-hello» is not a frame', () => {
  assert.deepEqual(parseExternal(HELLO), { hello: { intents: true } });
  assert.deepEqual(parseExternal({ type: 'bridge-hello' }), { hello: { intents: false } }, 'only an explicit true asks for the pads');
  assert.deepEqual(parseExternal({ type: 'bridge-hello', intents: 'yes' }), { hello: { intents: false } });
  const statuses = [];
  const bridge = new BridgeSource({ clock: () => 0, onStatus: s => statuses.push(s) });
  assert.equal(bridge.listens, false, 'no pads until a source asks for them');
  assert.equal(bridge.feed(HELLO), false, 'a greeting drives nothing');
  assert.equal(bridge.listens, true);
  assert.equal(bridge.received, 0, 'and is not counted as a frame');
  assert.ok(statuses.length >= 1, 'the screens hear it and may show the remote');
  bridge.feed({ type: 'bridge-hello', intents: false });
  assert.equal(bridge.listens, false);
});

test('6.1: the lab gets what the pads ask for once its socket is open — and again after a reconnect', () => {
  // Found by the bridge e2e of 05.11: the first intent went out while the socket was still connecting, was lost and was
  // marked as sent; a pad held across a reconnect never reached the lab either (the message «had not changed»).
  const sent = [];
  const socket = { readyState: 0, send: text => sent.push(JSON.parse(text)) };
  const bridge = new BridgeSource({ clock: () => 0 });
  bridge.socket = socket;
  const flexion = { type: 'intent', gesture: 'flexion', effort: 0.6, a: 0, b: 0 };
  assert.equal(bridge.sendIntent(flexion), false, 'connecting: nothing goes out');
  socket.readyState = 1;
  assert.equal(bridge.sendIntent(flexion), true, 'open: the same intent goes out now');
  assert.equal(bridge.sendIntent({ ...flexion }), false, 'unchanged: not again');
  bridge.connectionChanged();
  assert.equal(bridge.sendIntent(flexion), true, 'a new connection hears the held pad');
  assert.deepEqual(sent, [flexion, flexion]);
});

test('ответ № 13: under an external source the play screen shows the pads only to a source that reads them', () => {
  const lab = bridgeControls({ wsUrl: 'ws://127.0.0.1:8765', listens: true });
  assert.equal(lab.pads, true);
  assert.match(lab.note, /пульт лаборатории/);
  const device = bridgeControls({ wsUrl: 'ws://127.0.0.1:8765', listens: false });
  assert.equal(device.pads, false, 'a device or a recording through the bridge: real EMG, no multi-touch');
  assert.match(device.note, /только сигналом/);
  const host = bridgeControls({ wsUrl: '', listens: false });
  assert.equal(host.pads, false, 'frames of the prosthesis from the host app: no pads');
  assert.match(host.note, /без адреса/);
});
