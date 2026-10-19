import { esc } from './dialoge.js';

/**
 * Werkzeug-Optionsleiste über der Karte (Editor 2.0, Schritt 1.3): zeigt immer die Einstellungen des aktiven Werkzeugs –
 * Pinselgröße, Mal-Modus, Drehung, „Mehrfach setzen“, Farbe/Palette, Terrain-Stärke – plus einen kurzen Bedienhinweis.
 * Ersetzt die Werkzeug-Optionen, die früher oben im Eigenschaften-Panel standen. Neu gebaut bei 'werkzeug'/'eintrag'/'auswahl'.
 */
export const PALETTE = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#7f8c8d', '#2c3e50', '#ecf0f1', '#8b5a2b', '#d4a373', '#5d4037', '#3e6b35'];

const HINWEIS = {
  auswahl: 'Klick wählt · Umschalt = dazu · ins Leere ziehen = Bereich · Alt beim Ziehen = fein · Rechtsklick = Menü',
  hand: 'Ziehen schwenkt · Mausrad zoomt · auch: Leertaste halten, mittlere/rechte Maustaste, 2 Finger',
  pipette: 'Klick übernimmt Kachel/Objekt unter der Maus (auch Alt+Klick in jedem Malwerkzeug)',
  zone: 'Griffe an Ecken/Kanten ziehen – Verkleinern fragt vorher nach',
  bereich: 'Rechteck aufziehen',
  raumFuellen: 'In einen Raum klicken – füllt bis zu Wänden/Türen',
};

export class Optionsleiste {
  constructor({ element, zustand, aktionen, befehle }) {
    this.el = element;
    this.zustand = zustand;
    this.aktionen = aktionen;
    this.befehle = befehle;
    for (const ev of ['werkzeug', 'eintrag', 'auswahl', 'zone', 'ansicht']) zustand.bei(ev, () => this.zeichne());
  }

  zeichne() {
    const z = this.zustand;
    const w = z.werkzeug;
    const e = z.eintrag;
    const teile = [];
    const gruppe = (html) => teile.push(`<div class="opt-gruppe">${html}</div>`);
    const knopf = (wert, text, aktiv, titel = '') => `<button type="button" data-o="${esc(wert)}" class="${aktiv ? 'aktiv' : ''}" title="${esc(titel)}">${text}</button>`;
    const groesse = () => gruppe(`<span class="leise">Größe</span>${knopf('pinsel:-1', '−', false, 'kleiner ([)')}<input type="range" min="1" max="15" value="${z.pinselGroesse}" data-o="pinsel" aria-label="Pinselgröße"><b class="zahl">${z.pinselGroesse}</b>${knopf('pinsel:1', '+', false, 'größer (])')}`);
    if (z.ansicht === '3d') {
      gruppe('<b>🧊 3D-Ansicht</b>');
      gruppe('<span class="leise">Ziehen = schieben · Rechts/Alt-Ziehen = drehen · Rad/2 Finger = Zoom · Klick = wählen · Malen/Bauen in 2D (Taste 3)</span>');
    } else if (w === 'malen') {
      gruppe(`${e ? `<span class="farbe" style="background:${esc(e.farbe)}"></span><b>${esc(e.name)}</b>` : '<b>Malen</b>'}`);
      gruppe(['pinsel', 'rechteck', 'linie', 'fuellen'].map((m) => knopf(`malen:${m}`, { pinsel: '🖌 Pinsel', rechteck: '▭ Rechteck', linie: '╱ Linie', fuellen: '🪣 Füllen' }[m], z.malModus === m, { pinsel: 'B', rechteck: 'U (Umschalt: nur Rand)', linie: 'L (Mauern rasten ein, Umschalt: frei)', fuellen: 'G' }[m])).join(''));
      if (z.malModus !== 'fuellen') groesse();
      if (z.malModus === 'rechteck') gruppe(`<label><input type="checkbox" data-o="nurRand" ${z.nurRand ? 'checked' : ''}> nur Rand</label>`);
    } else if (w === 'radierer') {
      gruppe('<b>⌫ Radierer</b>');
      groesse();
      gruppe('<span class="leise">Kacheln → Rasen, Objekte/Marker/Bauwerke weg (gesperrte Ebenen bleiben)</span>');
    } else if (w === 'platzieren' && e) {
      gruppe(`<span class="symbol">${esc(e.symbol ?? '')}</span><b>${esc(e.name)}</b>${e.b ? `<span class="leise">${e.b} × ${e.h}</span>` : ''}`);
      if (e.art === 'objekt' || e.art === 'bauwerk') gruppe(`<span class="leise">Drehung</span>${[0, 90, 180, 270].map((d) => knopf(`drehung:${d}`, `${d}°`, z.drehung === d, 'R dreht weiter')).join('')}`);
      gruppe(`<label title="sonst: Umschalt halten"><input type="checkbox" data-o="mehrfach" ${z.mehrfach ? 'checked' : ''}> mehrfach setzen</label>`);
      gruppe('<span class="leise">Klick setzt · R/Rechtsklick dreht · Esc beendet</span>');
    } else if (w === 'einfuegen' && z.einfuegeVorlage) {
      const v = z.einfuegeVorlage;
      gruppe(`<b>📋 ${esc(v.name ?? 'Einfügen')}</b><span class="leise">${v.b} × ${v.h}</span>`);
      gruppe(`${knopf('drehen', '⟳ 90°', false, 'R')}<label><input type="checkbox" data-o="mehrfach" ${z.mehrfach ? 'checked' : ''}> mehrfach</label>`);
      gruppe('<span class="leise">Klick setzt (stempelt den Bereich) · Esc bricht ab</span>');
    } else if (w === 'terrain') {
      const art = e?.werkzeug ?? 'terrainHeben';
      gruppe(['terrainHeben', 'terrainSenken', 'terrainGlaetten', 'terrainEbnen'].map((m) => knopf(`terrain:${m}`, { terrainHeben: '⛰ Heben', terrainSenken: '🕳 Senken', terrainGlaetten: '〰 Glätten', terrainEbnen: '▬ Ebnen' }[m], art === m)).join(''));
      gruppe(`<span class="leise">Stärke</span><input type="range" min="0.1" max="3" step="0.1" value="${z.terrainStaerke}" data-o="staerke" aria-label="Stärke"><b class="zahl">${z.terrainStaerke.toFixed(1)} m</b>`);
      groesse();
      gruppe('<span class="leise">Umschalt kehrt Heben/Senken um</span>');
    } else if (w === 'farbe') {
      const art = e?.werkzeug ?? 'farbePinsel';
      gruppe(['farbePinsel', 'farbeFuellen', 'farbeEntfernen'].map((m) => knopf(`farbe:${m}`, { farbePinsel: '🖌 Malen', farbeFuellen: '🪣 Füllen', farbeEntfernen: '🧽 Entfernen' }[m], art === m)).join(''));
      gruppe(`${PALETTE.map((f) => `<button type="button" class="farbknopf${f === z.farbe ? ' aktiv' : ''}" data-o="farbwahl:${f}" title="${f}" style="background:${f}"></button>`).join('')}<input type="color" value="${esc(z.farbe)}" data-o="farbe" title="eigene Farbe">`);
      if (art !== 'farbeFuellen') groesse();
    } else {
      const titel = { auswahl: '⬚ Auswahl', hand: '✋ Schwenken', pipette: '💧 Pipette', zone: '⤡ Zonengröße', bereich: `▭ ${e?.name ?? 'Bereich'}`, raumFuellen: '🪣 Raum füllen' }[w] ?? w;
      gruppe(`<b>${esc(titel)}</b>`);
      if (w === 'auswahl' && (z.auswahl.size || z.auswahlRechteck)) {
        const ids = z.auswahl.size ? ['bearbeiten.duplizieren', 'bearbeiten.drehen', 'bearbeiten.kopieren', 'bearbeiten.loeschen'] : ['bearbeiten.kopieren', 'bearbeiten.ausschneiden', 'bearbeiten.bereichLeeren', 'bearbeiten.alsPrefab', 'ki.ausschnitt'];
        gruppe(ids.map((id) => {
          const b = this.befehle.get(id);
          return b ? `<button type="button" data-befehl="${id}" title="${esc(b.name)}${b.kuerzel[0] ? ` (${esc(b.kuerzel[0])})` : ''}">${esc(b.symbol ?? '')} ${esc(b.kurz ?? b.name)}</button>` : '';
        }).join(''));
      }
      if (w === 'zone') gruppe(`<button type="button" data-befehl="zone.groesse">Größe eingeben…</button>`);
      if (HINWEIS[w]) gruppe(`<span class="leise">${esc(HINWEIS[w])}</span>`);
    }
    this.el.innerHTML = teile.join('');
    this.#binde();
  }

