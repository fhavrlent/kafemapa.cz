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
    source: 'Odkud časy znáte?', srcSurvey: 'Z návštěvy nebo z cedule na dveřích', srcWebsite: 'Z webu nebo sociálních sítí kavárny',
    save: 'Uložit do OpenStreetMap', loginNote: 'Přihlásíte se účtem OpenStreetMap (je zdarma). Heslo zadáváte jen na openstreetmap.org, Kafemapa ho nevidí.',
    as: (n) => `Přihlášeno jako ${n}`, logout: 'odhlásit',
    saving: 'Ukládám do OpenStreetMap…', loggingIn: 'Čekám na přihlášení v okně OpenStreetMap…',
    saved: (u) => `<strong>Uloženo, díky!</strong> Na Kafemapě se změna objeví do druhého dne. <a href="${u}" target="_blank" rel="noopener">Vaše úprava v OpenStreetMap</a>`,
    same: 'Přesně tuhle otevírací dobu už OpenStreetMap má. Na Kafemapě se objeví do druhého dne.',
    newer: (w) => `OpenStreetMap už má novější otevírací dobu: ${w}. Na Kafemapě se objeví do druhého dne. Formulář jsme podle ní předvyplnili, ukládejte jen když je špatně.`,
    conflict: 'Kavárnu mezitím upravil někdo jiný. Načtěte stránku znovu a časy zkontrolujte.',
    gone: 'Tahle kavárna už v OpenStreetMap není. Pokud pořád funguje, nahlaste to formulářem níže.',
    failed: 'Uložení se nepovedlo. Zkuste to znovu, nebo použijte ruční postup níže.',
    popup: 'Prohlížeč zablokoval okno přihlášení. Povolte vyskakovací okna pro kafemapa.cz a zkuste to znovu.',
    cancelled: 'Přihlášení se nedokončilo, nic se neuložilo.',
    resumed: 'Přihlášeno. Zkontrolujte časy a klikněte na „Uložit do OpenStreetMap“.',
    once: 'Tuhle kavárnu jste už upravili. Další změnu prosím udělejte v editoru OpenStreetMap.',
    manual: 'Raději ručně v editoru OpenStreetMap',
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
    source: 'Where do you know the times from?', srcSurvey: 'From a visit or the sign on the door', srcWebsite: 'From the café\'s website or social media',
    save: 'Save to OpenStreetMap', loginNote: 'You sign in with an OpenStreetMap account (free). You enter your password only on openstreetmap.org; Kafemapa never sees it.',
    as: (n) => `Signed in as ${n}`, logout: 'sign out',
    saving: 'Saving to OpenStreetMap…', loggingIn: 'Waiting for you to sign in in the OpenStreetMap window…',
    saved: (u) => `<strong>Saved, thank you!</strong> The change shows up on Kafemapa by the next day. <a href="${u}" target="_blank" rel="noopener">Your edit on OpenStreetMap</a>`,
    same: 'OpenStreetMap already has exactly these opening hours. They will show up on Kafemapa by the next day.',
    newer: (w) => `OpenStreetMap already has newer opening hours: ${w}. They will show up on Kafemapa by the next day. We pre-filled the form with them; only save if they are wrong.`,
    conflict: 'Someone else edited this café in the meantime. Please reload the page and check the times.',
    gone: 'This café is no longer in OpenStreetMap. If it is still open, please report it with the form below.',
    failed: 'Saving failed. Please try again, or use the manual steps below.',
    popup: 'Your browser blocked the sign-in window. Allow pop-ups for kafemapa.cz and try again.',
    cancelled: 'Sign-in was not completed; nothing was saved.',
    resumed: 'Signed in. Check the times and click “Save to OpenStreetMap”.',
    once: 'You have already edited this café. Please make further changes in the OpenStreetMap editor.',
    manual: 'Prefer to do it manually in the OpenStreetMap editor',
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
 * @param {{ osmEditUrl: string, current?: string, cafe?: { i: string, n: string } }} opts
 *   current = stávající opening_hours; cafe = kavárna pro přímé uložení do OSM (bez ní jen ruční postup)
 */
