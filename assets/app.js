import { parseHours, statusLabel, fmtMin, formatWeek } from './hours.js';
import { cafePath, cityNameIn, mapySearchUrl } from './slug.js';
import { LANG, t, pluralIn, numIn } from './i18n.js';
import { addBasemap } from './basemap.js';

// Bitové příznaky — musí odpovídat scripts/fetch-data.mjs
const F = { WIFI: 1, OUTDOOR: 2, WHEELCHAIR: 4, VEGAN: 8, CHAIN: 16, VEGETARIAN: 32, WHEELCHAIR_LIMITED: 64, CARD: 128 };
const DAY_LONG = t.days;
const CZ_BOUNDS = [[48.55, 12.09], [51.06, 18.86]];
const LIST_LIMIT = 80;

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const plural = (n, forms) => pluralIn(LANG, n, forms);
const fmtNum = (n) => numIn(LANG, n);
// Na /en/ ukazujeme anglická jména měst (Prague, Pilsen); hledání zná obě.
const cityLabel = (city) => cityNameIn(city?.n, LANG);
const isMobile = () => matchMedia('(max-width: 760px)').matches;
const icon = (id) => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;

function km(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (d) => (d < 1 ? `${Math.round(d * 100) * 10} m` : `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`);

const state = {
  cafes: [],
  cities: [],
  byId: new Map(),
  filters: new Set(),
  q: '',
  matched: [],
  selected: null,
  me: null,
};

/* ---------------- otevírací doba ---------------- */

function computeStatus(c, now) {
  return statusLabel(c.week, now, LANG) ?? { cls: 'unknown', text: c.o ? t.hoursInDetail : t.hoursUnknown };
}
const dayIndex = (d) => (d.getDay() + 6) % 7;

/* ---------------- mapa ---------------- */

// Celočíselný zoomSnap: se zlomkovým (např. 0.25) Leaflet zaokrouhluje i krok kolečka myši,
// takže jeden „cvak“ přiblíží jen o čtvrt úrovně a zoomování je pomalé.
const map = L.map('map', { zoomControl: !isMobile(), minZoom: 6, maxZoom: 19 });
map.fitBounds(CZ_BOUNDS, { padding: [10, 10], paddingBottomRight: [0, isMobile() ? innerHeight * 0.46 : 0] });
map.attributionControl.setPrefix(false);

addBasemap(map);

// Mapa mohla vzniknout ve skrytém nebo ještě nenarozvrženém kontejneru.
new ResizeObserver(() => {
  map.invalidateSize();
  if (state.cafes.length) renderList();
}).observe($('#map'));

const cluster = L.markerClusterGroup({
  chunkedLoading: true,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  disableClusteringAtZoom: 17,
  maxClusterRadius: (z) => (z < 10 ? 60 : z < 14 ? 48 : 34),
  iconCreateFunction(cl) {
    const n = cl.getChildCount();
    const size = n < 10 ? 32 : n < 100 ? 38 : n < 1000 ? 46 : 54;
    return L.divIcon({
      html: `<div class="cluster" style="width:${size}px;height:${size}px">${n}</div>`,
      className: '',
      iconSize: [size, size],
    });
  },
});
map.addLayer(cluster);

const iconCache = new Map();
function pinIcon(cls, beans) {
  const key = cls + (beans ? 'b' : '');
  if (!iconCache.has(key)) {
    iconCache.set(
      key,
      L.divIcon({ className: 'pin-wrap', html: `<div class="pin ${cls}${beans ? ' beans' : ''}"></div>`, iconSize: [18, 18] })
    );
  }
  return iconCache.get(key);
}

let meMarker = null;

// Výběr a zvýraznění kreslíme samostatnou značkou nad shluky,
// protože markercluster při překreslení ikony jednotlivých míst vyměňuje.
const ringIcon = (cls) => L.divIcon({ className: '', html: `<div class="ring ${cls}"></div>`, iconSize: [36, 36] });
const selMarker = L.marker([0, 0], { icon: ringIcon('sel'), interactive: false, keyboard: false, zIndexOffset: 2000 });
const hoverMarker = L.marker([0, 0], { icon: ringIcon('hover'), interactive: false, keyboard: false, zIndexOffset: 1500 });

function setRing(m, c) {
  if (c) m.setLatLng([c.y, c.x]).addTo(map);
  else m.remove();
}
const setActiveMarker = (c) => setRing(selMarker, c);
const setHoverMarker = (c) => setRing(hoverMarker, c);

/* ---------------- data ---------------- */

async function load() {
  const res = await fetch('/data/cafes.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  state.cities = data.cities;
  state.meta = data;
  const now = new Date();
  for (const c of data.cafes) {
    c.f ||= 0;
    c.city = c.c != null ? data.cities[c.c] : null;
    c.week = parseHours(c.o, now);
    c.search = norm(`${c.n} ${c.a || ''} ${c.city?.n || ''} ${cityLabel(c.city) || ''} ${c.b || ''}`);
    c.status = computeStatus(c, now);
    c.marker = L.marker([c.y, c.x], { icon: pinIcon(c.status.cls, c.k), keyboard: false, title: '' });
    c.marker.on('click', () => openCafe(c));
    if (!matchMedia('(hover: none)').matches) {
      c.marker.bindTooltip(c.n, { direction: 'top', offset: [0, -10], className: 'tip' });
    }
    state.byId.set(c.i, c);
  }
  state.cafes = data.cafes;

  const total = data.cafes.length;
  $('#tagline').textContent = t.tagline(fmtNum(total));

  applyFilters();
  if (location.hash.length > 1) showFromHash();
  else openCityFromQuery();
  setInterval(refreshStatuses, 60_000);
}

function refreshStatuses() {
  const now = new Date();
  let changed = false;
  for (const c of state.cafes) {
    if (now.getDate() !== c._parsedDay && c.o) {
      c.week = parseHours(c.o, now); // sezónní pravidla se mění s měsícem
      c._parsedDay = now.getDate();
    }
    const s = computeStatus(c, now);
    if (s.cls !== c.status.cls) {
      c.marker.setIcon(pinIcon(s.cls, c.k));
      changed = true;
    }
    c.status = s;
  }
  if (changed && state.filters.has('open')) applyFilters();
  else if (state.selected) renderDetail(state.selected);
  else renderList();
}

/* ---------------- filtry a hledání ---------------- */

function matches(c) {
  const f = state.filters;
  if (f.size) {
    if (f.has('open') && !(c.status.cls === 'open' || c.status.cls === 'soon')) return false;
    if (f.has('indie') && c.f & F.CHAIN) return false;
    if (f.has('outdoor') && !(c.f & F.OUTDOOR)) return false;
    if (f.has('wifi') && !(c.f & F.WIFI)) return false;
    if (f.has('wheelchair') && !(c.f & F.WHEELCHAIR)) return false;
    if (f.has('veg') && !(c.f & (F.VEGAN | F.VEGETARIAN))) return false;
    if (f.has('beans') && !(c.k || c.r)) return false;
  }
  if (state.q) {
    for (const term of state.q.split(' ')) if (term && !c.search.includes(term)) return false;
  }
  return true;
}

function applyFilters() {
  state.matched = state.cafes.filter(matches);
  cluster.clearLayers();
  cluster.addLayers(state.matched.map((c) => c.marker));
  renderCityHint();
  renderList();
}

function renderCityHint() {
  const box = $('#cityHint');
  if (!state.q || state.q.length < 2) return void (box.innerHTML = '');
  const hits = state.cities.filter((c) => norm(c.n).startsWith(state.q) || norm(cityLabel(c)).startsWith(state.q)).sort((a, b) => b.pop - a.pop).slice(0, 2);
  box.innerHTML = hits
    .map(
      (c, i) => `<button class="city-hint" data-city="${state.cities.indexOf(c)}">${icon('pin')}
        <span>${t.goToCity} <b>${esc(cityLabel(c))}</b><br><span class="muted small">${fmtNum(c.count)} ${plural(c.count, t.places)} ${t.withCoffee} · ${fmtNum(c.pop)} ${t.inhabitants}</span></span></button>`
    )
    .join('');
}

function refPoint() {
  if (state.me) return state.me;
  const c = map.getCenter();
  return [c.lat, c.lng];
}

function renderList() {
  if (state.selected) return;
  const list = $('#list');
  const ref = refPoint();
  let items;
  let label;
  if (state.q) {
    items = state.matched;
    label = `${fmtNum(items.length)} ${plural(items.length, t.results)} ${t.inCzechia}`;
  } else {
    const b = map.getBounds();
    items = state.matched.filter((c) => b.contains([c.y, c.x]));
    label = `${fmtNum(items.length)} ${plural(items.length, t.places)} ${t.inView}`;
  }
  for (const c of items) c._d = km(ref, [c.y, c.x]);
  // otevřené nahoru, pak podle vzdálenosti
  const rank = { open: 0, soon: 0, unknown: 1, closed: 2 };
  // v přehledu (malé přiblížení) nechceme seznam začínat benzinkami
  const chainLast = !state.me && map.getZoom() < 13;
  const chain = (c) => (chainLast && c.f & F.CHAIN ? 1 : 0);
  items = items
    .slice()
    .sort((a, b) => (state.me || state.q ? 0 : rank[a.status.cls] - rank[b.status.cls]) || chain(a) - chain(b) || a._d - b._d);
  $('#count').textContent = label;

  if (!items.length) {
    list.innerHTML = `<li class="empty"><strong>${t.nothingHere}</strong>${state.q || state.filters.size ? t.tryFilters : t.tryMove}</li>`;
    return;
  }

  const showDist = !!state.me || !!state.q;
  const html = items.slice(0, LIST_LIMIT).map((c) => {
    const where = c.a || cityLabel(c.city) || '';
    const tags = [];
    if (c.k) tags.push(c.r ? t.roaster : t.homeCoffee);
    else if (c.r) tags.push(t.roaster);
    if (c.f & F.OUTDOOR) tags.push(t.outdoor);
    if (c.f & F.WIFI) tags.push(t.wifi);
    if (c.f & F.VEGAN) tags.push(t.vegan);
    if (c.b) tags.push(c.b);
    return `<li><button class="card" data-id="${c.i}">
      <div class="card-top"><span class="card-name">${esc(c.n)}</span>${showDist ? `<span class="card-dist">${fmtDist(c._d)}</span>` : ''}</div>
      <div class="card-meta"><span class="status ${c.status.cls}">${c.status.cls !== 'unknown' ? `<i class="dot dot-${c.status.cls === 'soon' ? 'open' : c.status.cls}"></i>` : ''}${esc(c.status.text)}</span>${where ? `<span class="where">· ${esc(where)}</span>` : ''}</div>
      ${tags.length ? `<div class="tags">${tags.slice(0, 4).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </button></li>`;
  });
  if (items.length > LIST_LIMIT) {
    html.push(`<li class="more">${t.more(fmtNum(items.length - LIST_LIMIT))}</li>`);
  }
  list.innerHTML = html.join('');
}

/* ---------------- detail ---------------- */

function openCafe(c) {
  const hash = '#' + c.i;
  if (location.hash === hash) return showCafe(c);
  // Zpět v prohlížeči detail zavře; při přeskoku mezi kavárnami historii nehromadíme.
  if (state.selected) history.replaceState(null, '', hash);
  else {
    history.pushState(null, '', hash);
    state.pushedHash = true;
  }
  showFromHash();
}

function showFromHash() {
  const c = state.byId.get(decodeURIComponent(location.hash.slice(1)));
  if (c) showCafe(c);
  else closeDetail(false);
}

function showCafe(c) {
  state.selected = c;
  setHoverMarker(null);
  renderDetail(c);
  $('#list').hidden = true;
  $('#cityHint').hidden = true;
  $('.list-head').hidden = true;
  $('#detail').hidden = false;
  $('#panel').classList.add('has-detail');
  $('#scroll').scrollTop = 0;
  document.title = `${c.n} — Kafemapa`;
  if (isMobile()) setSheet('half');

  const focus = () => {
    setActiveMarker(c);
    if (isMobile()) {
      const h = $('#panel').getBoundingClientRect().height;
      map.panBy([0, h / 2], { animate: false });
    }
  };
  if (cluster.hasLayer(c.marker)) {
    if (map.getZoom() < 16) map.setView([c.y, c.x], 17, { animate: false });
    cluster.zoomToShowLayer(c.marker, () => {
      map.panTo([c.y, c.x], { animate: false });
      focus();
    });
  } else {
    map.setView([c.y, c.x], 17, { animate: false });
    focus();
  }
}

function closeDetail(updateUrl = true) {
  if (updateUrl && location.hash) history.replaceState(null, '', location.pathname + location.search);
  state.pushedHash = false;
  state.selected = null;
  setActiveMarker(null);
  document.title = t.title;
  $('#detail').hidden = true;
  $('#panel').classList.remove('has-detail');
  $('#list').hidden = false;
  $('#cityHint').hidden = false;
  $('.list-head').hidden = false;
  renderList();
}

const leaveDetail = () => (state.pushedHash ? history.back() : closeDetail());

function osmUrl(c, edit) {
  const type = { n: 'node', w: 'way', r: 'relation' }[c.i[0]];
  const id = c.i.slice(1);
  return edit ? `https://www.openstreetmap.org/edit?${type}=${id}` : `https://www.openstreetmap.org/${type}/${id}`;
}

function renderDetail(c) {
  const kind = c.k ? (c.r ? t.roaster : t.coffeeShop) : c.r ? t.cafeRoaster : t.cafe;
  const addr = [c.a, c.a && c.city && c.a.includes(c.city.n) ? null : cityLabel(c.city)].filter(Boolean).join(', ');
  const today = dayIndex(new Date());

  let hours = '';
  if (c.week) {
    hours = `<table class="hours"><tbody>${DAY_LONG.map((d, i) => {
      const iv = c.week[i];
      const txt = !iv.length ? t.closed : iv.map(([a, b]) => (a === 0 && b >= 1440 ? t.nonstop : `${fmtMin(a)}–${fmtMin(b)}`)).join(', ');
      return `<tr class="${i === today ? 'today' : ''}"><td>${d}</td><td>${txt}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="muted small">${t.noHolidays}</p>`;
  } else if (c.o) {
    hours = `<p class="hours-raw">${esc(c.o)}</p>`;
  } else {
    hours = `<p class="muted">${t.hoursMissing}</p>`;
  }

  const feats = [];
  if (c.f & F.OUTDOOR) feats.push(t.outdoor);
  if (c.f & F.WIFI) feats.push(t.wifi);
  if (c.f & F.WHEELCHAIR) feats.push(t.wheelchair);
  if (c.f & F.WHEELCHAIR_LIMITED) feats.push(t.wheelchairLimited);
  if (c.f & F.VEGAN) feats.push(t.veganOptions);
  else if (c.f & F.VEGETARIAN) feats.push(t.vegetarianOptions);
  if (c.f & F.CARD) feats.push(t.card);
  if (c.b) feats.push(t.chain(c.b));
  if (c.l) feats.push(t.level(c.l));

  const actions = [
    `<a class="btn primary" href="https://mapy.com/fnc/v1/route?end=${c.x},${c.y}" target="_blank" rel="noopener">${icon('nav')}${t.navigate}</a>`,
  ];
  if (c.w) actions.push(`<a class="btn" href="${esc(c.w)}" target="_blank" rel="noopener">${icon('globe')}${t.web}</a>`);
  if (c.p) actions.push(`<a class="btn" href="tel:${esc(c.p.replace(/[^\d+]/g, ''))}">${icon('phone')}${t.call}</a>`);
  if (c.ig) actions.push(`<a class="btn" href="${esc(c.ig)}" target="_blank" rel="noopener">${icon('insta')}Instagram</a>`);
  if (c.fb) actions.push(`<a class="btn" href="${esc(c.fb)}" target="_blank" rel="noopener">${icon('fb')}Facebook</a>`);
  actions.push(`<button class="btn" id="btnShare" aria-live="polite">${icon('share')}${t.share}</button>`);

  $('#detail').innerHTML = `
    <button class="link-btn back" id="btnBack">${icon('back')}${t.back}</button>
    <div class="kind">${kind}</div>
    <h2>${esc(c.n)}</h2>
    ${addr ? `<p class="addr">${icon('pin')}<span>${esc(addr)}</span></p>` : ''}
    <span class="status-pill ${c.status.cls}">${c.status.cls !== 'unknown' ? `<i class="dot dot-${c.status.cls === 'soon' ? 'open' : c.status.cls}"></i>` : icon('clock')}${esc(c.status.text)}</span>
    <div class="actions">${actions.join('')}</div>
    ${c.d ? `<div class="section"><h3>${t.description}</h3><p class="desc">${esc(c.d)}</p></div>` : ''}
    <div class="section"><h3>${t.hours}</h3>${hours}
      <details class="help-box"${c.o ? '' : ' data-primary'}>
        <summary>${c.o ? t.fixHours : t.addHours}</summary>
        <div data-hours-editor></div>
      </details>
    </div>
    ${feats.length ? `<div class="section"><h3>${t.amenities}</h3><div class="feats">${feats.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
    <details class="help-box report-box">
      <summary>${t.report}</summary>
      <div data-report></div>
    </details>
    <div class="osm-links">
      ${cafePath(c, c.city?.n, LANG) ? `<a href="${cafePath(c, c.city?.n, LANG)}">${icon('globe')}${t.cafePage}</a>` : ''}
      <a href="${osmUrl(c, true)}" target="_blank" rel="noopener">${icon('edit')}${t.editOsm}</a>
      <a href="https://www.google.com/maps/search/?api=1&query=${c.y},${c.x}" target="_blank" rel="noopener">${icon('globe')}Google Maps</a>
      <a href="${mapySearchUrl(c, c.city?.n)}" target="_blank" rel="noopener">${icon('pin')}${t.mapySearch}</a>
    </div>`;

  $('#btnBack').onclick = leaveDetail;
  const reportBox = $('#detail .report-box');
  reportBox.addEventListener('toggle', async () => {
    const host = reportBox.querySelector('[data-report]');
    if (!reportBox.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountReportForm } = await import('./osm-note.js');
    mountReportForm(host, c);
  });
  const helpBox = $('#detail .help-box:not(.report-box)');
  helpBox.addEventListener('toggle', async () => {
    const host = helpBox.querySelector('[data-hours-editor]');
    if (!helpBox.open || host.dataset.mounted) return;
    host.dataset.mounted = '1';
    const { mountHoursEditor } = await import('./hours-editor.js');
    mountHoursEditor(host, { osmEditUrl: osmUrl(c, true), current: c.o, cafe: c });
  });
  // Návrat z přihlášení do OSM přesměrováním: rozbalit formulář (obnoví si vyplněné časy).
  try {
    if (JSON.parse(sessionStorage.getItem('kafemapa:osm-resume') || 'null')?.i === c.i) helpBox.open = true;
  } catch {}
  // Úprava otevírací doby od tohoto návštěvníka, kterou denní data ještě nepřinesla.
  let hasPending = false;
  try {
    hasPending = Object.keys(localStorage).some((k) => k.startsWith('kafemapa:pending:'));
  } catch {}
  if (hasPending) {
    import('./osm.js').then(({ pendingEdit }) => {
      const p = pendingEdit(c.i, c.o || '');
      if (!p || state.selected !== c) return;
      const w = parseHours(p.o);
      const note = document.createElement('p');
      note.className = 'pending-note';
      note.innerHTML = t.pendingHours(esc(w ? formatWeek(w, LANG) : p.o), p.url);
      helpBox.before(note);
    });
  }
  $('#btnShare').onclick = async (e) => {
    // Odkaz na tlačítko si podržet hned: po await už e.currentTarget je null.
    const btn = e.currentTarget;
    // Stránka kavárny má v náhledu jméno, adresu a otevírací dobu; jinak odkaz na místo na mapě.
    const page = cafePath(c, c.city?.n, LANG);
    const url = page ? location.origin + page : location.href;
    if (navigator.share) {
      try { await navigator.share({ title: c.n, text: t.shareText(c.n), url }); } catch {}
      return;
    }
    const label = btn.lastChild;
    const original = label.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {}
    if (!ok) {
      // Schránka nedostupná (např. bez HTTPS nebo bez oprávnění): nabídnout odkaz k ručnímu zkopírování.
      prompt(t.copyManually, url);
      return;
    }
    label.textContent = t.copied;
    btn.classList.add('done');
    clearTimeout(btn._reset);
    btn._reset = setTimeout(() => {
      label.textContent = original;
      btn.classList.remove('done');
    }, 2200);
  };
}

/* ---------------- žebříček ---------------- */

function renderRank(tab) {
  const per = (c) => (c.count / c.pop) * 10000;
  let rows;
  if (tab === 'perCapita') {
    rows = state.cities.filter((c) => c.pop >= 10000).sort((a, b) => per(b) - per(a)).slice(0, 30);
    $('#rankNote').textContent = t.rankNotePer;
  } else {
    rows = state.cities.slice(0, 30);
    $('#rankNote').textContent = t.rankNoteTotal;
  }
  const val = (c) => (tab === 'perCapita' ? per(c) : c.count);
  const max = val(rows[0]);
  $('#rankList').innerHTML = rows
    .map((c) => {
      const v = val(c);
      const shown = tab === 'perCapita' ? v.toLocaleString(LANG === 'en' ? 'en-GB' : 'cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : fmtNum(v);
      const sub = tab === 'perCapita' ? `${fmtNum(c.count)} ${plural(c.count, t.places)} · ${fmtNum(c.pop)} ${t.inhabitants}` : `${fmtNum(c.pop)} ${t.inhabitants}`;
      return `<li><button data-city="${state.cities.indexOf(c)}">
        <span><span class="city">${esc(cityLabel(c))}</span><br><span class="sub">${sub}</span><div class="bar" style="width:${((v / max) * 100).toFixed(1)}%"></div></span>
        <span class="val">${shown}</span></button></li>`;
    })
    .join('');
}

// Odkaz ze stránky města: /?mesto=brno (anglicky /en/?city=prague)
async function openCityFromQuery() {
  const q = new URLSearchParams(location.search);
  const slug = q.get('mesto') || q.get('city');
  if (!slug) return;
  try {
    const idx = (await (await fetch('/data/mesta.json')).json())[slug];
    if (idx != null) goToCity(idx);
  } catch {}
}

function goToCity(idx) {
  const c = state.cities[idx];
  if (!c) return;
  if (state.selected) closeDetail();
  state.q = '';
  $('#q').value = '';
  $('#qClear').hidden = true;
  applyFilters();
  const z = c.pop > 300000 ? 12 : c.pop > 50000 ? 13 : 14;
  map.setView([c.y, c.x], z);
  if (isMobile()) setSheet('half');
}

/* ---------------- mobilní spodní list ---------------- */

const SHEET = ['collapsed', 'half', 'expanded'];
function setSheet(s) {
  if (!isMobile()) return;
  document.body.classList.remove(...SHEET.map((x) => 'sheet-' + x));
  document.body.classList.add('sheet-' + s);
  document.body.style.removeProperty('--sheet-h');
  $('#sheetHandle').setAttribute('aria-label', s === 'expanded' ? t.collapse : t.expand);
  setTimeout(() => map.invalidateSize(), 300);
}
const sheetState = () => SHEET.find((s) => document.body.classList.contains('sheet-' + s)) || 'half';

(function initSheet() {
  const handle = $('#sheetHandle');
  let startY = 0;
  let startH = 0;
  let moved = false;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startH = $('#panel').getBoundingClientRect().height;
    moved = false;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('sheet-dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    const h = Math.max(120, Math.min(innerHeight * 0.92, startH + dy));
    document.body.style.setProperty('--sheet-h', h + 'px');
  });
  handle.addEventListener('pointerup', (e) => {
    document.body.classList.remove('sheet-dragging');
    if (!moved) {
      setSheet(sheetState() === 'expanded' ? 'half' : 'expanded');
      return;
    }
    const h = $('#panel').getBoundingClientRect().height / innerHeight;
    setSheet(h > 0.67 ? 'expanded' : h > 0.32 ? 'half' : 'collapsed');
  });
})();

/* ---------------- události ---------------- */

let qTimer;
$('#q').addEventListener('input', (e) => {
  $('#qClear').hidden = !e.target.value;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    state.q = norm(e.target.value.trim()).replace(/\s+/g, ' ');
    if (state.selected) closeDetail();
    applyFilters();
  }, 120);
});
$('#q').addEventListener('focus', () => sheetState() !== 'expanded' && setSheet('expanded'));
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = $('#cityHint [data-city]') || $('#list .card');
    first?.click();
    e.target.blur();
  }
});
$('#qClear').addEventListener('click', () => {
  $('#q').value = '';
  $('#qClear').hidden = true;
  state.q = '';
  applyFilters();
  $('#q').focus();
});

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const f = chip.dataset.filter;
  const on = !state.filters.has(f);
  on ? state.filters.add(f) : state.filters.delete(f);
  chip.setAttribute('aria-pressed', String(on));
  if (state.selected) closeDetail();
  applyFilters();
});

