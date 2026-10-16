// Formulář „Vybavení“: Wi‑Fi, zahrádka, veganské a vegetariánské možnosti, bezbariérovost
// a platba kartou, uložené přímo do OpenStreetMap (assets/osm.js). Výchozí stav je vždy
// aktuální stav objektu v OSM; „Nevím“ tag nechá beze změny, takže formulář nikdy nic nesmaže.
// Čtení hodnot odpovídá filtrům mapy (scripts/fetch-data.mjs), ať „Ano“ znamená totéž co na mapě.

import { LANG } from './i18n.js';

const YES = ['yes', 'only', 'limited'];
const CARD_KEYS = ['payment:cards', 'payment:credit_cards', 'payment:debit_cards', 'payment:contactless'];

/** Pole formuláře: read(tags) → 'yes' | 'no' | 'limited' | null (nevíme) ; write(volba, tags) → změny tagů */
const FIELDS = [
  {
    id: 'wifi',
    choices: ['yes', 'no'],
    read: (t) => (['wlan', 'yes', 'customers', 'wifi', 'free'].includes(t.internet_access) ? 'yes' : t.internet_access === 'no' ? 'no' : null),
    write: (v) => ({ internet_access: v === 'yes' ? 'wlan' : 'no' }),
  },
  {
    id: 'outdoor',
    choices: ['yes', 'no'],
    read: (t) => (!t.outdoor_seating ? null : t.outdoor_seating === 'no' ? 'no' : 'yes'),
    write: (v) => ({ outdoor_seating: v }),
  },
  {
    id: 'vegan',
    choices: ['yes', 'no'],
    read: (t) => (YES.includes(t['diet:vegan']) ? 'yes' : t['diet:vegan'] === 'no' ? 'no' : null),
    write: (v) => ({ 'diet:vegan': v }),
  },
  {
    id: 'vegetarian',
    choices: ['yes', 'no'],
    read: (t) => (YES.includes(t['diet:vegetarian']) ? 'yes' : t['diet:vegetarian'] === 'no' ? 'no' : null),
    write: (v) => ({ 'diet:vegetarian': v }),
  },
  {
    id: 'wheelchair',
    choices: ['yes', 'limited', 'no'],
    read: (t) => (['yes', 'limited', 'no'].includes(t.wheelchair) ? t.wheelchair : null),
    write: (v) => ({ wheelchair: v }),
  },
  {
    id: 'card',
    choices: ['yes', 'no'],
    read: (t) => (CARD_KEYS.some((k) => YES.includes(t[k])) ? 'yes' : t['payment:cards'] === 'no' ? 'no' : null),
    // „Ne“ musí přepsat i jemnější tagy (kreditní, debetní), jinak by mapa kartu ukazovala dál.
    write: (v, t) =>
      v === 'yes'
        ? { 'payment:cards': 'yes' }
        : Object.fromEntries([['payment:cards', 'no'], ...CARD_KEYS.slice(1).filter((k) => YES.includes(t[k])).map((k) => [k, 'no'])]),
  },
];

