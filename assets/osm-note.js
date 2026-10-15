// „Zavřeno nebo je tu chyba?“ — hlášení přes poznámky OpenStreetMap (OSM Notes).
// Poznámku lze založit i bez účtu; místní mapeři ji ověří a mapu upraví.
// Sami data neměníme: jedno kliknutí nemá smazat kavárnu, ověří to člověk.

// Mimo produkci (localhost) posíláme na testovací server OSM, aby zkoušky nešly do skutečné mapy.
const LIVE = location.hostname === 'kafemapa.cz' || location.hostname === 'www.kafemapa.cz';
const API = LIVE ? 'https://api.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';
const WEB = LIVE ? 'https://www.openstreetmap.org' : 'https://master.apis.dev.openstreetmap.org';

const KINDS = {
  closed: { label: 'Trvale zavřeno', text: (n) => `podnik „${n}“ je podle návštěvníka trvale zavřený` },
  moved: { label: 'Přestěhovalo se', text: (n) => `podnik „${n}“ se podle návštěvníka přestěhoval` },
  other: { label: 'Jiná chyba', text: (n) => `u podniku „${n}“ je podle návštěvníka chyba` },
};

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
    container.innerHTML = `<p>Tohle místo už jste nahlásili. <a href="${done}" target="_blank" rel="noopener">Vaše poznámka v OSM</a> čeká, až ji někdo ověří. Díky!</p>`;
    return;
  }
  container.innerHTML = `
    <form class="rf-form">
      <fieldset>
        <legend>Co je špatně?</legend>
        ${Object.entries(KINDS)
          .map(([k, v], i) => `<label><input type="radio" name="kind" value="${k}"${i === 0 ? ' checked' : ''}> ${v.label}</label>`)
          .join('')}
      </fieldset>
      <label class="rf-detail">Upřesnění <span class="muted">(jak to víte, kam se přestěhovalo…)</span>
        <textarea name="detail" rows="2" maxlength="500" placeholder="Např.: byl jsem tam 12. 10., prostory jsou prázdné"></textarea>
      </label>
      <p class="small muted">Hlášení se uloží jako veřejná poznámka v OpenStreetMap (bez účtu, anonymně). Dobrovolníci ji ověří a upraví mapu. Nepište do ní osobní údaje.</p>
      <button type="submit" class="btn primary">Odeslat hlášení</button>
      <p class="rf-msg" role="status" aria-live="polite"></p>
    </form>`;

  const form = container.querySelector('form');
  const msg = container.querySelector('.rf-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = form.kind.value;
    const detail = form.detail.value.trim();
    if (kind !== 'closed' && !detail) {
      msg.textContent = 'Napište prosím pár slov, co je špatně nebo kam se podnik přestěhoval.';
      form.detail.focus();
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    msg.textContent = 'Odesílám…';
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
      container.innerHTML = `<p class="rf-ok"><strong>Díky, hlášení je odeslané.</strong> Vznikla <a href="${url}" target="_blank" rel="noopener">poznámka v OpenStreetMap</a>. Až ji někdo ověří a mapu upraví, změna se objeví i tady a v přehledu <a href="/nove/">Nově na mapě</a>.</p>`;
    } catch (err) {
      button.disabled = false;
      const manual = `${WEB}/note/new#map=19/${cafe.y}/${cafe.x}`;
      msg.innerHTML = err.fallback
        ? `V téhle oblasti OpenStreetMap vyžaduje přihlášení. <a href="${manual}" target="_blank" rel="noopener">Založte poznámku přímo v OSM</a>.`
        : `Odeslání se nepovedlo. Zkuste to znovu, nebo <a href="${manual}" target="_blank" rel="noopener">založte poznámku přímo v OSM</a>.`;
    }
  });
}
