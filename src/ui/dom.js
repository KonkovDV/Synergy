// Tiny DOM helper: h('div', {class, onclick, ...}, ...children). Text is always set as text (no innerHTML).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function mount(root, ...nodes) { root.replaceChildren(...nodes); }

export function toast(text, kind = '') {
  const host = document.getElementById('toasts') ?? document.body.appendChild(h('div', { id: 'toasts', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast ${kind}` }, text);
  host.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3100);
}

export function starsText(n, total = 3) { return '★'.repeat(n) + '☆'.repeat(total - n); }
