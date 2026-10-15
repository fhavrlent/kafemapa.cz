// Pomocník pro zápis otevírací doby do OpenStreetMap: lidé vyplní časy po dnech,
// my z nich složíme hodnotu tagu opening_hours, ověříme ji vlastním parserem
// a pošleme je do editoru OSM. Sdílí ho mapa (app.js) i statické stránky (pages.js).

import { parseHours, formatWeek } from './hours.js';

const OSM_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const CZ_DAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const pad = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Složí opening_hours ze dnů [{ closed, from: 'HH:MM', to: 'HH:MM' }] (Po=0).
 * Stejné po sobě jdoucí dny slučuje: „Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off“.
 */
export function buildOpeningHours(days) {
  const spec = days.map((d) => (d.closed ? 'off' : `${d.from}-${d.to === '00:00' ? '24:00' : d.to}`));
  const rules = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && spec[j + 1] === spec[i]) j++;
    const sel = i === j ? OSM_DAYS[i] : `${OSM_DAYS[i]}-${OSM_DAYS[j]}`;
    rules.push(`${sel} ${spec[i]}`);
    i = j + 1;
  }
  if (rules.length === 1) return spec[0] === 'off' ? 'off' : `Mo-Su ${spec[0]}`;
  return rules.join('; ');
}

// Výchozí hodnoty formuláře z existující otevírací doby (jen když jde o jeden interval denně).
function initialDays(week) {
  const simple = week && week.every((iv) => iv.length <= 1);
  return OSM_DAYS.map((_, i) => {
    const iv = simple ? week[i][0] : null;
    if (simple && !iv) return { closed: true, from: '08:00', to: '18:00' };
    if (iv) return { closed: false, from: pad(iv[0]), to: pad(iv[1] % 1440 === 0 && iv[1] ? 0 : iv[1]) };
    return { closed: i === 6, from: i >= 5 ? '09:00' : '08:00', to: i >= 5 ? '16:00' : '18:00' };
  });
}

/**
 * Vloží editor do `container`.
 * @param {{ osmEditUrl: string, current?: string }} opts current = stávající opening_hours
 */
export function mountHoursEditor(container, { osmEditUrl, current }) {
  const days = initialDays(current ? parseHours(current) : null);
  container.classList.add('he');
  container.innerHTML = `
    <p class="he-intro">Vyplňte časy podle toho, co víte z návštěvy, cedule na dveřích nebo z webu kavárny.
      <strong>Nepřebírejte je z Google Map</strong>, licence OpenStreetMap to nedovoluje.</p>
    <div class="he-days">
      ${CZ_DAYS.map(
        (d, i) => `<div class="he-day" data-i="${i}">
          <span class="he-name">${d}</span>
          <label class="he-closed"><input type="checkbox" data-k="closed"> zavřeno</label>
          <input type="time" step="900" data-k="from" aria-label="${d}: otevírá">
          <span aria-hidden="true">–</span>
          <input type="time" step="900" data-k="to" aria-label="${d}: zavírá">
        </div>`
      ).join('')}
    </div>
    <p class="he-quick"><button type="button" class="link-btn" data-copy-mo>Pondělí → celý všední týden</button></p>
    <div class="he-out">
      <p class="he-preview" aria-live="polite"></p>
      <code class="he-value"></code>
      <p class="he-err" hidden></p>
    </div>
    <ol class="he-steps">
      <li><button type="button" class="btn" data-copy>Zkopírovat hodnotu</button></li>
      <li><a class="btn primary" href="${osmEditUrl}" target="_blank" rel="noopener">Otevřít editor OpenStreetMap</a>
        <span class="small muted">(potřebujete účet na openstreetmap.org, je zdarma)</span></li>
      <li>V editoru najděte pole <em>Otevírací doba</em>, vložte hodnotu a klikněte na <em>Uložit</em>. Do poznámky ke změně napište třeba „otevírací doba podle cedule“.</li>
    </ol>
    <p class="small muted">Složitější otevírací dobu (přestávky, sezónní provoz) zapište přímo v editoru. Změna se na Kafemapě objeví při další týdenní aktualizaci.</p>`;

  const rows = [...container.querySelectorAll('.he-day')];
  const value = container.querySelector('.he-value');
  const preview = container.querySelector('.he-preview');
  const err = container.querySelector('.he-err');

  const sync = () => {
    rows.forEach((row, i) => {
      row.querySelector('[data-k=closed]').checked = days[i].closed;
      for (const k of ['from', 'to']) {
        const el = row.querySelector(`[data-k=${k}]`);
        el.value = days[i][k];
        el.disabled = days[i].closed;
      }
    });
    const oh = buildOpeningHours(days);
    value.textContent = oh;
    const parsed = parseHours(oh);
    const bad = days.find((d) => !d.closed && (!d.from || !d.to || d.from === d.to));
    err.hidden = !bad && !!parsed;
    err.textContent = bad ? 'Doplňte u otevřených dnů čas otevření i zavření.' : 'Tuhle kombinaci se nepodařilo ověřit, zkontrolujte časy.';
    preview.textContent = parsed && !bad ? `Bude vypadat takto: ${formatWeek(parsed)}` : '';
  };

  container.addEventListener('input', (e) => {
    const row = e.target.closest('.he-day');
    if (!row) return;
    const d = days[+row.dataset.i];
    const k = e.target.dataset.k;
    d[k] = k === 'closed' ? e.target.checked : e.target.value;
    sync();
  });
  container.querySelector('[data-copy-mo]').addEventListener('click', () => {
    for (let i = 1; i < 5; i++) days[i] = { ...days[0] };
    sync();
  });
  container.querySelector('[data-copy]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(value.textContent);
      btn.textContent = 'Zkopírováno ✓';
    } catch {
      // Bez přístupu ke schránce aspoň označíme text k ručnímu zkopírování.
      const r = document.createRange();
      r.selectNodeContents(value);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      btn.textContent = 'Označeno, zkopírujte Ctrl/Cmd+C';
    }
  });
  sync();
}