export async function mountHoursEditor(container, { osmEditUrl, current, cafe }) {
  const osm = cafe ? await import('./osm.js') : null;
  const direct = osm?.OSM_SAVE;
  let days = initialDays(current ? parseHours(current) : null);
  const manualSteps = `<ol class="he-steps">
      <li><button type="button" class="btn" data-copy>${T.copy}</button></li>
      <li><a class="btn${direct ? '' : ' primary'}" href="${osmEditUrl}" target="_blank" rel="noopener">${T.openEditor}</a>
        <span class="small muted">${T.account}</span></li>
      <li>${T.step3}</li>
    </ol>`;
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
    <p class="he-newer" hidden></p>
    ${
      direct
        ? `<div class="he-save">
      <fieldset class="he-source"><legend>${T.source}</legend>
        <label><input type="radio" name="he-src" value="survey" checked> ${T.srcSurvey}</label>
        <label><input type="radio" name="he-src" value="website"> ${T.srcWebsite}</label>
      </fieldset>
      <button type="button" class="btn primary" data-save>${T.save}</button>
      <p class="small muted he-who">${T.loginNote}</p>
      <p class="he-msg" role="status" aria-live="polite"></p>
    </div>
    <details class="he-manual"><summary>${T.manual}</summary>${manualSteps}</details>`
        : manualSteps
    }
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
  if (direct) wireSave(container, { osm, cafe, current, value, err, days: () => days, setDays: (d) => ((days = d), sync()) });
}

const SAVED = (id) => `kafemapa:saved:${id}`;
const sameHours = (a, b) => {
  if (!a || !b) return a === b;
  const [x, y] = [parseHours(a), parseHours(b)];
  return a === b || (!!x && !!y && JSON.stringify(x) === JSON.stringify(y));
};

function wireSave(container, { osm, cafe, current, value, err, days, setDays }) {
  const btn = container.querySelector('[data-save]');
  const msg = container.querySelector('.he-msg');
  const who = container.querySelector('.he-who');
  const newer = container.querySelector('.he-newer');
  const showUser = async () => {
    if (!osm.isLoggedIn()) return;
    try {
      const name = await osm.userName();
      if (!name) return;
      who.innerHTML = `${T.as(name)} · <button type="button" class="link-btn" data-logout>${T.logout}</button>`;
      who.querySelector('[data-logout]').onclick = () => (osm.logout(), (who.textContent = T.loginNote));
    } catch {}
  };
  showUser();

  // Návrat z přihlášení přesměrováním: obnovit vyplněný formulář a vyzvat k uložení.
  const resume = osm.takeResume(cafe.i);
  if (resume) {
    const w = parseHours(resume.value);
    if (w) setDays(initialDays(w));
    const src = container.querySelector(`[name=he-src][value=${resume.source === 'website' ? 'website' : 'survey'}]`);
    if (src) src.checked = true;
    msg.textContent = osm.isLoggedIn() ? T.resumed : T.cancelled;
    setTimeout(() => btn.scrollIntoView({ block: 'center' }), 50);
  }

  // Jednou za návštěvu na kavárnu; další úpravy ať jdou přes editor OSM.
  try {
    if (sessionStorage.getItem(SAVED(cafe.i))) {
      btn.disabled = true;
      msg.textContent = T.once;
    }
  } catch {}

  // Co je v OSM právě teď: když už tam je novější hodnota než v našich (denních) datech,
  // řekneme to a formulář podle ní předvyplníme. Tím se nikdo nesnaží ukládat znovu a znovu.
  let live = current;
  osm.fetchElement(cafe.i).then(
    (el) => {
      live = el.tags?.opening_hours;
      if (!live || sameHours(live, current)) return;
      const week = parseHours(live);
      newer.textContent = T.newer(week ? formatWeek(week, LANG) : live);
      newer.hidden = false;
      setDays(initialDays(week));
    },
    () => {}
  );

  btn.addEventListener('click', async () => {
    if (!err.hidden) return err.scrollIntoView({ block: 'nearest' });
    btn.disabled = true;
    try {
      if (!osm.isLoggedIn()) {
        msg.textContent = T.loggingIn;
        await osm.login({ i: cafe.i, value: value.textContent, source: container.querySelector('[name=he-src]:checked')?.value });
        showUser();
      }
      // Stejné časy jinak zapsané (jiné pořadí dnů) nejsou změna: neposílat zbytečnou úpravu.
      if (live && sameHours(live, value.textContent)) {
        msg.textContent = T.same;
        btn.disabled = false;
        return;
      }
      msg.textContent = T.saving;
      const source = container.querySelector('[name=he-src]:checked')?.value;
      const res = await osm.saveTags(cafe, { opening_hours: value.textContent }, { what: LANG === 'en' ? 'Opening hours' : 'Otevírací doba', source });
      if (res.same) {
        msg.textContent = T.same;
        return;
      }
      osm.rememberPending(cafe.i, value.textContent, res.url);
      try {
        sessionStorage.setItem(SAVED(cafe.i), res.url);
      } catch {}
      msg.innerHTML = T.saved(res.url);
      container.querySelector('.he-source').hidden = true;
      btn.hidden = true;
    } catch (e) {
      btn.disabled = false;
      msg.textContent = { popup: T.popup, closed: T.cancelled, denied: T.cancelled }[e.code] || (e.status === 409 || e.status === 412 ? T.conflict : e.status === 410 || e.status === 404 ? T.gone : T.failed);
      if (!e.code) console.warn('Kafemapa → OSM:', e);
    }
  });
}
