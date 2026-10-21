// Parent gate for child mode: a 4–6-digit PIN in front of the settings. A gate against changes by a
// child at the screen, not a security boundary: anyone with the device storage can reset the app anyway.
// The brake that matters is the attempt lockout (nextPinLock); the hash only avoids storing the PIN in plain text.
import { h } from './dom.js';
import { badgeArt } from './art.js';
import { bottomNav } from './widgets.js';

/** FNV-1a over a salted PIN — the PIN itself is not stored in plain text. */
export function hashPin(pin) {
  let x = 0x811c9dc5;
  for (const ch of `synergy:${pin}`) { x ^= ch.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16).padStart(8, '0');
}

export const validPin = pin => /^\d{4,6}$/.test(pin);

/** A new PIN is stored only when it is typed twice and both copies match (the sample's parent PIN setup). */
export function pinConfirmed(first, again) {
  if (!validPin(first) || !validPin(again)) return 'short';
  return first === again ? 'ok' : 'mismatch';
}

/** Brute-force brake: 5 free tries, then 30 s doubling up to 15 min. The real control for a child at the screen. */
export const PIN_LOCK = { freeTries: 5, baseS: 30, maxS: 900 };

export function pinLockWait(lock, now = Date.now()) {
  const until = Number.isFinite(lock?.until) ? lock.until : 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function nextPinLock(lock, ok, now = Date.now()) {
  if (ok) return { fails: 0, until: 0 };
  const fails = (Number.isFinite(lock?.fails) ? lock.fails : 0) + 1;
  const over = fails - PIN_LOCK.freeTries;
  const until = over >= 0 ? now + 1000 * Math.min(PIN_LOCK.maxS, PIN_LOCK.baseS * 2 ** over) : 0;
  return { fails, until };
}

export function pinGateScreen(app, { next = 'settings' } = {}) {
  // autocomplete="current-password": a password manager may fill it (WCAG 2.2, 3.3.8 Accessible Authentication).
  const input = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'current-password', 'aria-label': 'PIN родителя', class: 'pin-input' });
  const error = h('p', { class: 'note warn', 'aria-live': 'polite' });
  const check = e => {
    e?.preventDefault();
    const wait = pinLockWait(app.settings.pinLock);
    if (wait) { error.textContent = `Слишком много попыток. Подождите ${wait} с`; input.value = ''; return; }
    if (!input.value) { error.textContent = 'Введите PIN'; input.focus(); return; } // an empty field is not an attempt
    const ok = hashPin(input.value) === app.settings.parentPin;
    app.updateSettings({ pinLock: nextPinLock(app.settings.pinLock, ok) });
    if (ok) { app.pinOk = true; app.go(next); return; }
    const after = pinLockWait(app.settings.pinLock);
    error.textContent = after ? `Неверный PIN. Следующая попытка через ${after} с` : 'Неверный PIN';
    input.value = ''; input.focus();
  };
  queueMicrotask(() => input.focus());
  return {
    fresh: true, // the screen behind it is mounted fresh after the right PIN (focus on its heading)
    node: h('div', { class: 'screen pin' },
      h('main', { class: 'scroll center' },
        h('div', { class: 'pin-art' }, badgeArt('lock', 88)),
        h('h1', {}, 'Для взрослых'),
        h('p', {}, 'Настройки защищены PIN-кодом родителя.'),
        // One submit per Enter or tap (5.6 listened to keydown and keyup: one wrong Enter cost two attempts).
        h('form', { class: 'pin-form', onsubmit: check }, input, error,
          h('button', { type: 'submit', class: 'btn primary big' }, 'Открыть')),
        h('p', { class: 'note' }, 'Забыли PIN? Переустановка приложения сбросит его вместе с прогрессом.')),
      bottomNav(app, 'settings')),
  };
}