$('#list').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) openCafe(state.byId.get(card.dataset.id));
});
$('#list').addEventListener('mouseover', (e) => {
  const card = e.target.closest('.card');
  setHoverMarker(card ? state.byId.get(card.dataset.id) : null);
});
$('#list').addEventListener('mouseleave', () => setHoverMarker(null));

document.addEventListener('click', (e) => {
  const city = e.target.closest('[data-city]');
  if (city) {
    city.closest('dialog')?.close();
    goToCity(+city.dataset.city);
  }
  if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
});
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => e.target === d && d.close()); // klik mimo
}

window.addEventListener('hashchange', showFromHash);

let moveTimer;
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => !state.q && renderList(), 80);
});

$('#btnRandom').addEventListener('click', () => {
  const b = map.getBounds();
  const pool = (list) => list.filter((c) => c.status.cls === 'open' && !(c.f & F.CHAIN));
  let candidates = pool(state.matched.filter((c) => b.contains([c.y, c.x])));
  if (!candidates.length) candidates = pool(state.matched);
  if (!candidates.length) candidates = state.matched;
  if (!candidates.length) return;
  openCafe(candidates[Math.floor(Math.random() * candidates.length)]);
});

$('#btnLocate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert(t.noGeo);
  const btn = $('#btnLocate');
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove('busy');
      state.me = [pos.coords.latitude, pos.coords.longitude];
      meMarker?.remove();
      meMarker = L.marker(state.me, {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
      if (state.selected) closeDetail();
      map.setView(state.me, 15);
      if (isMobile()) setSheet('half');
    },
    (err) => {
      btn.classList.remove('busy');
      alert(err.code === 1 ? t.geoDenied : t.geoFailed);
    },
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
  );
});

