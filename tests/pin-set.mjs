// 6.0: the product starts in the gesture set of the published task (tz). The suite of earlier releases names the
// gestures of the «Синергия» set (fist, pinch, key…), so it pins that set — unless the runner chose one already
// (`npm run test:ubi4` sets SYNERGY_GESTURE_SET=ubi4). Imported FIRST by every test file: ES modules evaluate their
// imports in order, so vocabulary.js reads the variable after this line ran. The task's set has its own tests
// (tests/spppr.test.mjs, tests/tz.test.mjs) and `npm run test:tz` (every level of every game on the СПППР stream).
process.env.SYNERGY_GESTURE_SET ??= 'synergy';
