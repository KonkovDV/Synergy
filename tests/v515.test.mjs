// 5.15: the embedding kit for every stack of the case (the team's sample gives each platform a guide, an example and an
// honest «how verified»; its scene bridge adds the «ready» handshake).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseLaunch, parseHostCommand, readyMessage, resultMessage, closeMessage, notifyHost, hostChannel, isEmbedded,
  HOST_TYPES, HOST_COMMANDS, HOST_PROTOCOL, CLOSE_REASONS } from '../src/services/host.js';
import { GAMES } from '../src/games/registry.js';

const info = id => ({ grip: { levels: 8 }, check: { levels: 1 } }[id] ?? null);
const run = { at: '2026-10-19T09:00:00.000Z', game: 'grip', level: 2, scheme: 'proportional', score: 84, stars: 2, durationS: 61, skills: { precision: 81 } };

test('host: every native channel of the case stacks is heard without a glue script — exactly one gets each message', () => {
  const stacks = {
    'SynergyHost.onMessage': got => ({ SynergyHost: { onMessage: got, onResult: () => assert.fail('onMessage wins over the 5.14 onResult') } }),
    'SynergyHost.postMessage': got => ({ SynergyHost: { postMessage: got } }), // Flutter JavaScriptChannel, Android interface
    'webkit.messageHandlers.synergyHost': got => ({ webkit: { messageHandlers: { synergyHost: { postMessage: got } } } }), // iOS WKWebView
    ReactNativeWebView: got => ({ ReactNativeWebView: { postMessage: got } }),
    'Unity.call': got => ({ Unity: { call: got } }),
  };
  for (const [name, make] of Object.entries(stacks)) {
    const seen = [];
    const win = { ...make(json => seen.push(JSON.parse(json))), document: null };
    assert.equal(hostChannel(win)?.name, name);
    notifyHost(resultMessage(run, '5.15.0'), { win });
    notifyHost(closeMessage('done', '5.15.0'), { win });
    assert.deepEqual(seen.map(m => m.type), [HOST_TYPES.result, HOST_TYPES.close], `${name}: a JSON string per message, each once`);
    assert.ok(isEmbedded({}, win), `${name}: a listening WebView is an embedding`);
  }
  // Two channels at once (an iOS host that also injected a SynergyHost shim): the first in the documented order only.
  const seen = [];
  notifyHost(closeMessage('back', 'x'), { win: { SynergyHost: { postMessage: j => seen.push(['flutter', j]) }, ReactNativeWebView: { postMessage: j => seen.push(['rn', j]) } } });
  assert.deepEqual(seen.map(s => s[0]), ['flutter']);
});

test('host: the 5.14 SynergyHost.onResult still gets results only; a throwing or hostile host is contained', () => {
  const seen = [];
  const win = { SynergyHost: { onResult: json => seen.push(JSON.parse(json).type) }, document: null };
  notifyHost(readyMessage({ version: 'x', onboarded: true, games: [] }), { win });
  notifyHost(resultMessage(run, 'x'), { win });
  notifyHost(closeMessage('done', 'x'), { win });
  assert.deepEqual(seen, [HOST_TYPES.result]);
  const hostile = { get SynergyHost() { throw new Error('getter'); }, document: null };
  assert.doesNotThrow(() => notifyHost(resultMessage(run, 'x'), { win: hostile }));
  assert.doesNotThrow(() => notifyHost(resultMessage(run, 'x'), { win: { ReactNativeWebView: { postMessage: () => { throw new Error('host bug'); } } } }));
  assert.equal(hostChannel(null), null);
  assert.equal(hostChannel({ SynergyHost: { postMessage: 'not a function' } }), null);
});

