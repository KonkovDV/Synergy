// 6.0: tests of the published set (СПППР of the task) run on it whatever the runner chose — imported FIRST, so
// vocabulary.js reads the variable after this line ran (see tests/pin-set.mjs for the suite of earlier releases).
process.env.SYNERGY_GESTURE_SET = 'tz';