  #binde() {
    const z = this.zustand;
    this.el.querySelectorAll('[data-befehl]').forEach((b) => b.addEventListener('click', () => this.befehle.fuehreAus(b.dataset.befehl)));
    this.el.querySelectorAll('button[data-o]').forEach((b) =>
      b.addEventListener('click', () => {
        const [art, wert] = b.dataset.o.split(/:(.*)/s);
        if (art === 'pinsel') this.aktionen.pinselGroesse(Number(wert));
        else if (art === 'malen') this.aktionen.werkzeug(`malen:${wert}`);
        else if (art === 'drehung') {
          z.drehung = Number(wert);
          z.melde('werkzeug');
        } else if (art === 'drehen') this.aktionen.drehen();
        else if (art === 'terrain' || art === 'farbe') this.aktionen.waehleKatalog(`werkzeug:${{ terrainHeben: 'terrain-heben', terrainSenken: 'terrain-senken', terrainGlaetten: 'terrain-glaetten', terrainEbnen: 'terrain-ebnen', farbePinsel: 'farbe-pinsel', farbeFuellen: 'farbe-fuellen', farbeEntfernen: 'farbe-entfernen' }[wert]}`);
        else if (art === 'farbwahl') {
          z.farbe = wert;
          this.zeichne();
        }
      }),
    );
    this.el.querySelectorAll('input[data-o]').forEach((i) =>
      i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => {
        const art = i.dataset.o;
        if (art === 'pinsel') {
          z.pinselGroesse = Number(i.value);
          this.el.querySelector('input[data-o="pinsel"] + .zahl').textContent = i.value;
        } else if (art === 'staerke') {
          z.terrainStaerke = Number(i.value);
          i.nextElementSibling.textContent = `${Number(i.value).toFixed(1)} m`;
        } else if (art === 'farbe') z.farbe = i.value;
        else if (art === 'mehrfach') z.mehrfach = i.checked;
        else if (art === 'nurRand') z.nurRand = i.checked;
      }),
    );
    // Eingaben in der Leiste lösen keine Werkzeug-Kürzel aus
    this.el.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));
  }
}
