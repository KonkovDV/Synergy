// Parent gate for child mode: a 4-digit PIN in front of the settings. A gate against accidental
// changes by a child, not a security boundary (data never leave the device anyway).
import { h } from './dom.js';
import { bottomNav } from './widgets.js';

/** FNV-1a over a salted PIN — the PIN itself is not stored in plain text. */
export function hashPin(pin) {
  let x = 0x811c9dc5;
  for (const ch of `synergy:${pin}`) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16).padStart(8, '0');
}

export const validPin = pin => /^\d{4}$/.test(pin);

export function pinGateScreen(app, { next = 'settings' } = {}) {
  const input = h('input', { type: 'password', inputmode: 'numeric', maxlength: 4, autocomplete: 'off', 'aria-label': 'PIN родителя', class: 'pin-input' });
  const error = h('p', { class: 'note warn', 'aria-live': 'polite' });
  const check = () => {
    if (hashPin(input.value) === app.settings.parentPin) { app.pinOk = true; app.go(next); }
    else { error.textContent = 'Неверный PIN'; input.value = ''; input.focus(); }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
  input.addEventListener('input', () => { if (input.value.length === 4) check(); });
  queueMicrotask(() => input.focus());
  return {
    node: h('div', { class: 'screen pin' },
      h('main', { class: 'scroll center' },
        h('p', { class: 'big-emoji', 'aria-hidden': 'true' }, '🔒'),
        h('h1', {}, 'Для взрослых'),
        h('p', {}, 'Настройки защищены PIN-кодом родителя.'),
        input, error,
        h('button', { class: 'btn primary big', onclick: check }, 'Открыть'),
        h('p', { class: 'note' }, 'Забыли PIN? Переустановка приложения сбросит его вместе с прогрессом.')),
      bottomNav(app, 'settings')),
  };
}
