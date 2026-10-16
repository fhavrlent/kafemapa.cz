// Pomocník pro zápis otevírací doby do OpenStreetMap: lidé vyplní časy po dnech,
// my z nich složíme hodnotu tagu opening_hours, ověříme ji vlastním parserem
// a pošleme je do editoru OSM. Sdílí ho mapa (app.js) i statické stránky (pages.js).

import { parseHours, formatWeek } from './hours.js';
import { LANG } from './i18n.js';

const OSM_DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const TXT = {
  cs: {
    days: ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'],
    intro: 'Vyplňte časy podle toho, co víte z návštěvy, cedule na dveřích nebo z webu kavárny. <strong>Nepřebírejte je z Google Map</strong>, licence OpenStreetMap to nedovoluje.',
    closed: 'zavřeno', opens: 'otevírá', closes: 'zavírá', copyMonday: 'Pondělí → celý všední týden',
    copy: 'Zkopírovat hodnotu', openEditor: 'Otevřít editor OpenStreetMap', account: '(potřebujete účet na openstreetmap.org, je zdarma)',
    step3: 'V editoru najděte pole <em>Otevírací doba</em>, vložte hodnotu a klikněte na <em>Uložit</em>. Do poznámky ke změně napište třeba „otevírací doba podle cedule“.',
    complex: 'Složitější otevírací dobu (přestávky, sezónní provoz) zapište přímo v editoru. Změna se na Kafemapě objeví do druhého dne.',
    missingTime: 'Doplňte u otevřených dnů čas otevření i zavření.', invalid: 'Tuhle kombinaci se nepodařilo ověřit, zkontrolujte časy.',
    preview: (w) => `Bude vypadat takto: ${w}`, copied: 'Zkopírováno ✓', selected: 'Označeno, zkopírujte Ctrl/Cmd+C',
  },
  en: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    intro: 'Fill in the times you know from a visit, the sign on the door or the café\'s own website. <strong>Do not copy them from Google Maps</strong> — the OpenStreetMap licence does not allow it.',
    closed: 'closed', opens: 'opens', closes: 'closes', copyMonday: 'Copy Monday to the whole working week',
    copy: 'Copy the value', openEditor: 'Open the OpenStreetMap editor', account: '(you need a free account on openstreetmap.org)',
    step3: 'In the editor, find the <em>Opening Hours</em> field, paste the value and click <em>Save</em>. In the change comment write e.g. “opening hours from the sign”.',
    complex: 'More complex hours (lunch breaks, seasonal opening) can be entered directly in the editor. The change shows up on Kafemapa by the next day.',
    missingTime: 'Please fill in both opening and closing time for open days.', invalid: 'This combination could not be verified, please check the times.',
    preview: (w) => `It will read: ${w}`, copied: 'Copied ✓', selected: 'Selected — copy with Ctrl/Cmd+C',
  },
};
const T = TXT[LANG];
const CZ_DAYS = T.days;
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
    <p class="he-intro">${T.intro}</p>
    <div class="he-days">
      ${CZ_DAYS.map(
        (d, i) => `<div class="he-day" data-i="${i}">
          <span class="he-name">${d}</span>
          <label class="he-closed"><input type="checkbox" data-k="closed"> ${T.closed}</label>
          <input type="time" step="900" data-k="from" aria-label="${d}: ${T.opens}">
          <span aria-hidden="true">–</span>
          <input type="time" step="900" data-k="to" aria-label="${d}: ${T.closes}">
        </div>`
      ).join('')}
    </div>
    <p class="he-quick"><button type="button" class="link-btn" data-copy-mo>${T.copyMonday}</button></p>
    <div class="he-out">
      <p class="he-preview" aria-live="polite"></p>
      <code class="he-value"></code>
      <p class="he-err" hidden></p>
    </div>
    <ol class="he-steps">
      <li><button type="button" class="btn" data-copy>${T.copy}</button></li>
      <li><a class="btn primary" href="${osmEditUrl}" target="_blank" rel="noopener">${T.openEditor}</a>
        <span class="small muted">${T.account}</span></li>
      <li>${T.step3}</li>
    </ol>
    <p class="small muted">${T.complex}</p>`;

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
    err.textContent = bad ? T.missingTime : T.invalid;
    preview.textContent = parsed && !bad ? T.preview(formatWeek(parsed, LANG)) : '';
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
      btn.textContent = T.copied;
    } catch {
      // Bez přístupu ke schránce aspoň označíme text k ručnímu zkopírování.
      const r = document.createRange();
      r.selectNodeContents(value);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      btn.textContent = T.selected;
    }
  });
  sync();
}