test('host: ready lists the games and levels a host may start; close says why; nothing about health', () => {
  const games = GAMES.map(g => ({ id: g.id, title: g.title, levels: g.Game.levels.length, secret: 'x' }));
  const ready = readyMessage({ version: '5.15.0', onboarded: 0, games });
  assert.equal(ready.type, HOST_TYPES.ready);
  assert.equal(ready.protocol, HOST_PROTOCOL);
  assert.equal(ready.onboarded, false);
  assert.deepEqual(ready.games.map(g => g.id), ['grip', 'flight', 'rhythm', 'safe', 'duo', 'check']);
  assert.ok(ready.games.every(g => Object.keys(g).join() === 'id,title,levels' && g.levels >= 1));
  assert.deepEqual(CLOSE_REASONS, ['done', 'back']);
  assert.equal(closeMessage('back', 'x').reason, 'back');
  assert.equal(closeMessage('<script>', 'x').reason, 'done', 'an unknown reason is not passed on');
  for (const m of [ready, closeMessage('done', 'x'), resultMessage({ ...run, details: { wellbeing: 'pain' }, name: 'Имя' }, 'x')]) {
    assert.ok(!/pain|wellbeing|Имя|checkin/.test(JSON.stringify(m)), m.type);
  }
});

test('host: commands from the host are validated like the URL; embed=1 marks an embedding without a game', () => {
  assert.deepEqual(parseHostCommand({ type: HOST_COMMANDS.start, game: 'grip', level: 3 }, info), { kind: 'start', game: 'grip', level: 3 });
  assert.deepEqual(parseHostCommand({ type: HOST_COMMANDS.start, game: 'grip', level: 99 }, info), { kind: 'start', game: 'grip', level: 1 });
  for (const bad of [{ type: HOST_COMMANDS.start, game: '__proto__' }, { type: HOST_COMMANDS.start, game: 'nope' }, { type: HOST_COMMANDS.start },
    { type: 'synergy:result' }, null, 'synergy-ping', 42]) assert.equal(parseHostCommand(bad, info), null, JSON.stringify(bad));
  assert.deepEqual(parseHostCommand({ type: HOST_COMMANDS.ping }, info), { kind: 'ping' });
  const frame = { type: HOST_COMMANDS.frame, a: 0.5, b: 0 };
  assert.deepEqual(parseHostCommand(frame, info), { kind: 'frame', frame });
  assert.equal(parseLaunch('?embed=1', info).embed, true);
  assert.equal(parseLaunch('?embed=yes', info).embed, false);
  assert.ok(isEmbedded(parseLaunch('?embed=1', info), {}));
  assert.ok(isEmbedded(parseLaunch('?game=grip', info), {}));
  assert.ok(!isEmbedded(parseLaunch('', info), { SynergyNative: { speak() {} } }), 'the app\'s own APK shell is not a host');
});

test('embed kit: every case stack has a guide section and an example file, each says how it was verified', () => {
  const guide = readFileSync('docs/embed/README.md', 'utf8');
  const examples = {
    Web: 'docs/embed/web/host.html', Android: 'docs/embed/android/SynergyHostActivity.kt', iOS: 'docs/embed/ios/SynergyHostView.swift',
    Flutter: 'docs/embed/flutter/synergy_host.dart', 'React Native': 'docs/embed/react-native/SynergyHost.tsx', Unity: 'docs/embed/unity/SynergyHost.cs',
  };
  for (const [stack, file] of Object.entries(examples)) {
    assert.ok(existsSync(file), file);
    assert.ok(guide.includes(file.replace('docs/embed/', '')), `${stack}: the guide links ${file}`);
  }
  const verified = guide.slice(guide.indexOf('## Как проверено'));
  for (const stack of [...Object.keys(examples), 'Unreal']) assert.match(verified, new RegExp(`\\| ${stack} \\|`), `${stack}: a row in «Как проверено»`);
  // Each example uses the channel name the app listens to (a renamed channel would silently hear nothing).
  const uses = {
    'docs/embed/android/SynergyHostActivity.kt': '"SynergyHost"', 'docs/embed/ios/SynergyHostView.swift': '"synergyHost"',
    'docs/embed/flutter/synergy_host.dart': "'SynergyHost'", 'docs/embed/react-native/SynergyHost.tsx': 'onMessage', 'docs/embed/unity/SynergyHost.cs': 'Init(',
  };
  for (const [file, needle] of Object.entries(uses)) assert.ok(readFileSync(file, 'utf8').includes(needle), `${file} uses ${needle}`);
  for (const file of Object.values(examples)) {
    const src = readFileSync(file, 'utf8');
    for (const t of [HOST_TYPES.ready, HOST_TYPES.result, HOST_TYPES.close]) assert.ok(src.includes(t), `${file} handles ${t}`);
  }
});

