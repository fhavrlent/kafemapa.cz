// Minimapa na stránce kavárny: poloha podniku a kavárny v okolí.
// Leaflet a dlaždice se načtou, až když se mapa blíží k výřezu: neplatíme za dlaždice,
// které nikdo neuvidí, a stránka kavárny zůstane bez mapy stejně rychlá jako dřív.

const box = document.querySelector('[data-minimap]');

const loadCss = (href) =>
  new Promise((ok) => {
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href, onload: ok, onerror: ok });
    document.head.append(l);
  });
const loadScript = (src) =>
  new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail });
    document.head.append(s);
  });

async function show() {
  await Promise.all([loadCss('/assets/vendor/leaflet.css'), window.L ? null : loadScript('/assets/vendor/leaflet.js')]);
  const { addBasemap } = await import('./basemap.js');
  const here = [+box.dataset.y, +box.dataset.x];
  const near = JSON.parse(box.dataset.near || '[]');
  const touch = matchMedia('(pointer: coarse)').matches;

  // Na dotykovém displeji by tažení mapy kradlo posun stránky; mapa jde zvětšit tlačítky.
  const map = L.map(box, { scrollWheelZoom: false, dragging: !touch, tap: false, minZoom: 8, maxZoom: 19 });
  // Výřez na ulice kolem podniku; sousedy do ~800 m vezme do záběru, vzdálenější ne
  // (jinak by se mapa v menších městech oddálila na celý okres).
  const close = near.filter(([y, x]) => map.distance(here, [y, x]) <= 800).map(([y, x]) => [y, x]);
  if (close.length) map.fitBounds([here, ...close], { padding: [28, 28], maxZoom: 17 });
  else map.setView(here, 16);
  addBasemap(map);
  map.attributionControl.setPrefix(false);

  for (const [y, x, n, href] of near) {
    const m = L.marker([y, x], {
      icon: L.divIcon({ className: 'mm-pin-wrap', html: '<div class="mm-pin"></div>', iconSize: [14, 14] }),
      title: n,
      alt: n,
      keyboard: false,
    }).addTo(map);
    m.bindTooltip(n, { direction: 'top', offset: [0, -8] });
    m.on('click', () => (location.href = href));
  }
  L.marker(here, {
    icon: L.divIcon({ className: 'mm-pin-wrap', html: '<div class="mm-pin here"></div>', iconSize: [22, 22] }),
    title: box.dataset.n,
    keyboard: false,
    zIndexOffset: 1000,
  }).addTo(map);
}

if (box) {
  box.hidden = false; // bez JS by zůstal prázdný rámeček
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      show().catch(() => (box.hidden = true));
    },
    { rootMargin: '300px' },
  );
  io.observe(box);
}
