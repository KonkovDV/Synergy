import './pin-set.mjs'; // 6.0: the suite of earlier releases speaks the «Синергия» set (tests/pin-set.mjs)
// Architecture fitness function: the layer rules of docs/ARCHITECTURE.md, checked on every import.
// core — domain (only config and core); input — signal sources; games — core, render, config;
// render — procedural drawing; services — core, render, config; ui and app.js — may use everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize, relative } from 'node:path';

const ALLOWED = {
  core: ['core', 'config.js'],
  input: ['input', 'core', 'config.js'],
  games: ['games', 'core', 'render', 'config.js'],
  render: ['render', 'config.js'],
  services: ['services', 'core', 'render', 'config.js'],
};
const layerOf = file => relative('src', file).split('/')[0];

test('architecture: every import respects the layer rules', () => {
  const files = readdirSync('src', { recursive: true }).filter(f => f.endsWith('.js')).map(f => join('src', f));
  const violations = [];
  for (const file of files) {
    const layer = layerOf(file);
    if (!ALLOWED[layer]) continue; // ui/, app.js, main.js — composition
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      if (!spec.startsWith('.')) { violations.push(`${file} → ${spec} (no packages in the product)`); continue; }
      const target = layerOf(normalize(join(dirname(file), spec)));
      if (!ALLOWED[layer].includes(target)) violations.push(`${file} → ${spec}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('architecture: the domain never touches the DOM or the browser', () => {
  const browser = /(?<![.\w$])(document|window|navigator|localStorage|requestAnimationFrame|AudioContext)\b/; // not obj.window
  const offenders = readdirSync('src/core').filter(f => f.endsWith('.js'))
    .filter(f => readFileSync(join('src/core', f), 'utf8').split('\n').some(l => !/^\s*(\/\/|\/?\*)/.test(l) && browser.test(l)));
  assert.deepEqual(offenders, []);
});