test('bridge: a WebSocket that never opens is given up after CONNECT_TIMEOUT_MS and said as «нет ответа»; a refused one does not recurse', async t => {
  const { BridgeSource, CONNECT_TIMEOUT_MS } = await import('../src/input/bridge.js');
  const { BRIDGE_STATUS } = await import('../src/ui/widgets.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sockets = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.closes = 0; sockets.push(this); }
    // Like Node's undici: closing a socket that is still connecting fires «error» again, then «close».
    close() { this.closes++; if (this.closes > 3) throw new Error('recursion'); this.onerror?.(); this.readyState = 3; this.onclose?.(); }
  }
  const ws = globalThis.WebSocket; globalThis.WebSocket = FakeWS;
  const statuses = [];
  const src = new BridgeSource({ url: 'ws://10.0.0.99:8765', onStatus: s => statuses.push(s) });
  try {
    src.start();
    assert.deepEqual(statuses, ['connecting']);
    t.mock.timers.tick(CONNECT_TIMEOUT_MS - 1);
    assert.equal(sockets[0].closes, 0, 'still waiting');
    t.mock.timers.tick(1);
    assert.equal(sockets[0].closes, 1, 'given up once, no recursion');
    assert.equal(statuses.at(-1), 'unreachable');
    assert.ok(BRIDGE_STATUS.unreachable, 'the status has words');
    t.mock.timers.tick(500);
    assert.equal(sockets.length, 2, 'retried');
    sockets[1].readyState = 1; sockets[1].onopen();
    assert.equal(statuses.at(-1), 'waiting');
    t.mock.timers.tick(CONNECT_TIMEOUT_MS * 2);
    assert.equal(sockets[1].closes, 0, 'an open socket is never timed out');
    sockets[1].readyState = 3; sockets[1].onclose();
    assert.equal(statuses.at(-1), 'reconnecting', 'it was open once: a drop is «переподключение»');
    // A refused connection: «error» at once, the handler closes once.
    t.mock.timers.tick(500);
    sockets[2].onerror();
    assert.equal(sockets[2].closes, 1);
  } finally { src.stop(); globalThis.WebSocket = ws; }
});

// ---- «Азбука протеза» (the sample's learning flashcards) ----
import { PRIMER, deckProgress, resumeIndex, markSeen, checkOpen, recordCheck, primerMastered, cleanPrimer } from '../src/core/primer.js';
import { createProfile, unlockAchievements, ACHIEVEMENTS, trainingDays } from '../src/core/progress.js';
import { PET_ITEMS } from '../src/core/pet.js';
import { CLOSING_GESTURES } from '../src/core/vocabulary.js';
import { SESSION, CHILD, SIGNAL } from '../src/config.js';
import { emptyState, exportState, parseState } from '../src/core/storage.js';

test('primer: every topic has cards to read and a check whose answer is one of its options', () => {
  assert.ok(PRIMER.length >= 4);
  const deckIds = new Set();
  for (const d of PRIMER) {
    assert.ok(!deckIds.has(d.id)); deckIds.add(d.id);
    assert.ok(d.cards.length >= 4 && d.cards.length <= 6, `${d.id}: 4–6 cards`);
    assert.equal(new Set(d.cards.map(c => c.id)).size, d.cards.length, `${d.id}: card ids unique`);
    for (const c of d.cards) assert.ok(c.front.length <= 40 && c.back().length >= 40 && c.back().length <= 320, `${d.id}/${c.id}: a short question, an answer of a few lines`);
    const qs = d.check();
    assert.ok(qs.length >= 3 && qs.length <= 4, `${d.id}: 3–4 questions`);
    assert.equal(new Set(qs.map(q => q.id)).size, qs.length);
    for (const q of qs) {
      assert.ok(q.options.length === 3 && new Set(q.options).size === 3, `${d.id}/${q.id}: three different options`);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
      assert.ok(q.why.length >= 20, 'why the answer is right');
    }
    // The right answer is not always in the same place (a pattern would answer for the person).
  }
  const places = PRIMER.flatMap(d => d.check().map(q => q.answer));
  assert.ok(new Set(places).size === 3, 'right answers in every position');
});

