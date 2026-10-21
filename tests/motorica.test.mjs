// Motorica Start game control, contract v1 (5.21): the snapshot Motorica Start hands to its own game, Motorica Kart
// (github.com/HakerFromRussia-XD/1_game_stk — GameControlSnapshot, IGameControlService, motorica_game_control.cpp).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExternal, BridgeSource, MOTORICA_LEVEL_MAX } from '../src/input/bridge.js';
import { SignalPipeline } from '../src/core/signal.js';

const snap = (seq, close, open, connected = true) => ({ version: 1, seq, timestampMs: 1792540800000 + seq * 33, openLevel: open, closeLevel: close, connected });

test('Motorica Start snapshot: close is A, open is B, levels 0…255 become 0…1', () => {
  assert.equal(MOTORICA_LEVEL_MAX, 255);
  assert.deepEqual(parseExternal(snap(5, 255, 51)), { a: 1, b: 0.2, seq: 5 });
  assert.deepEqual(parseExternal(JSON.stringify(snap(6, 0, 255))), { a: 0, b: 1, seq: 6 }, 'as JSON text from a host');
  assert.deepEqual(parseExternal({ snapshot: snap(7, 102, 0) }), { a: 0.4, b: 0, seq: 7 }, 'as the iOS App Group keeps it');
  assert.deepEqual(parseExternal(snap(8, 300, -4)), { a: 1, b: 0, seq: 8 }, 'out of range is clamped');
});

test('Motorica Start snapshot: a device that is not connected is no signal, an unknown version is no frame', () => {
  const off = parseExternal(snap(9, 0, 0, false));
  assert.equal(off.offline, true, 'levels 0/0 of a missing device are not a rest');
  assert.equal(parseExternal({ ...snap(10, 128, 0), version: 2 }), null);
  assert.equal(parseExternal({ version: 1, seq: 11, openLevel: 'x', closeLevel: 10, connected: true }), null);
});

test('Motorica Start snapshot: a resent seq is no new frame — a stalled device still trips the 300 ms watchdog', () => {
  let now = 0;
  const source = new BridgeSource({ clock: () => now });
  const pipeline = new SignalPipeline({ scheme: 'proportional' });
  assert.equal(source.feed(snap(1, 200, 0)), true);
  assert.equal(pipeline.process(source.sample(), now).valid, true);
  // The host relays getLatestSnapshot() every 33 ms, but the device stopped: the same seq again and again.
  for (now = 33; now <= 400; now += 33) assert.equal(source.feed(snap(1, 200, 0)), false);
  assert.equal(pipeline.process(source.sample(), now).valid, false, 'no fresh frame for 400 ms');
  assert.equal(source.feed(snap(2, 200, 0)), true, 'a new seq is a frame again');
  assert.equal(pipeline.process(source.sample(), now).valid, true);
});

test('Motorica Start snapshot: «connected: false» drops the last frame and says so; the stream resumes by itself', () => {
  let now = 0;
  const statuses = [];
  const source = new BridgeSource({ clock: () => now, onStatus: s => statuses.push(s) });
  source.feed(snap(1, 180, 0));
  now = 40;
  assert.equal(source.feed(snap(2, 0, 0, false)), false);
  assert.equal(source.sample(), null, 'the last frame of a hand that held force is not kept');
  assert.equal(source.status, 'offline');
  now = 80;
  assert.equal(source.feed(snap(3, 0, 120)), true);
  assert.equal(source.status, 'streaming');
  assert.deepEqual(statuses, ['streaming', 'offline', 'streaming']);
});

test('Motorica Start before the game-control service: «Sensor_levels» — sensor 1 is open (B), sensor 2 is close (A)', () => {
  // DataTransferToService of the 2023–2024 integrations (drone, ballista, space platformer); the thresholds come along.
  // 5.29: the thresholds that come along are read too (tests/v529.test.mjs) — they set where the channels switch on.
  assert.deepEqual(parseExternal({ sensor_level_1: 51, sensor_level_2: 255, open_ch_num: 30, close_ch_num: 40 }), { a: 1, b: 0.2, thresholds: [40 / 255, 30 / 255] });
  assert.deepEqual(parseExternal('{"sensor_level_1":0,"sensor_level_2":102}'), { a: 0.4, b: 0 });
  assert.equal(parseExternal({ sensor_level_1: 'x', sensor_level_2: 3 }), null);
});

test('swapped channels: a source that sends A and B the other way round, as the inverted control of Motorica\'s games', async () => {
  let swapped = true;
  const source = new BridgeSource({ clock: () => 0, swap: () => swapped });
  source.feed({ a: 0.8, b: 0.1 });
  assert.deepEqual([source.sample().a, source.sample().b], [0.1, 0.8]);
  swapped = false;
  source.feed({ a: 0.8, b: 0.1 });
  assert.deepEqual([source.sample().a, source.sample().b], [0.8, 0.1], 'the setting is read on every frame, no restart');
  const { emptyState, parseState } = await import('../src/core/storage.js');
  assert.equal(emptyState().settings.swapChannels, false);
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { swapChannels: 'yes' } })).settings.swapChannels, false, 'a backup is untrusted');
  assert.equal(parseState(JSON.stringify({ version: 4, settings: { swapChannels: true } })).settings.swapChannels, true);
});

test('lost signal: the hint says the exercise goes on by itself, and names a device that is not connected', async () => {
  const { lostSignalHint, BRIDGE_STATUS } = await import('../src/ui/widgets.js');
  assert.match(lostSignalHint('streaming'), /Нет сигнала[\s\S]*Продолжим сами/);
  assert.match(lostSignalHint('offline'), /Протез не на связи[\s\S]*Продолжим сами/);
  assert.equal(BRIDGE_STATUS.offline, 'протез не на связи');
  // The promise is true: GameRunner freezes the game while the signal is lost and runs it again with the next frame.
  const { GameRunner } = await import('../src/games/runner.js');
  let now = 0, updates = 0;
  const source = new BridgeSource({ clock: () => now });
  const game = { paused: false, speed: 1, update() { updates++; } };
  const runner = new GameRunner({ game, pipeline: new SignalPipeline({ scheme: 'proportional' }), hand: { update() {} }, source });
  source.feed(snap(1, 100, 0)); runner.step(now, 0.016);
  now = 40; source.feed(snap(2, 0, 0, false)); now = 400; runner.step(now, 0.016);
  assert.equal(runner.signalLost, true);
  const frozen = updates;
  now = 420; source.feed(snap(3, 100, 0)); runner.step(now, 0.016);
  assert.equal(runner.signalLost, false);
  assert.equal(updates, frozen + 1, 'the game runs again with the first fresh frame');
});

test('Motorica Start: the docs name the contract and the Android host binds the same service', () => {
  const integration = readFileSync('docs/INTEGRATION.md', 'utf8');
  for (const field of ['openLevel', 'closeLevel', 'connected', 'seq']) assert.ok(integration.includes(field), field);
  const kt = readFileSync('docs/embed/android/MotoricaStartLink.kt', 'utf8');
  for (const name of ['com.bailout.stickk', 'com.motorica.gamecontrol.BIND', 'com.motorica.gamecontrol.IGameControlService', 'com.motorica.gamecontrol.IGameControlCallback']) assert.ok(kt.includes(name), name);
});
