// The СПППР emulator as a program (task of 28.10.2026): writes the packets of the task, one JSON object a line, in real
// time — with the MCU's own timer, jitter, lost packets, dropouts and wrong classes. The same generator as the game's
// (src/input/spppr-emulator.js). Feed it to the game through the bridge:
//   node tools/spppr-emulator.mjs | python3 bridge/ws_bridge.py --stdin      → Настройки → Источник → Внешний
// or save a recording:  node tools/spppr-emulator.mjs --fast --seconds 30 > stream.ndjson
// Options: --realism 0..1 (0.5)  --seed N  --seconds S (endless)  --fast (no real-time pacing)
//          --rate 10|50 (packets a second; 10 — the nominal rate of the organizers' stream, answers of 04.11 № 24 and
//          07.11 № 2 — the default)
//          --classes 7|3 (the device's dictionary: the task's seven states, or «2 gestures + neutral» — Q&A of 04.11, № 22;
//          the packet keeps the seven keys either way, the classes a device does not know at 0 — 07.11, answer 1)
//          --decimals 1|2|3 (09.11: a device that rounds every probability and leaves the sum as it falls; without the
//          flag — 0.001 with the sum kept exact)
//          --script cycle|flexion,extension,… (cycle: every state of the dictionary 2 s, neutral between)  --effort 0..1 (0.7)
//          --loss 0..1  --malformed 0..1 (broken packets to see the hard contract refuse them)  --reboot-every S
//          --pair pronation,supination (6.3.3: the two gestures of «2 жеста + нейтраль» — any two, answer 4г of the experts,
//          09.11; the closing one first; implies --classes 3)
//          --stats (counters to stderr at the end)
process.env.SYNERGY_GESTURE_SET ??= 'tz';
const pairAt = process.argv.indexOf('--pair');
const pairWanted = pairAt >= 0 ? process.argv[pairAt + 1] ?? '' : null;
if (pairWanted !== null) process.env.SYNERGY_GESTURE_PAIR = pairWanted;
const { SppprEmulator, STREAM_RATES_HZ } = await import('../src/input/spppr-emulator.js');
const { SppprDecoder, SPPPR_DICTIONARIES, SPPPR_WIRE, dictionaryName } = await import('../src/core/spppr.js');
const { SPPPR_SET, GESTURE_PAIR, PAIR_GESTURES } = await import('../src/core/vocabulary.js');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
if (flag('help')) { console.log(readHelp()); process.exit(0); }

const realism = Number(opt('realism', 0.5));
const profile = {};
if (opt('loss') !== undefined) profile.loss = Number(opt('loss'));
if (opt('malformed') !== undefined) profile.malformed = Number(opt('malformed'));
if (opt('reboot-every') !== undefined) profile.rebootEvery = Number(opt('reboot-every'));
const sizes = SPPPR_DICTIONARIES.map(d => d.length);
if (pairWanted !== null && GESTURE_PAIR.join(',') !== pairWanted.split(/[\s,;+]+/).filter(Boolean).join(',')) {
  console.error(`--pair: ${pairWanted} — два разных жеста словаря ТЗ через запятую, первый закрывает кисть: ${PAIR_GESTURES.map(g => g.id).join(', ')}`);
  process.exit(2);
}
const classes = Number(opt('classes', pairWanted !== null ? SPPPR_DICTIONARIES[0].length : SPPPR_WIRE.length));
if (!sizes.includes(classes)) { console.error(`--classes: ${opt('classes')} — словарь СПППР бывает ${sizes.join(' или ')} классов`); process.exit(2); }
const rateHz = Number(opt('rate', STREAM_RATES_HZ[0]));
if (!STREAM_RATES_HZ.includes(rateHz)) { console.error(`--rate: ${opt('rate')} — эмулятор шлёт ${STREAM_RATES_HZ.join(' или ')} пакетов в секунду`); process.exit(2); }
const decimals = opt('decimals') === undefined ? null : Number(opt('decimals'));
if (decimals !== null && ![1, 2, 3].includes(decimals)) { console.error(`--decimals: ${opt('decimals')} — округление до 1, 2 или 3 знаков`); process.exit(2); }
const emu = new SppprEmulator({ realism, seed: Number(opt('seed', Date.now() % 100000)), profile, classes, rateHz, decimals });
const seconds = opt('seconds') === undefined ? Infinity : Number(opt('seconds'));
const effort = Number(opt('effort', 0.7));
// The states this device recognizes (its dictionary), as the game names them.
const known = SPPPR_SET.classOrder.filter((id, i) => emu.known[i]);
const states = known.filter(id => id !== 'rest');
const script = opt('script', 'cycle');
const plan = script === 'cycle' ? states : script.split(',').map(s => s.trim()).filter(Boolean);
for (const s of plan) if (!known.includes(s)) { console.error(`состояние ${s} не из словаря устройства (${classes} классов: ${known.join(', ')})`); process.exit(2); }
const check = new SppprDecoder(); // what a receiver would make of it — for --stats

