// Statické stránky měst: živý stav „otevřeno / zavřeno“ a filtry nad vygenerovaným seznamem.
import { parseHours, statusLabel } from './hours.js';
import { LANG, t, pluralIn } from './i18n.js';

const F = { WIFI: 1, OUTDOOR: 2, CHAIN: 16 };
const items = [...document.querySelectorAll('.cafe, [data-live]')];
const filters = new Set();

function refresh() {
  const now = new Date();
  for (const el of items) {
    const s = el.dataset.o ? statusLabel(parseHours(el.dataset.o, now), now, LANG) : null;
    el.dataset.open = s && s.cls !== 'closed' ? '1' : '';
    const out = el.querySelector('[data-status]');
    out.className = `status ${s ? s.cls : 'unknown'}`;
    out.textContent = s ? s.text.replace(' · otevře ', ', otevře ').replace(' · opens ', ', opens ') : '';
  }
  // Stránka kavárny: zvýraznit dnešní den v tabulce otevírací doby
  const today = (now.getDay() + 6) % 7;
  for (const tr of document.querySelectorAll('[data-week] tr')) tr.classList.toggle('today', +tr.dataset.day === today);
  apply();
}

function apply() {
  let shown = 0;
  const cards = items.filter((el) => el.classList.contains('cafe'));
  for (const el of items) {
    if (!el.classList.contains('cafe')) continue;
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
      ? t.shownOf(shown, cards.length) + (LANG === 'en' ? '' : ` ${pluralIn('cs', cards.length, ['místa', 'míst', 'míst'])}`)
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

// Pomocník pro otevírací dobu: modul se načte, až ho někdo rozbalí.
for (const box of document.querySelectorAll('.help-box:not(.report-box)')) {
  box.addEventListener('toggle', async () => {
    const host = box.querySelector('[data-hours-editor]');
    if (!box.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountHoursEditor } = await import('./hours-editor.js');
    mountHoursEditor(host, { osmEditUrl: host.dataset.osmEdit, current: host.dataset.current });
  });
}

// Hlášení zavřeného podniku nebo chyby (OSM poznámka), načte se až po rozbalení.
for (const box of document.querySelectorAll('.report-box')) {
  box.addEventListener('toggle', async () => {
    const host = box.querySelector('[data-report]');
    if (!box.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountReportForm } = await import('./osm-note.js');
    const d = host.dataset;
    mountReportForm(host, { i: d.i, n: d.n, y: +d.y, x: +d.x });
  });
}

// Minimapa na stránce kavárny (Leaflet se načte až podle potřeby).
if (document.querySelector('[data-minimap]')) import('./minimap.js');
