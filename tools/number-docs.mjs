// Documents that quote numbers the submission gate verifies (tests, APK size). One list for
// tools/check-submission.mjs and tools/set-test-count.mjs.
export const NUMBER_DOCS = ['README.md', 'docs/JURY_STRATEGY.md', 'docs/AI_USAGE.md', 'docs/PITCH.md', 'MEMORY.md'];

// Documents that quote the accessibility and layout runs as current (MEMORY.md keeps the history of older runs).
export const RUN_DOCS = NUMBER_DOCS.filter(doc => doc !== 'MEMORY.md');
