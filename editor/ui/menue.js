import { esc } from './dialoge.js';
import { kuerzelText } from './befehle.js';

/**
 * Menüleiste (Datei · Bearbeiten · …) und aufklappbare Listen (auch das Rechtsklick-Kontextmenü) – alles aus dem
 * Befehlsregister (ui/befehle.js). Einträge einer Liste:
 *   'befehl.id'                         Befehl aus dem Register (Name, Symbol, Kürzel, ✓ wenn aktiv, ausgegraut wenn nicht verfügbar)
 *   '-'                                 Trenner
 *   { ueberschrift: 'Export' }          Zwischenüberschrift
 *   { name, symbol?, ausfuehren, … }    freier Eintrag (z. B. Katalog-Einträge im Menü „Einfügen“)
 *   () => [...]                         Einträge erst beim Öffnen berechnen
 * Bedienung: Klick, Pfeiltasten hoch/runter, Enter, Esc; in der Menüleiste links/rechts zum Nachbarmenü.
 */
let offen = null; // { element, beiSchliessen }

export function schliesseListe() {
  if (!offen) return;
  const { element, beiSchliessen } = offen;
  offen = null;
  element.remove();
  beiSchliessen?.();
}

export function listeOffen() {
  return offen !== null;
}

/**
 * Liste an einer Stelle öffnen. ort = { x, y } (Bildschirm) oder { anker: Element } (darunter).
 * @returns das Listen-Element
 */
export function oeffneListe(ort, eintraege, befehle, { beiSchliessen = null, beiTaste = null } = {}) {
  schliesseListe();
  const liste = document.createElement('div');
  liste.className = 'menue-liste';
  liste.setAttribute('role', 'menu');
  const alle = (typeof eintraege === 'function' ? eintraege() : eintraege).flatMap((e) => (typeof e === 'function' ? e() : [e]));
  let letzterTrenner = true;
  for (const e of alle) {
    if (e === '-') {
      if (!letzterTrenner) liste.append(Object.assign(document.createElement('div'), { className: 'trenner' }));
      letzterTrenner = true;
      continue;
    }
    if (e?.ueberschrift) {
      liste.insertAdjacentHTML('beforeend', `<div class="ueberschrift">${esc(e.ueberschrift)}</div>`);
      letzterTrenner = false;
      continue;
    }
    const b = typeof e === 'string' ? befehle.get(e) : e;
    if (!b) continue;
    const verfuegbar = b.verfuegbar ? !!b.verfuegbar() : true;
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.setAttribute('role', 'menuitem');
    knopf.className = 'eintrag';
    if (b.id) knopf.dataset.befehl = b.id;
    knopf.disabled = !verfuegbar;
    knopf.title = b.hinweis ?? '';
    const kuerzel = b.kuerzel?.[0] ?? b.kuerzelText ?? '';
    knopf.innerHTML = `<span class="haken">${b.aktiv?.() ? '✓' : ''}</span><span class="symbol">${esc(b.symbol ?? '')}</span><span class="name">${esc(b.name)}</span><span class="kuerzel">${esc(kuerzel ? kuerzelText(kuerzel) : '')}</span>`;
    knopf.addEventListener('click', () => {
      schliesseListe();
      if (typeof e === 'string') befehle.fuehreAus(e);
      else b.ausfuehren?.();
    });
    liste.append(knopf);
    letzterTrenner = false;
  }
  if (liste.lastElementChild?.className === 'trenner') liste.lastElementChild.remove();
  document.body.append(liste);
  // Lage: unter dem Anker bzw. an der Maus, im Fenster halten
  const r = ort.anker?.getBoundingClientRect();
  const x = r ? r.left : ort.x;
  const y = r ? r.bottom + 2 : ort.y;
  const { innerWidth: b, innerHeight: h } = window;
  const lb = liste.offsetWidth;
  const lh = liste.offsetHeight;
  liste.style.left = `${Math.max(4, Math.min(x, b - lb - 4))}px`;
  liste.style.top = `${Math.max(4, y + lh > h - 4 ? Math.max(4, (r ? r.top : y) - lh - 2) : y)}px`;
  liste.addEventListener('keydown', (ev) => {
    const knoepfe = [...liste.querySelectorAll('button.eintrag:not(:disabled)')];
    const i = knoepfe.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = knoepfe.length;
      if (n) knoepfe[(i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      schliesseListe();
    } else beiTaste?.(ev);
  });
  offen = { element: liste, beiSchliessen };
  return liste;
}

// Außerhalb klicken, Fenster verlassen oder Größe ändern schließt
document.addEventListener('pointerdown', (e) => {
  if (offen && !offen.element.contains(e.target) && !e.target.closest?.('.menue-titel')) schliesseListe();
}, true);
window.addEventListener('blur', () => schliesseListe());
window.addEventListener('resize', () => schliesseListe());

/** Menüleiste: menues = [{ titel, eintraege }] */
export class Menueleiste {
  constructor(element, befehle, menues) {
    this.element = element;
    this.befehle = befehle;
    this.menues = menues;
    this.offenIndex = -1;
    element.setAttribute('role', 'menubar');
    element.innerHTML = '';
    this.knoepfe = menues.map((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menue-titel';
      b.textContent = m.titel;
      b.setAttribute('aria-haspopup', 'true');
      b.addEventListener('click', () => (this.offenIndex === i ? schliesseListe() : this.oeffne(i)));
      // Ist schon ein Menü offen, wechselt Überfahren das Menü (wie in Desktop-Programmen)
      b.addEventListener('pointerenter', () => this.offenIndex >= 0 && this.offenIndex !== i && this.oeffne(i));
      element.append(b);
      return b;
    });
    // Schmale Bildschirme: alle Menüs hinter einem ☰-Knopf (per CSS umgeschaltet)
    const alle = document.createElement('button');
    alle.type = 'button';
    alle.className = 'menue-alle';
    alle.textContent = '☰';
    alle.title = 'Menü';
    alle.addEventListener('click', () =>
      oeffneListe({ anker: alle }, () => menues.flatMap((m, i) => [...(i ? ['-'] : []), { ueberschrift: m.titel }, ...(typeof m.eintraege === 'function' ? m.eintraege() : m.eintraege)]), befehle),
    );
    element.prepend(alle);
  }

  oeffne(i, fokus = false) {
    const m = this.menues[i];
    this.offenIndex = i;
    this.knoepfe.forEach((b, j) => b.classList.toggle('aktiv', j === i));
    const liste = oeffneListe({ anker: this.knoepfe[i] }, m.eintraege, this.befehle, {
      beiSchliessen: () => {
        this.offenIndex = -1;
        this.knoepfe.forEach((b) => b.classList.remove('aktiv'));
      },
      beiTaste: (ev) => {
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
          ev.preventDefault();
          this.oeffne((i + (ev.key === 'ArrowRight' ? 1 : -1) + this.menues.length) % this.menues.length, true);
        }
      },
    });
    if (fokus) liste.querySelector('button.eintrag:not(:disabled)')?.focus();
  }
}