const TXT = {
  cs: {
    intro: 'Vyplňte, co víte z návštěvy nebo z webu kavárny. U čeho si nejste jistí, nechte „Nevím“, to se nemění.',
    labels: { wifi: 'Wi‑Fi pro hosty', outdoor: 'Zahrádka nebo venkovní posezení', vegan: 'Veganské jídlo nebo pití', vegetarian: 'Vegetariánské jídlo', wheelchair: 'Bezbariérový vstup', card: 'Platba kartou' },
    choice: { yes: 'Ano', limited: 'Částečně', no: 'Ne', unknown: 'Nevím' },
    loading: 'Načítám aktuální stav z OpenStreetMap…',
    loadFailed: 'Aktuální stav z OpenStreetMap se nepodařilo načíst. Zkuste to později, nebo upravte kavárnu přímo v editoru OSM.',
    gone: 'Tahle kavárna už v OpenStreetMap není. Pokud pořád funguje, nahlaste to formulářem níže.',
    nothing: 'Nic jste nezměnili. Vyberte u položky Ano nebo Ne.',
    what: 'Vybavení',
    saved: (u) => `<strong>Uloženo, díky!</strong> Na Kafemapě se změna objeví do druhého dne. <a href="${u}" target="_blank" rel="noopener">Vaše úprava v OpenStreetMap</a>`,
    once: 'Vybavení téhle kavárny jste už upravili. Další změnu prosím udělejte v editoru OpenStreetMap.',
    editor: 'Upravit v editoru OSM',
  },
  en: {
    intro: 'Fill in what you know from a visit or the café\'s website. Leave “Don\'t know” where you are not sure; that is not changed.',
    labels: { wifi: 'Wi‑Fi for guests', outdoor: 'Outdoor seating', vegan: 'Vegan food or drinks', vegetarian: 'Vegetarian food', wheelchair: 'Wheelchair accessible entrance', card: 'Card payments' },
    choice: { yes: 'Yes', limited: 'Partly', no: 'No', unknown: 'Don\'t know' },
    loading: 'Loading the current state from OpenStreetMap…',
    loadFailed: 'Could not load the current state from OpenStreetMap. Please try later, or edit the café in the OSM editor.',
    gone: 'This café is no longer in OpenStreetMap. If it is still open, please report it with the form below.',
    nothing: 'You have not changed anything. Choose Yes or No for an item.',
    what: 'Amenities',
    saved: (u) => `<strong>Saved, thank you!</strong> The change shows up on Kafemapa by the next day. <a href="${u}" target="_blank" rel="noopener">Your edit on OpenStreetMap</a>`,
    once: 'You have already edited the amenities of this café. Please make further changes in the OpenStreetMap editor.',
    editor: 'Edit in the OSM editor',
  },
};
const T = TXT[LANG];
// Společné texty přihlášení a ukládání (stejné jako u otevírací doby)
const S = {
  cs: {
    source: 'Odkud to víte?', srcSurvey: 'Z návštěvy', srcWebsite: 'Z webu nebo sociálních sítí kavárny',
    save: 'Uložit do OpenStreetMap', loginNote: 'Přihlásíte se účtem OpenStreetMap (je zdarma). Heslo zadáváte jen na openstreetmap.org, Kafemapa ho nevidí.',
    as: (n) => `Přihlášeno jako ${n}`, logout: 'odhlásit', saving: 'Ukládám do OpenStreetMap…', loggingIn: 'Čekám na přihlášení v okně OpenStreetMap…',
    resumed: 'Přihlášeno. Zkontrolujte odpovědi a klikněte na „Uložit do OpenStreetMap“.', cancelled: 'Přihlášení se nedokončilo, nic se neuložilo.',
    popup: 'Prohlížeč zablokoval okno přihlášení. Povolte vyskakovací okna pro kafemapa.cz a zkuste to znovu.',
    conflict: 'Kavárnu mezitím upravil někdo jiný. Načtěte stránku znovu a odpovědi zkontrolujte.', failed: 'Uložení se nepovedlo. Zkuste to prosím znovu.',
  },
  en: {
    source: 'How do you know?', srcSurvey: 'From a visit', srcWebsite: 'From the café\'s website or social media',
    save: 'Save to OpenStreetMap', loginNote: 'You sign in with an OpenStreetMap account (free). You enter your password only on openstreetmap.org; Kafemapa never sees it.',
    as: (n) => `Signed in as ${n}`, logout: 'sign out', saving: 'Saving to OpenStreetMap…', loggingIn: 'Waiting for you to sign in in the OpenStreetMap window…',
    resumed: 'Signed in. Check your answers and click “Save to OpenStreetMap”.', cancelled: 'Sign-in was not completed; nothing was saved.',
    popup: 'Your browser blocked the sign-in window. Allow pop-ups for kafemapa.cz and try again.',
    conflict: 'Someone else edited this café in the meantime. Please reload the page and check your answers.', failed: 'Saving failed. Please try again.',
  },
}[LANG];

const SAVED = (id) => `kafemapa:saved-amenities:${id}`;

/**
 * @param {HTMLElement} container
 * @param {{ cafe: { i: string, n: string }, osmEditUrl: string }} opts
 */