test('primer: numbers follow the config, grips follow the gesture set (the set of 28.10 changes them too)', () => {
  const comfort = PRIMER.find(d => d.id === 'comfort');
  assert.match(comfort.cards.find(c => c.id === 'short').back(), new RegExp(`${SESSION.dailySoftCapMin} минут.*${CHILD.dailySoftCapMin}`));
  const grip = PRIMER.find(d => d.id === 'grip');
  const text = grip.cards.find(c => c.id === 'grips').back();
  for (const g of CLOSING_GESTURES) assert.ok(text.includes(`«${g.name}»`), g.id);
  assert.match(grip.cards.find(c => c.id === 'names').back(), /большой и указательный/);
  assert.match(PRIMER.find(d => d.id === 'signal').cards.find(c => c.id === 'terms').back(), /не записываются/);
  const signal = PRIMER.find(d => d.id === 'signal');
  assert.match(signal.cards.find(c => c.id === 'dropout').back(), new RegExp(`${SIGNAL.frameTimeoutMs} мс`));
  assert.equal(signal.check().find(q => q.id === 'dropout').answer, 1);
  assert.match(comfort.cards.find(c => c.id === 'pain').back(), /Стало больно/);
  assert.match(comfort.cards.find(c => c.id === 'skin').back(), /даже вместе с сильной болью/);
  assert.match(comfort.check().find(q => q.id === 'during').why, /не сохраняется/);
  const q = grip.check().find(x => x.id === 'grip-use');
  assert.ok(q && q.options[q.answer] === CLOSING_GESTURES[1].use && q.q.includes(CLOSING_GESTURES[1].name));
});

test('primer: a topic is read when every card was turned; the check opens only then; resume from the first unread', () => {
  const p = createProfile();
  const d = PRIMER[0];
  assert.equal(checkOpen(p, d.id), false);
  assert.equal(resumeIndex(p, d.id), 0);
  assert.equal(markSeen(p, d.id, d.cards[0].id), false);
  assert.equal(markSeen(p, d.id, d.cards[0].id), false, 'twice is once');
  assert.equal(markSeen(p, d.id, 'nope'), false);
  assert.equal(markSeen(p, '__proto__', 'x'), false);
  assert.equal(resumeIndex(p, d.id), 1);
  const made = d.cards.slice(1).map(c => markSeen(p, d.id, c.id));
  assert.deepEqual(made, [...Array(d.cards.length - 2).fill(false), true], 'the last unread card makes the topic read');
  assert.equal(checkOpen(p, d.id), true);
  assert.equal(deckProgress(p, d.id).seen.length, d.cards.length);
});

test('primer: the best result is kept, a retake never lowers it; reading gives no XP and no training day', () => {
  const p = createProfile();
  const d = PRIMER[0], qs = d.check();
  for (const c of d.cards) markSeen(p, d.id, c.id);
  const right = qs.map(q => q.answer), wrong = qs.map(q => (q.answer + 1) % q.options.length);
  assert.deepEqual(recordCheck(p, d.id, wrong, '2026-10-19'), { correct: 0, total: qs.length, perQuestion: qs.map(() => false) });
  assert.equal(recordCheck(p, d.id, right, '2026-10-20').correct, qs.length);
  recordCheck(p, d.id, wrong, '2026-10-21');
  assert.deepEqual([deckProgress(p, d.id).best, deckProgress(p, d.id).at], [qs.length, '2026-10-20']);
  assert.equal(p.xp, 0);
  assert.equal(trainingDays(p), 0, 'the bird grows from training days only');
});

