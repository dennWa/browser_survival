import { kuerzelText, tastenKuerzel } from './befehle.js';
import { dialog, schliesse, esc } from './dialoge.js';

/**
 * Hilfe & Befehlspalette (Editor 2.0, Schritt 7.1) – beide lesen das Befehlsregister (ui/befehle.js).
 *   • `zeigeHilfe()` (? / F1): alle Befehle nach Gruppe, Suche (Name, Taste, Gruppe), je Zeile ⌨ = neue Taste belegen
 *     (nächster Tastendruck, Esc bricht ab; Konflikt → Hinweis „war bei X“, X verliert die Taste), ✕ = Taste entfernen,
 *     ↺ = Standard; unten „Alle zurücksetzen“. Gespeichert in localStorage `browserSurvival.editorKuerzel` (im Backup).
 *   • `zeigePalette()` (Strg+K): Suchfeld + flache Liste, Pfeil hoch/runter wählen, Enter/Klick = ausführen (nur verfügbare).
 */
export function hilfeUi({ befehle, zustand }) {
  /** Zeile eines Befehls (Hilfe) */
  const zeile = (b) => `<div class="hilfe-zeile${befehle.geaendert(b.id) ? ' geaendert' : ''}" data-id="${esc(b.id)}" data-text="${esc(`${b.name} ${b.kuerzel.join(' ')} ${b.gruppe}`.toLowerCase())}">
      <span class="tasten">${b.kuerzel.map((k) => `<kbd>${esc(kuerzelText(k))}</kbd>`).join(' ') || '<span class="leise">–</span>'}</span>
      <span class="name">${esc(b.symbol ?? '')} ${esc(b.name)}</span>
      <span class="aktionen"><button type="button" data-k="belegen" title="neue Taste belegen">⌨</button>${b.kuerzel.length ? '<button type="button" data-k="entfernen" title="Taste entfernen">✕</button>' : ''}${befehle.geaendert(b.id) ? '<button type="button" data-k="standard" title="Standard wiederherstellen">↺</button>' : ''}</span></div>`;

  function zeigeHilfe() {
    let suche = '';
    const knoten = document.createElement('div');
    knoten.className = 'hilfe';
    const zeichne = () => {
      const gruppen = new Map();
      for (const b of befehle.liste.values()) {
        if (!gruppen.has(b.gruppe)) gruppen.set(b.gruppe, []);
        gruppen.get(b.gruppe).push(b);
      }
      knoten.innerHTML = `<input type="search" class="hilfe-suche" placeholder="Befehl oder Taste suchen …" style="width:100%" value="${esc(suche)}">
        <p class="leise">⌨ = eigene Taste belegen (dann Taste drücken, Esc = abbrechen) · ✕ = Taste weg · ↺ = Standard. Gilt für diesen Browser (auch im Komplett-Backup).</p>
        <div class="hilfe-raster">${[...gruppen].map(([g, liste]) => `<section><h4>${esc(g)}</h4>${liste.map(zeile).join('')}</section>`).join('')}</div>
        <div class="knopfreihe"><button type="button" data-k="alle" ${Object.keys(befehle.eigene).length ? '' : 'disabled'}>↺ Alle Tasten zurücksetzen</button><span class="leise">Strg+K = Befehlspalette</span></div>
        <p class="leise">Maus: Rad = Zoom (Umschalt = seitwärts) · Trackpad: 2 Finger = schwenken, Pinch = Zoom · Rechts-Ziehen = schwenken · Rechtsklick = Kontextmenü · Alt+Klick = Pipette · Alt beim Ziehen = fein (0,1). Touch: Ansehen, Schwenken, Zoomen überall; Bauen ist für Maus & Tastatur gebaut.</p>`;
      const feld = knoten.querySelector('.hilfe-suche');
      const filtere = () => {
        const q = feld.value.trim().toLowerCase();
        suche = feld.value;
        knoten.querySelectorAll('.hilfe-zeile').forEach((z) => (z.hidden = !!q && !z.dataset.text.includes(q)));
        knoten.querySelectorAll('.hilfe-raster section').forEach((s) => (s.hidden = ![...s.querySelectorAll('.hilfe-zeile')].some((z) => !z.hidden)));
      };
      feld.addEventListener('input', filtere);
      filtere();
      knoten.querySelectorAll('.hilfe-zeile button[data-k]').forEach((k) => k.addEventListener('click', () => aktion(k.dataset.k, k.closest('.hilfe-zeile'))));
      knoten.querySelector('[data-k="alle"]').addEventListener('click', () => {
        befehle.zuruecksetzen();
        zustand.meldung('⌨ Alle Tasten auf Standard', 'ok');
        zeichne();
      });
    };
    const aktion = (was, el) => {
      const id = el.dataset.id;
      const b = befehle.get(id);
      if (was === 'entfernen') befehle.entferneKuerzel(id);
      else if (was === 'standard') befehle.zuruecksetzen(id);
      else if (was === 'belegen') {
        el.classList.add('wartet');
        el.querySelector('.tasten').innerHTML = '<kbd>Taste drücken …</kbd>';
        const fang = (e) => {
          const k = tastenKuerzel(e);
          if (!k) return; // reine Umschalt/Strg-Taste: weiter warten
          e.preventDefault();
          e.stopImmediatePropagation();
          window.removeEventListener('keydown', fang, true);
          if (k === 'Esc') return zeichne();
          const weg = befehle.belegeTaste(id, k);
          zustand.meldung(`⌨ ${kuerzelText(k)} → „${b.name}“${weg ? ` (war bei „${weg.name}“ – dort entfernt)` : ''}`, weg ? 'info' : 'ok');
          zeichne();
        };
        window.addEventListener('keydown', fang, true);
        return;
      }
      zeichne();
    };
    zeichne();
    dialog({ titel: '⌨ Tastenkürzel & Befehle', knoten, knoepfe: [{ text: 'Schließen', art: 'akzent', wert: null }], beiOeffnen: (b) => b.querySelector('.hilfe-suche')?.focus() });
  }

  function zeigePalette() {
    const knoten = document.createElement('div');
    knoten.className = 'palette';
    knoten.innerHTML = '<input type="search" class="palette-suche" placeholder="Befehl suchen … (Enter = ausführen)" aria-label="Befehl suchen"><ul class="palette-liste"></ul>';
    const feld = knoten.querySelector('input');
    const ul = knoten.querySelector('ul');
    let treffer = [];
    let nr = 0;
    const zeichne = () => {
      const woerter = feld.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      treffer = [...befehle.liste.values()].filter((b) => befehle.verfuegbar(b.id) && woerter.every((w) => `${b.name} ${b.gruppe} ${b.kuerzel.join(' ')}`.toLowerCase().includes(w))).slice(0, 40);
      nr = Math.min(nr, Math.max(0, treffer.length - 1));
      ul.innerHTML = treffer.map((b, i) => `<li class="${i === nr ? 'aktiv' : ''}" data-i="${i}"><span>${esc(b.symbol ?? '')} ${esc(b.name)} <span class="leise">${esc(b.gruppe)}</span></span>${b.kuerzel[0] ? `<kbd>${esc(kuerzelText(b.kuerzel[0]))}</kbd>` : ''}</li>`).join('') || '<li class="leise">nichts gefunden</li>';
      ul.querySelector('.aktiv')?.scrollIntoView({ block: 'nearest' });
    };
    const ausfuehren = (b) => {
      if (!b) return;
      schliesse(null);
      befehle.fuehreAus(b.id);
    };
    feld.addEventListener('input', () => {
      nr = 0;
      zeichne();
    });
    feld.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        nr = (nr + (e.key === 'ArrowDown' ? 1 : -1) + treffer.length) % Math.max(1, treffer.length);
        zeichne();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        ausfuehren(treffer[nr]);
      } else if (e.key === 'Escape') schliesse(null);
    });
    ul.addEventListener('click', (e) => ausfuehren(treffer[Number(e.target.closest('[data-i]')?.dataset.i)]));
    zeichne();
    dialog({ titel: '🔎 Befehlspalette', knoten, knoepfe: [], beiOeffnen: () => feld.focus() });
  }

  return { zeigeHilfe, zeigePalette };
}
