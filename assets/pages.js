// Statické stránky měst: živý stav „otevřeno / zavřeno“ a filtry nad vygenerovaným seznamem.
import { parseHours, statusLabel } from './hours.js';

const F = { WIFI: 1, OUTDOOR: 2, CHAIN: 16 };
const plural = (n, [one, few, many]) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const items = [...document.querySelectorAll('.cafe')];
const filters = new Set();

function refresh() {
  const now = new Date();
  for (const el of items) {
    const s = el.dataset.o ? statusLabel(parseHours(el.dataset.o, now), now) : null;
    el.dataset.open = s && s.cls !== 'closed' ? '1' : '';
    const out = el.querySelector('[data-status]');
    out.className = `status ${s ? s.cls : 'unknown'}`;
    out.textContent = s ? s.text.replace(' · otevře ', ', otevře ') : '';
  }
  apply();
}

function apply() {
  let shown = 0;
  for (const el of items) {
    const f = +el.dataset.f;
    const ok =
      (!filters.has('open') || el.dataset.open) &&
      (!filters.has('indie') || !(f & F.CHAIN)) &&
      (!filters.has('outdoor') || f & F.OUTDOOR) &&
      (!filters.has('wifi') || f & F.WIFI) &&
      (!filters.has('beans') || 'beans' in el.dataset);
    el.hidden = !ok;
    if (ok) shown++;
  }
  const count = document.querySelector('[data-count]');
  if (count) {
    count.textContent = filters.size
      ? `Zobrazeno ${shown} z ${items.length} ${plural(items.length, ['místa', 'míst', 'míst'])}`
      : '';
  }
}

const bar = document.querySelector('[data-filters]');
if (bar) {
  bar.hidden = false; // bez JS filtry nefungují, proto je ukazujeme až teď
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const f = chip.dataset.filter;
    const on = !filters.has(f);
    on ? filters.add(f) : filters.delete(f);
    chip.setAttribute('aria-pressed', String(on));
    apply();
  });
}

refresh();
setInterval(refresh, 60_000);
