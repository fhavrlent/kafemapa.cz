// Statické stránky měst: živý stav „otevřeno / zavřeno“ a filtry nad vygenerovaným seznamem.
import { parseHours, statusLabel, formatWeek } from './hours.js';
import { LANG, t, pluralIn } from './i18n.js';

const F = { WIFI: 1, OUTDOOR: 2, CHAIN: 16 };
const items = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cafe, [data-live]'))];
const filters = new Set();
let query = '';
// Hledání bez ohledu na diakritiku a velikost písmen („kavarna“ najde „Kavárna“).
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const haystack = new Map(
  items.filter((el) => el.classList.contains('cafe')).map((el) => [el, norm(`${el.querySelector('h3')?.textContent} ${el.querySelector('.cafe-addr')?.textContent ?? ''}`)])
);

function refresh() {
  const now = new Date();
  for (const el of items) {
    const s = el.dataset.o ? statusLabel(parseHours(el.dataset.o, now), now, LANG) : null;
    el.dataset.open = s && s.cls !== 'closed' ? '1' : '';
    const out = /** @type {HTMLElement} */ (el.querySelector('[data-status]'));
    out.className = `status ${s ? s.cls : 'unknown'}`;
    out.textContent = s ? s.text.replace(' · otevře ', ', otevře ').replace(' · opens ', ', opens ') : '';
  }
  // Stránka kavárny: zvýraznit dnešní den v tabulce otevírací doby
  const today = (now.getDay() + 6) % 7;
  for (const tr of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-week] tr'))) tr.classList.toggle('today', +tr.dataset.day === today);
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
      (!filters.has('beans') || 'beans' in el.dataset) &&
      (!query || query.split(' ').every((w) => haystack.get(el).includes(w)));
    el.hidden = !ok;
    if (ok) shown++;
  }
  const count = document.querySelector('[data-count]');
  if (count) {
    count.textContent = filters.size || query
      ? t.shownOf(shown, cards.length) + (LANG === 'en' ? '' : ` ${pluralIn('cs', cards.length, ['místa', 'míst', 'míst'])}`)
      : '';
  }
}

const bar = /** @type {HTMLElement} */ (document.querySelector('[data-filters]'));
if (bar) {
  bar.hidden = false; // bez JS filtry nefungují, proto je ukazujeme až teď
  bar.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('.chip'));
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
for (const box of /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll('.help-box:not(.report-box):not(.amen-box)'))) {
  box.addEventListener('toggle', async () => {
    const host = /** @type {HTMLElement} */ (box.querySelector('[data-hours-editor]'));
    if (!box.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountHoursEditor } = await import('./hours-editor.js');
    mountHoursEditor(host, { osmEditUrl: host.dataset.osmEdit, current: host.dataset.current, cafe: host.dataset.i ? { i: host.dataset.i, n: host.dataset.n } : null });
  });
}

// Vybavení (Wi‑Fi, zahrádka…): formulář se načte až po rozbalení.
for (const box of /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll('.amen-box'))) {
  box.addEventListener('toggle', async () => {
    const host = /** @type {HTMLElement} */ (box.querySelector('[data-amenities-editor]'));
    if (!box.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountAmenitiesEditor } = await import('./amenities-editor.js');
    mountAmenitiesEditor(host, { cafe: { i: host.dataset.i, n: host.dataset.n }, osmEditUrl: host.dataset.osmEdit });
  });
}

// Návrat z přihlášení do OSM přesměrováním: rozbalit formulář, ten si obnoví vyplněné údaje.
try {
  const r = JSON.parse(sessionStorage.getItem('kafemapa:osm-resume') || 'null');
  const host = r && document.querySelector(`[data-${r.kind === 'amenities' ? 'amenities' : 'hours'}-editor][data-i="${r.i}"]`);
  if (host) host.closest('details').open = true;
} catch {}

// Hlášení zavřeného podniku nebo chyby (OSM poznámka), načte se až po rozbalení.
for (const box of /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll('.report-box'))) {
  box.addEventListener('toggle', async () => {
    const host = /** @type {HTMLElement} */ (box.querySelector('[data-report]'));
    if (!box.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountReportForm } = await import('./osm-note.js');
    const d = host.dataset;
    mountReportForm(host, { i: d.i, n: d.n, y: +d.y, x: +d.x });
  });
}

// Minimapa na stránce kavárny (Leaflet se načte až podle potřeby).
if (document.querySelector('[data-minimap]')) import('./minimap.js');

// Úprava otevírací doby, kterou tenhle návštěvník uložil do OSM a kterou denní data ještě nepřinesla.
// osm.js načítáme jen tehdy, když nějaká taková úprava v prohlížeči je.
const editorHost = /** @type {HTMLElement | null} */ (document.querySelector('[data-hours-editor][data-i]'));
let hasPending = false;
try {
  hasPending = Object.keys(localStorage).some((k) => k.startsWith('kafemapa:pending'));
} catch {}
if (editorHost && hasPending) {
  import('./osm.js').then(({ pendingEdit, pendingAmenities }) => {
    const pa = pendingAmenities(editorHost.dataset.i);
    const amen = document.querySelector('[data-amenities-editor]');
    if (pa && amen) {
      const n = document.createElement('p');
      n.className = 'pending-note';
      n.innerHTML = t.pendingAmenities(pa.url);
      amen.closest('section').querySelector('h2').after(n);
    }
    const p = pendingEdit(editorHost.dataset.i, editorHost.dataset.current || '');
    if (!p) return;
    const note = document.createElement('p');
    note.className = 'pending-note';
    note.innerHTML = t.pendingHours(esc(formatPending(p.o)), p.url);
    editorHost.closest('section').querySelector('h2').after(note);
  });
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
function formatPending(o) {
  const w = parseHours(o);
  return w ? formatWeek(w, LANG) : o;
}

// Hledání v seznamu míst na stránce města
const search = /** @type {HTMLInputElement | null} */ (document.querySelector('[data-search]'));
if (search) {
  search.hidden = false;
  search.addEventListener('input', () => {
    query = norm(search.value.trim()).replace(/\s+/g, ' ');
    apply();
  });
}

// Pult stránky města: zvýraznit sekci, ve které právě jsme (poslední, jejíž nadpis už prošel horní částí okna).
const barLinks = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('.town-bar-nav a')]);
if (barLinks.length) {
  const targets = barLinks.map((a) => document.getElementById(a.hash.slice(1)));
  let ticking = false;
  // Po kliknutí na odkaz drží zvýraznění kliknutá sekce, dokud člověk sám nezačne posouvat
  // (poslední dvě krátké sekce se často vejdou na jednu obrazovku a výpočet by je nerozlišil).
  let pinned = -1;
  barLinks.forEach((a, i) => a.addEventListener('click', () => ((pinned = i), mark())));
  for (const ev of ['wheel', 'touchmove', 'keydown']) addEventListener(ev, () => (pinned = -1), { passive: true });
  const mark = () => {
    ticking = false;
    if (pinned >= 0) return barLinks.forEach((a, i) => (i === pinned ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    // Krátké sekce na konci stránky se nahoru nikdy nedostanou, proto stačí horních ~40 % okna.
    const line = Math.max(96, innerHeight * 0.4);
    let current = -1;
    targets.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top <= line) current = i;
    });
    // Na úplném konci stránky je aktuální poslední sekce, i když se její nadpis nahoru nevejde.
    if (scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = targets.length - 1;
    barLinks.forEach((a, i) => (i === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  };
  addEventListener('scroll', () => ticking || ((ticking = true), requestAnimationFrame(mark)), { passive: true });
  mark();
}