/** Every state 2 s, then neutral 1 s (the person relaxes between movements). */
const targetAt = tMs => {
  const slot = Math.floor(tMs / 3000) % plan.length, inSlot = tMs % 3000;
  return inSlot < 2000 ? { gesture: plan[slot], effort } : { gesture: 'rest', effort: 0 };
};

const out = process.stdout;
let now = 0;
const step = 5;
const write = list => { for (const { text, at } of list) { out.write(`${text}\n`); check.push(text, at); } };
if (flag('fast')) {
  for (; now <= seconds * 1000; now += step) { emu.setTarget(targetAt(now)); write(emu.pump(now)); }
  finish();
} else {
  const t0 = performance.now();
  const timer = setInterval(() => {
    now = performance.now() - t0;
    if (now > seconds * 1000) { clearInterval(timer); finish(); return; }
    emu.setTarget(targetAt(now));
    write(emu.pump(now));
  }, step);
}
out.on('error', () => process.exit(0)); // the reader went away (| head)

function finish() {
  if (flag('stats')) {
    const s = check.summary();
    console.error(`пакетов принято ${s.packets}, отклонено ${s.rejected} (${Object.entries(check.stats.errors).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ') || 'нет'}), ` +
      `поздних ${s.stale}, обрывов > 200 мс ${s.gaps}, перезапусков МК ${s.reboots}, откатов ${s.forgiven}; ${s.rateHz} пак/с, джиттер ${s.jitterMs} мс, макс. пауза ${s.maxGapMs} мс; ` +
      `ключей в пакете ${s.keys ?? '—'}, словарь ${dictionaryName(s.classes) ?? '—'}, округление ${check.stats.decimals ? `до ${check.stats.decimals} ${check.stats.decimals === 1 ? 'знака' : 'знаков'}` : 'нет'}`);
  }
}

function readHelp() {
  return `СПППР-эмулятор (ТЗ 28.10.2026): пакеты {"timestamp_ms", "dist"} по одному в строке.
  node tools/spppr-emulator.mjs | python3 bridge/ws_bridge.py --stdin
  --realism 0..1  --seed N  --seconds S  --fast  --script cycle|flexion,extension  --effort 0..1
  --rate 10|50 (пакетов в секунду; 10 — номинал потока, по умолчанию)
  --classes 7|3 (словарь: семь состояний или «2 жеста + нейтраль»; ключей в пакете всегда семь, незнакомые классы — 0)
  --decimals 1|2|3 (устройство округляет вероятности и не подгоняет сумму; без флага — 0,001, сумма ровно 1)
  --pair pronation,supination (пара «2 жестов + нейтраль»: любые два жеста словаря ТЗ, первый закрывает кисть; с ним --classes 3)
  --loss 0..1  --malformed 0..1  --reboot-every S  --stats`;
}
