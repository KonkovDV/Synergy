// Documents that quote numbers the submission gate verifies (tests, APK size), and the patterns of those numbers. One
// module for the reader (tools/check-submission.mjs) and the writers (tools/set-test-count.mjs, tools/evidence.mjs):
// 6.0, 04.11 — the whole pictures grew the APK from 3668 to 5093 КБ, the size was still typed by hand in four
// documents, and CI went red on the gate. The writer now uses the very pattern the gate reads.
export const NUMBER_DOCS = ['README.md', 'docs/JURY_STRATEGY.md', 'docs/AI_USAGE.md', 'docs/PITCH.md', 'MEMORY.md'];

// Documents that quote the accessibility and layout runs as current (MEMORY.md keeps the history of older runs).
export const RUN_DOCS = NUMBER_DOCS.filter(doc => doc !== 'MEMORY.md');

/**
 * «486 тестов», «486 автотестов»: the count of the suite. No \b after Cyrillic — \b is ASCII-only (PLAN C.1.1); the
 * negative look-ahead keeps «тестовый» out. Global: use with matchAll or replace.
 */
export const TEST_COUNT = /(\d+)(\s+)(авто)?тест(?:а|ов)?(?![а-яёa-z])/gi;

/** «APK 5093 КБ», «APK собран: 5093 КБ»: the size of the release APK in KiB, at most 24 characters after «APK». */
export const APK_SIZE = /APK[^\n|]{0,24}?(\d+)\s*КБ/g;

/** The Russian plural of «тест» for n («1 тест», «2 теста», «5 тестов», «11 тестов»). */
export const testsWord = n => (n % 10 === 1 && n % 100 !== 11 ? 'тест' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'теста' : 'тестов');

/** The text with every quoted test count set to n, in the right plural. */
export const withTestCount = (text, n) => text.replace(TEST_COUNT, (_, _n, space, auto) => `${n}${space}${auto ?? ''}${testsWord(n)}`);

/** The text with every quoted APK size set to kb; the words between «APK» and the number stay. */
export const withApkSize = (text, kb) => text.replace(APK_SIZE, quote => quote.replace(/\d+(\s*КБ)$/, `${kb}$1`));