$('#btnRank').addEventListener('click', () => {
  renderRank('perCapita');
  for (const t of document.querySelectorAll('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.tab === 'perCapita'));
  $('#dlgRank').showModal();
});
document.querySelector('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[role=tab]');
  if (!t) return;
  for (const x of document.querySelectorAll('.tabs [role=tab]')) x.setAttribute('aria-selected', String(x === t));
  renderRank(t.dataset.tab);
});
$('#btnAbout').addEventListener('click', () => $('#dlgAbout').showModal());

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selected && !document.querySelector('dialog[open]')) leaveDetail();
  if (e.key === '/' && document.activeElement !== $('#q')) {
    e.preventDefault();
    $('#q').focus();
  }
});

if (isMobile()) setSheet('half');

// Upoutávka na aktuální Kavárenský index, dokud ji člověk nezavře.
(function promo() {
  const box = $('#promo');
  if (!box) return; // anglická verze upoutávku nemá (index je jen česky)
  const key = `kafemapa:promo:${box.dataset.key}`;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(key) === '1';
  } catch {}
  box.hidden = dismissed;
  $('#promoClose').addEventListener('click', () => {
    box.hidden = true;
    try {
      localStorage.setItem(key, '1');
    } catch {}
  });
})();

load().catch((err) => {
  console.error(err);
  $('#count').textContent = t.loadError;
});

// Pro ladění v konzoli prohlížeče.
window.kafemapa = { map, cluster, state };
