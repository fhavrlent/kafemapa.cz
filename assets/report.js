// Kavárenský index: tooltip pro sloupce histogramu (myš i klávesnice).
// Hodnoty jsou zároveň v tabulce pod grafem, tooltip je jen pohodlnější cesta.
const tip = /** @type {HTMLElement} */ (document.querySelector('.tip'));

function show(col, x, y) {
  tip.textContent = col.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
  tip.style.left = `${left + scrollX}px`;
  tip.style.top = `${y + scrollY - r.height - 12}px`;
  col.classList.add('on');
}

function hide(col) {
  tip.hidden = true;
  col?.classList.remove('on');
}

for (const col of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.hist .col'))) {
  col.addEventListener('pointermove', (e) => show(col, e.clientX, e.clientY));
  col.addEventListener('pointerleave', () => hide(col));
  col.addEventListener('focus', () => {
    const r = (col.querySelector('path') || col.querySelector('rect.hit')).getBoundingClientRect();
    show(col, r.left + r.width / 2, r.top);
  });
  col.addEventListener('blur', () => hide(col));
}