export async function mountAmenitiesEditor(container, { cafe, osmEditUrl }) {
  const osm = await import('./osm.js');
  container.classList.add('he', 'ae');
  if (!osm.OSM_SAVE) {
    container.innerHTML = `<p><a class="btn" href="${osmEditUrl}" target="_blank" rel="noopener">${T.editor}</a></p>`;
    return;
  }
  container.innerHTML = `<p class="he-msg" role="status">${T.loading}</p>`;

  let tags;
  try {
    tags = (await osm.fetchElement(cafe.i)).tags || {};
  } catch (e) {
    container.innerHTML = `<p class="he-msg">${e.status === 404 || e.status === 410 ? T.gone : T.loadFailed}</p><p><a class="btn" href="${osmEditUrl}" target="_blank" rel="noopener">${T.editor}</a></p>`;
    return;
  }
  const current = Object.fromEntries(FIELDS.map((f) => [f.id, f.read(tags)]));

  container.innerHTML = `
    <p class="he-intro">${T.intro}</p>
    <div class="ae-fields">
      ${FIELDS.map(
        (f) => `<fieldset class="ae-field" data-f="${f.id}"><legend>${T.labels[f.id]}</legend>
          ${[...f.choices, 'unknown']
            .map((c) => `<label><input type="radio" name="ae-${f.id}" value="${c}"${(current[f.id] ?? 'unknown') === c ? ' checked' : ''}> ${T.choice[c]}</label>`)
            .join('')}
        </fieldset>`
      ).join('')}
    </div>
    <div class="he-save">
      <fieldset class="he-source"><legend>${S.source}</legend>
        <label><input type="radio" name="ae-src" value="survey" checked> ${S.srcSurvey}</label>
        <label><input type="radio" name="ae-src" value="website"> ${S.srcWebsite}</label>
      </fieldset>
      <button type="button" class="btn primary" data-save>${S.save}</button>
      <p class="small muted he-who">${S.loginNote}</p>
      <p class="he-msg" role="status" aria-live="polite"></p>
    </div>`;

  const btn = /** @type {HTMLButtonElement} */ (container.querySelector('[data-save]'));
  const msg = /** @type {HTMLElement} */ (container.querySelector('.he-msg'));
  const who = /** @type {HTMLElement} */ (container.querySelector('.he-who'));
  /** @param {string} sel */
  const input = (sel) => /** @type {HTMLInputElement | null} */ (container.querySelector(sel));
  const pick = (id) => input(`[name=ae-${id}]:checked`)?.value;
  const set = (id, v) => {
    const el = input(`[name=ae-${id}][value="${v}"]`);
    if (el) el.checked = true;
  };

  const showUser = async () => {
    if (!osm.isLoggedIn()) return;
    try {
      const name = await osm.userName();
      if (!name) return;
      who.innerHTML = `${S.as(name)} · <button type="button" class="link-btn" data-logout>${S.logout}</button>`;
      /** @type {HTMLButtonElement} */ (who.querySelector('[data-logout]')).onclick = () => (osm.logout(), (who.textContent = S.loginNote));
    } catch {}
  };
  showUser();

  // Návrat z přihlášení přesměrováním: obnovit odpovědi.
  const resume = osm.takeResume(cafe.i, 'amenities');
  if (resume) {
    for (const [id, v] of Object.entries(resume.choices || {})) set(id, v);
    set('src', resume.source);
    msg.textContent = osm.isLoggedIn() ? S.resumed : S.cancelled;
    setTimeout(() => btn.scrollIntoView({ block: 'center' }), 50);
  }
  try {
    if (sessionStorage.getItem(SAVED(cafe.i))) {
      btn.disabled = true;
      msg.textContent = T.once;
    }
  } catch {}

  /** @param {Record<string, string>} base @returns {Record<string, string>} */
  const changes = (base) => {
    /** @type {Record<string, string>} */
    const out = {};
    for (const f of FIELDS) {
      const v = pick(f.id);
      if (!v || v === 'unknown' || v === f.read(base)) continue;
      Object.assign(out, f.write(v, base));
    }
    return out;
  };

  btn.addEventListener('click', async () => {
    if (!Object.keys(changes(tags)).length) return void (msg.textContent = T.nothing);
    btn.disabled = true;
    const source = /** @type {'survey' | 'website'} */ (input('[name=ae-src]:checked')?.value);
    try {
      if (!osm.isLoggedIn()) {
        msg.textContent = S.loggingIn;
        await osm.login({ i: cafe.i, kind: 'amenities', choices: Object.fromEntries(FIELDS.map((f) => [f.id, pick(f.id)])), source });
        showUser();
      }
      msg.textContent = S.saving;
      // Změny počítáme proti čerstvému stavu objektu (saveTags si ho načte znovu a ověří verzi).
      const fresh = (await osm.fetchElement(cafe.i)).tags || {};
      const delta = changes(fresh);
      if (!Object.keys(delta).length) {
        msg.textContent = T.nothing;
        btn.disabled = false;
        return;
      }
      const res = await osm.saveTags(cafe, delta, { what: T.what, source });
      if (res.same) {
        msg.textContent = T.nothing;
        btn.disabled = false;
        return;
      }
      osm.rememberPendingAmenities(cafe.i, res.url);
      try {
        sessionStorage.setItem(SAVED(cafe.i), res.url);
      } catch {}
      tags = { ...fresh, ...delta };
      msg.innerHTML = T.saved(res.url);
      /** @type {HTMLElement} */ (container.querySelector('.he-source')).hidden = true;
      btn.hidden = true;
    } catch (e) {
      btn.disabled = false;
      msg.textContent = { popup: S.popup, closed: S.cancelled, denied: S.cancelled }[e.code] || (e.status === 409 || e.status === 412 ? S.conflict : e.status === 410 || e.status === 404 ? T.gone : S.failed);
      if (!e.code) console.warn('Kafemapa → OSM:', e);
    }
  });
}