test('primer: every check right once → «Знаток протеза» and the gift «Азбука» in an empty nest', () => {
  const p = createProfile();
  const ach = ACHIEVEMENTS.find(a => a.id === 'primer');
  const gift = PET_ITEMS.find(i => i.achievement === 'primer');
  assert.ok(ach && gift && gift.slot === 'nest');
  for (const [k, d] of PRIMER.entries()) {
    for (const c of d.cards) markSeen(p, d.id, c.id);
    recordCheck(p, d.id, d.check().map(q => q.answer), '2026-10-19');
    const fresh = unlockAchievements(p, null, {}, '2026-10-19');
    assert.deepEqual(fresh.includes('primer'), k === PRIMER.length - 1, `after ${d.id}`);
  }
  assert.ok(primerMastered(p));
  assert.equal(p.pet.nest, 'book');
  const q = createProfile(); q.pet.nest = 'twigs'; q.achievements = {};
  for (const d of PRIMER) { for (const c of d.cards) markSeen(q, d.id, c.id); recordCheck(q, d.id, d.check().map(x => x.answer), '2026-10-19'); }
  unlockAchievements(q, null, {}, '2026-10-19');
  assert.equal(q.pet.nest, 'twigs', 'the player\'s choice is not replaced');
});

test('primer: a backup is untrusted — known topics and cards, a bounded result, a real day; a round trip keeps it', () => {
  const evil = JSON.parse('{"__proto__": {"seen": ["x"]}, "signal": {"seen": ["emg", "nope", 5], "best": 99, "at": "<b>"}, "grip": {"seen": "emg", "best": 2, "at": "2026-10-19"}, "nope": {"seen": ["a"]}, "life": [1]}');
  const clean = cleanPrimer(evil);
  assert.deepEqual(Object.keys(clean).sort(), ['grip', 'signal']);
  assert.deepEqual(clean.signal, { seen: ['emg'] });
  assert.deepEqual(clean.grip, { seen: [], best: 2, at: '2026-10-19' });
  assert.equal(Object.getPrototypeOf(clean), Object.prototype);
  assert.deepEqual(cleanPrimer(null), {});
  assert.deepEqual(cleanPrimer([1, 2]), {});
  const st = emptyState();
  st.profile.primer = { comfort: { seen: ['effort', 'pain'], best: 3, at: '2026-10-18' } };
  assert.deepEqual(parseState(exportState(st)).profile.primer, st.profile.primer);
  const old = emptyState(); delete old.profile.primer;
  assert.deepEqual(parseState(JSON.stringify(old)).profile.primer, {}, 'a 5.14 copy has no «Азбука» yet');
});

// ---- Safety rules with a version (the sample's consent text: a version, a drift test, asked again on a change) ----
import { createHash } from 'node:crypto';
import { SAFETY_RULES, SAFETY_VERSION, safetyOutdated } from '../src/core/wellbeing.js';

test('safety: the rules cannot change without a new version — the person then reads them once more', () => {
  // A changed rule fails here: raise SAFETY_VERSION in core/wellbeing.js and pin the new fingerprint below.
  const PINNED = { 1: 'd2ba29733d82bcec' };
  const print = createHash('sha256').update(SAFETY_RULES.join('\n')).digest('hex').slice(0, 16);
  assert.equal(print, PINNED[SAFETY_VERSION], `SAFETY_RULES changed: SAFETY_VERSION ${SAFETY_VERSION} → ${SAFETY_VERSION + 1}, pin ${print}`);
  assert.ok(SAFETY_RULES.some(r => /не медицинское изделие/.test(r)), 'the intended purpose is said');
  const onboarding = readFileSync('src/ui/onboarding.js', 'utf8');
  for (const r of SAFETY_RULES) assert.ok(!onboarding.includes(r.slice(0, 30)), 'the onboarding takes the rules from one list, not its own copy');
  const p = createProfile();
  assert.equal(safetyOutdated(p), false, 'not onboarded yet: the onboarding shows the current rules anyway');
  p.onboarded = true;
  assert.equal(safetyOutdated(p), false, 'read the current version');
  assert.equal(safetyOutdated(p, SAFETY_VERSION + 1), true, 'a newer version is asked once');
  assert.equal(safetyOutdated({ onboarded: true }), false, 'a 5.14 profile read version 1');
});

test('safety: the version read is bounded in a backup', () => {
  for (const [stored, want] of [[undefined, 1], [0, 1], [-3, 1], ['2', 1], [1.5, 1], [99, SAFETY_VERSION], [SAFETY_VERSION, SAFETY_VERSION]]) {
    const st = emptyState(); st.profile.safetySeen = stored;
    assert.equal(parseState(JSON.stringify(st)).profile.safetySeen, want, String(stored));
  }
});
