// „Zavřeno nebo je tu chyba?“ — hlášení přes poznámky OpenStreetMap (OSM Notes).
// Poznámku lze založit i bez účtu; místní mapeři ji ověří a mapu upraví.
// Sami data neměníme: jedno kliknutí nemá smazat kavárnu, ověří to člověk.

import { LANG } from './i18n.js';

// Mimo produkci (localhost) posíláme na testovací server OSM, aby zkoušky nešly do skutečné mapy.
const LIVE = location.hostname === 'kafemapa.cz' || location.hostname === 'www.kafemapa.cz';
const API = LIVE ? 'https://api.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';
const WEB = LIVE ? 'https://www.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';

// Text poznámky je vždy česky (čtou ji místní mapeři), formulář je v jazyce stránky.
const KINDS = {
  closed: { text: (n) => `podnik „${n}“ je podle návštěvníka trvale zavřený` },
  moved: { text: (n) => `podnik „${n}“ se podle návštěvníka přestěhoval` },
  other: { text: (n) => `u podniku „${n}“ je podle návštěvníka chyba` },
};
const UI = {
  cs: {
    kinds: { closed: 'Trvale zavřeno', moved: 'Přestěhovalo se', other: 'Jiná chyba' },
    already: (u) => `Tohle místo už jste nahlásili. <a href="${u}" target="_blank" rel="noopener">Vaše poznámka v OSM</a> čeká, až ji někdo ověří. Díky!`,
    legend: 'Co je špatně?', detail: 'Upřesnění', detailHint: '(jak to víte, kam se přestěhovalo…)', placeholder: 'Např.: byl jsem tam 12. 10., prostory jsou prázdné',
    publicNote: 'Hlášení se uloží jako veřejná poznámka v OpenStreetMap (bez účtu, anonymně). Dobrovolníci ji ověří a upraví mapu. Nepište do ní osobní údaje.',
    submit: 'Odeslat hlášení', needDetail: 'Napište prosím pár slov, co je špatně nebo kam se podnik přestěhoval.', sending: 'Odesílám…',
    ok: (u) => `<strong>Díky, hlášení je odeslané.</strong> Vznikla <a href="${u}" target="_blank" rel="noopener">poznámka v OpenStreetMap</a>. Až ji někdo ověří a mapu upraví, změna se objeví i tady a v přehledu <a href="/nove/">Nově na mapě</a>.`,
    moderated: (u) => `V téhle oblasti OpenStreetMap vyžaduje přihlášení. <a href="${u}" target="_blank" rel="noopener">Založte poznámku přímo v OSM</a>.`,
    failed: (u) => `Odeslání se nepovedlo. Zkuste to znovu, nebo <a href="${u}" target="_blank" rel="noopener">založte poznámku přímo v OSM</a>.`,
  },
  en: {
    kinds: { closed: 'Permanently closed', moved: 'Moved elsewhere', other: 'Something else is wrong' },
    already: (u) => `You have already reported this place. <a href="${u}" target="_blank" rel="noopener">Your note on OSM</a> is waiting to be checked. Thank you!`,
    legend: 'What is wrong?', detail: 'Details', detailHint: '(how do you know, where did it move…)', placeholder: 'E.g. I was there on 12 Oct, the premises are empty',
    publicNote: 'Your report is saved as a public note on OpenStreetMap (anonymous, no account needed). Volunteers check it and fix the map. Please do not include personal data.',
    submit: 'Send report', needDetail: 'Please write a few words about what is wrong or where the place moved.', sending: 'Sending…',
    ok: (u) => `<strong>Thank you, your report was sent.</strong> It is now a <a href="${u}" target="_blank" rel="noopener">note on OpenStreetMap</a>. Once someone checks it and fixes the map, the change will show up here too.`,
    moderated: (u) => `OpenStreetMap requires login in this area. <a href="${u}" target="_blank" rel="noopener">Create the note directly on OSM</a>.`,
    failed: (u) => `Sending failed. Try again, or <a href="${u}" target="_blank" rel="noopener">create the note directly on OSM</a>.`,
  },
}[LANG];

const storageKey = (id) => `kafemapa:reported:${id}`;
const alreadyReported = (id) => {
  try {
    return localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
};

function noteText(cafe, kind, detail) {
  const type = { n: 'node', w: 'way', r: 'relation' }[cafe.i[0]];
  return [
    `Kafemapa: ${KINDS[kind].text(cafe.n)}.`,
    detail ? `Upřesnění: ${detail}` : null,
    `Objekt: https://www.openstreetmap.org/${type}/${cafe.i.slice(1)}`,
    '(Nahlášeno přes kafemapa.cz, ověřte prosím na místě nebo z webu podniku.)',
    '#kafemapa',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {HTMLElement} container
 * @param {{ i: string, n: string, y: number, x: number }} cafe
 */
export function mountReportForm(container, cafe) {
  container.classList.add('rf');
  const done = alreadyReported(cafe.i);
  if (done) {
    container.innerHTML = `<p>${UI.already(done)}</p>`;
    return;
  }
  container.innerHTML = `
    <form class="rf-form">
      <fieldset>
        <legend>${UI.legend}</legend>
        ${Object.entries(KINDS)
          .map(([k], i) => `<label><input type="radio" name="kind" value="${k}"${i === 0 ? ' checked' : ''}> ${UI.kinds[k]}</label>`)
          .join('')}
      </fieldset>
      <label class="rf-detail">${UI.detail} <span class="muted">${UI.detailHint}</span>
        <textarea name="detail" rows="2" maxlength="500" placeholder="${UI.placeholder}"></textarea>
      </label>
      <p class="small muted">${UI.publicNote}</p>
      <button type="submit" class="btn primary">${UI.submit}</button>
      <p class="rf-msg" role="status" aria-live="polite"></p>
    </form>`;

  const form = container.querySelector('form');
  const msg = container.querySelector('.rf-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.kind.value;
    const detail = form.detail.value.trim();
    if (kind !== 'closed' && !detail) {
      msg.textContent = UI.needDetail;
      form.detail.focus();
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    msg.textContent = UI.sending;
    try {
      const res = await fetch(`${API}/api/0.6/notes.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: cafe.y, lon: cafe.x, text: noteText(cafe, kind, detail) }),
      });
      if (res.status === 403) throw Object.assign(new Error('moderation'), { fallback: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const note = await res.json();
      const id = note?.properties?.id;
      const url = id ? `${WEB}/note/${id}` : `${WEB}/#map=19/${cafe.y}/${cafe.x}&layers=N`;
      try {
        localStorage.setItem(storageKey(cafe.i), url);
      } catch {}
      container.innerHTML = `<p class="rf-ok">${UI.ok(url)}</p>`;
    } catch (err) {
      button.disabled = false;
      const manual = `${WEB}/note/new#map=19/${cafe.y}/${cafe.x}`;
      msg.innerHTML = err.fallback ? UI.moderated(manual) : UI.failed(manual);
    }
  });
}
