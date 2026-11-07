import { objektInfo } from '../../editor/kern/katalog.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { eingebauteVorlagen } from '../../editor/kern/lootVorlagen.js';
import { WIEDERGABEN, BUSSE } from '../../gemeinsam/audio/klanglandschaft.js';
import { ausSchluessel, markerSchluessel } from '../../editor/kern/karte.js';
import * as A from '../kern/aktionen.js';
import { ITEM_LISTE } from '../ansicht/werkzeuge.js';
import { eintragName } from './panels.js';
import { ZOMBIE_VARIANTEN_NAMEN } from '../../server/spiel/karten/zombieBereiche.js';
import { icon } from './icons.js';
import { esc } from './dialoge.js';

/**
 * Eigenschaften-Panel (rechts): zeigt die Auswahl (oder die Zone, wenn nichts gewählt ist) und ändert sie über
 * Dokument.aendere – jede bestätigte Eingabe (change) = ein Undo-Schritt.
 */
const LOOT_LISTE = Object.keys(LOOT_TABELLEN).filter((t) => t !== 'zombie' && t !== 'boss').sort();
const TITEL = { objekte: ['Objekt', 'objekt'], spawnpunkte: ['Item-Spawnpunkt', 'spawn'], marker: ['Punkt', 'marker'], lootZonen: ['Loot-Zone', 'flaeche'], raumFlaechen: ['Raum', 'raum'], uebergaenge: ['Übergang', 'tuer'], ankuenfte: ['Ankunftspunkt', 'marker'], klaenge: ['Klang', 'klang'], tierBereiche: ['Tier-Bereich', 'hase'], bauwerke: ['Bauwerk', 'wand'], notizen: ['Notiz', 'notiz'], zombieBereiche: ['Zombie-Bereich', 'zombie'] };

export class Inspektor {
  constructor(studio) {
    this.studio = studio;
    this.el = document.getElementById('inspektor');
    this.el.addEventListener('change', (e) => this.#aenderung(e));
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-aktion]');
      if (b) this.#aktion(b.dataset.aktion, b);
    });
  }

  get dok() {
    return this.studio.dok;
  }

  zeichne() {
    const k = this.dok.karte;
    if (!k) {
      this.el.innerHTML = '<div class="insp-leer">Öffne eine Zone, um ihre Eigenschaften zu sehen.</div>';
      return;
    }
    const g = this.dok.gewaehlt();
    if (!g.length) return this.#zone(k);
    if (g.length > 1) return this.#mehrere(g);
    const { s, k: schl, wert: w } = g[0];
    const [titel, ic] = TITEL[s] ?? [s, 'info'];
    const kopf = `<div class="insp-kopf"><div class="insp-symbol">${icon(ic, 20)}</div><div><div class="insp-titel">${esc(eintragName(k, s, schl, w))}</div><div class="insp-unter">${titel}${typeof schl === 'number' ? ` · ID ${schl}` : ''}</div></div></div>`;
    this.el.innerHTML = kopf + this.#felder(s, schl, w, k) + this.#knoepfe(s);
  }

  // ---------- Bausteine ----------
  #zahl(feld, wert, { min = '', max = '', schritt = 'any', titel, regler = false } = {}) {
    const z = `<input class="feld zahl" type="number" data-feld="${feld}" value="${esc(wert ?? '')}" min="${min}" max="${max}" step="${schritt}" />`;
    const r = regler ? `<input type="range" data-feld="${feld}" value="${esc(wert ?? 0)}" min="${min}" max="${max}" step="${schritt}" />` : '';
    return `<div class="insp-zeile"><span>${titel}</span><div>${r}${z}</div></div>`;
  }

  #text(feld, wert, titel, platzhalter = '') {
    return `<div class="insp-zeile"><span>${titel}</span><div><input class="feld" data-feld="${feld}" value="${esc(wert ?? '')}" placeholder="${esc(platzhalter)}" /></div></div>`;
  }

  #auswahl(feld, wert, werte, titel) {
    return `<div class="insp-zeile"><span>${titel}</span><div><select class="feld" data-feld="${feld}">${werte.map(([w, t]) => `<option value="${esc(w)}" ${String(w) === String(wert ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div>`;
  }

  #schalter(feld, wert, titel, text) {
    return `<div class="insp-zeile"><span>${titel}</span><div><label class="schalter"><input type="checkbox" data-feld="${feld}" ${wert ? 'checked' : ''} />${esc(text ?? '')}</label></div></div>`;
  }

  #abschnitt(titel, inhalt) {
    return `<div class="insp-abschnitt"><div class="insp-abschnitt-titel">${titel}</div>${inhalt}</div>`;
  }

  #lage(w) {
    return `<div class="insp-zeile"><span>Position</span><div class="insp-xyz"><label>X<input class="feld zahl" type="number" step="0.1" data-feld="x" value="${w.x}" /></label><label>Y<input class="feld zahl" type="number" step="0.1" data-feld="y" value="${w.y}" /></label></div></div>`;
  }

  #rechteck(w) {
    return `${this.#lage(w)}<div class="insp-zeile"><span>Größe</span><div class="insp-xyz"><label>B<input class="feld zahl" type="number" min="1" step="1" data-feld="b" value="${w.b}" /></label><label>H<input class="feld zahl" type="number" min="1" step="1" data-feld="h" value="${w.h}" /></label></div></div>`;
  }

  #felder(s, k, w, karte) {
    const zonen = this.studio.zonenIds().map((z) => [z, z]);
    const klaenge = [['', '— keine —'], ...this.studio.klangDateien().map((d) => [d.pfad, d.pfad])];
    switch (s) {
      case 'objekte': {
        const info = objektInfo(w.typ, karte);
        let html = this.#abschnitt('Transform', this.#lage(w) + this.#zahl('drehung', w.drehung ?? 0, { min: -180, max: 360, schritt: 15, titel: 'Drehung °' }) + this.#zahl('skalierung', w.skalierung ?? 1, { min: 0.25, max: 4, schritt: 0.05, titel: 'Größe ×', regler: true }) + `<div class="insp-zeile"><span>Grundfläche</span><div style="color:var(--text-3)">${w.b} × ${w.h} Kacheln</div></div>`);
        html += this.#abschnitt('Eigenschaften', this.#text('name', w.name, 'Name', info?.name ?? w.typ) + this.#schalter('blockiert', w.blockiert, 'Kollision', 'blockiert Spieler & Zombies') + (w.ebene !== 'licht' ? `<div class="insp-zeile"><span>Farbe</span><div><input type="color" data-feld="farbe" value="${esc(w.farbe ?? info?.farbe ?? '#8b6b4a')}" /> <button class="knopf flach" data-aktion="farbeWeg">Standard</button></div></div>` : ''));
        if (w.typ === 'licht') html += this.#abschnitt('Licht', this.#zahl('radius', w.radius ?? 4, { min: 1, max: 20, schritt: 0.5, titel: 'Radius' }) + this.#zahl('staerke', w.staerke ?? 0.85, { min: 0, max: 1, schritt: 0.05, titel: 'Stärke', regler: true }) + `<div class="insp-zeile"><span>Lichtfarbe</span><div><input type="color" data-feld="farbe" value="${esc(w.farbe ?? '#ffd9a0')}" /></div></div>` + this.#schalter('flackern', w.flackern, 'Flackern', 'flackert') + this.#schalter('mast', w.mast, 'Mast', 'als Straßenlaterne'));
        html += this.#abschnitt('Klang am Objekt', this.#auswahl('klang.datei', w.klang?.datei ?? '', klaenge, 'Datei') + (w.klang ? this.#zahl('klang.lautstaerke', w.klang.lautstaerke ?? 1, { min: 0, max: 2, schritt: 0.05, titel: 'Lautstärke', regler: true }) + this.#zahl('klang.aussen', w.klang.aussen ?? 10, { min: 1, max: 120, schritt: 1, titel: 'Hörweite' }) : ''));
        return html;
      }
      case 'spawnpunkte':
        return this.#abschnitt('Inhalt', this.#auswahl('inhalt', w.inhalt, [...ITEM_LISTE.map((i) => [i.id, i.name]), ...LOOT_LISTE.map((t) => [`tabelle:${t}`, `Tabelle: ${t}`])], 'Item') + (w.inhalt.startsWith('tabelle:') ? '' : `<div class="insp-zeile"><span>Menge</span><div class="insp-xyz"><label>von<input class="feld zahl" type="number" min="1" data-feld="menge.0" value="${w.menge?.[0] ?? ''}" placeholder="std" /></label><label>bis<input class="feld zahl" type="number" min="1" data-feld="menge.1" value="${w.menge?.[1] ?? ''}" placeholder="std" /></label></div></div>`))
          + this.#abschnitt('Spawn', this.#zahl('chance', w.chance, { min: 0, max: 100, schritt: 1, titel: 'Chance %', regler: true }) + this.#zahl('intervall', w.intervall, { min: 0.5, max: 1440, schritt: 0.5, titel: 'alle (Minuten)' }) + `<div class="hinweis-kasten">Alle ${w.intervall} Minuten (Echtzeit) wird gewürfelt, solange der Punkt leer ist: ${w.chance} % Chance, dass dann ein Item liegt.</div>`)
          + this.#abschnitt('Lage', this.#lage(w) + this.#zahl('hoehe', w.hoehe ?? 0, { min: 0, max: 5, schritt: 0.05, titel: 'Ablagehöhe m' }) + this.#text('name', w.name, 'Name'));
      case 'marker': {
        const [x, y] = ausSchluessel(k);
        let html = `<div class="insp-zeile"><span>Kachel</span><div class="insp-xyz"><label>X<input class="feld zahl" type="number" step="1" data-feld="mx" value="${x}" /></label><label>Y<input class="feld zahl" type="number" step="1" data-feld="my" value="${y}" /></label></div></div>`;
        if (w.art === 'zombie') html += this.#zahl('anzahl', w.anzahl ?? 1, { min: 1, max: 20, schritt: 1, titel: 'Anzahl' }) + this.#zahl('respawnZeit', w.respawnZeit ?? '', { min: 0, max: 3600, schritt: 10, titel: 'Respawn s' }) + this.#schalter('horde', w.horde, 'Horde', 'nur nachts');
        if (w.art === 'loot') html += this.#auswahl('raum', w.raum, [...karte.s('raeume')].map(([b, r]) => [b, `${b} – ${r.name}`]), 'Raum');
        return this.#abschnitt(w.art === 'start' ? 'Spieler-Start' : w.art === 'loot' ? 'Loot-Punkt' : 'Zombie-Spawn', html);
      }
      case 'lootZonen':
        return this.#abschnitt('Bereich', this.#text('name', w.name, 'Name') + this.#rechteck(w))
          + this.#abschnitt('Loot', this.#auswahl('_tabelle', '', [['', '— Inhalt aus Tabelle übernehmen —'], ...LOOT_LISTE.map((t) => [t, t])], 'Tabelle') + `<div class="insp-zeile"><span>Inhalt</span><div style="color:var(--text-3)">${w.eintraege?.length ?? 0} Items (${w.modus})</div></div>` + this.#zahl('punkte', w.punkte, { min: 1, max: 200, schritt: 1, titel: 'Loot-Punkte' }) + this.#auswahl('ort', w.ort ?? 'alle', [['alle', 'überall'], ['innen', 'nur innen'], ['aussen', 'nur außen']], 'Ort') + this.#zahl('respawnZeit', w.respawnZeit ?? '', { min: 0, max: 7200, schritt: 30, titel: 'Respawn s' }) + this.#zahl('max', w.max ?? '', { min: 0, max: 200, schritt: 1, titel: 'max. gleichzeitig' }));
      case 'raumFlaechen': {
        const r = karte.s('raeume').get(w.raum) ?? {};
        // Phase 4.12: Raum umbauen (Wandart, Boden, Fenster, Tür) – kern/aktionen.raumUmbauOps
        const umbau = `<div class="insp-zeile"><span>Wände</span><div><select class="feld" data-umbau="wand"><option value="">— Wandart wählen —</option>${[['ziegel', 'Ziegel'], ['holz', 'Holz'], ['putz', 'Putz (weiß)'], ['beton', 'Beton'], ['quader', 'Quaderstein'], ['blech', 'Wellblech']].map(([a, t]) => `<option value="${a}">${t}</option>`).join('')}</select></div></div>
          <div class="insp-zeile"><span>Boden</span><div><select class="feld" data-umbau="boden"><option value="">— Boden wählen —</option>${[['.', 'Fliesen'], [':', 'Beton'], ['+', 'Holz']].map(([z, t]) => `<option value="${z}">${t}</option>`).join('')}</select></div></div>
          <div class="insp-zeile"><span>Fenster</span><div class="insp-knoepfe">${['n', 'o', 's', 'w'].map((x) => `<button class="knopf flach" data-aktion="raumFenster" data-seite="${x}">${{ n: 'Nord', o: 'Ost', s: 'Süd', w: 'West' }[x]}</button>`).join('')}</div></div>
          <div class="insp-zeile"><span>Tür</span><div class="insp-knoepfe">${['n', 'o', 's', 'w'].map((x) => `<button class="knopf flach" data-aktion="raumTuer" data-seite="${x}">${{ n: 'Nord', o: 'Ost', s: 'Süd', w: 'West' }[x]}</button>`).join('')}</div></div>`;
        return this.#abschnitt('Raum', this.#text('raum.name', r.name, 'Name') + this.#auswahl('raum.lootTabelle', r.lootTabelle, LOOT_LISTE.map((t) => [t, t]), 'Loot-Tabelle') + this.#zahl('raum.spawnChance', r.spawnChance ?? '', { min: 0, max: 1, schritt: 0.05, titel: 'Chance 0–1' }) + this.#zahl('raum.respawnZeit', r.respawnZeit ?? '', { min: 0, max: 7200, schritt: 30, titel: 'Respawn s' })) + this.#abschnitt('Umbauen', umbau) + this.#abschnitt('Fläche', this.#rechteck(w));
      }
      case 'uebergaenge':
        return this.#abschnitt('Ziel', this.#auswahl('ziel', w.ziel, [[w.ziel, w.ziel], ...zonen.filter(([z]) => z !== w.ziel)], 'Zielzone') + this.#text('ankunft', w.ankunft, 'Ankunft', 'Name in der Zielzone') + this.#text('name', w.name, 'Beschriftung') + `<button class="knopf" data-aktion="zumZiel">${icon('pfeilRechts', 14)} Zur Zielzone springen</button>`) + this.#abschnitt('Bereich', this.#rechteck(w));
      case 'ankuenfte':
        return this.#abschnitt('Ankunftspunkt', this.#text('_name', k, 'Name') + `<div class="insp-zeile"><span>Kachel</span><div class="insp-xyz"><label>X<input class="feld zahl" type="number" step="1" data-feld="x" value="${w.x}" /></label><label>Y<input class="feld zahl" type="number" step="1" data-feld="y" value="${w.y}" /></label></div></div><div class="hinweis-kasten">Übergänge anderer Zonen nennen diesen Namen als „Ankunft“.</div>`);
      case 'klaenge':
        return this.#abschnitt('Klang', this.#text('name', w.name, 'Name') + this.#auswahl('datei', w.datei ?? '', klaenge, 'Datei') + this.#zahl('lautstaerke', w.lautstaerke ?? 1, { min: 0, max: 2, schritt: 0.05, titel: 'Lautstärke', regler: true }) + this.#auswahl('wiedergabe', w.wiedergabe, WIEDERGABEN.map((x) => [x, x]), 'Wiedergabe') + this.#auswahl('bus', w.bus, BUSSE.map((x) => [x, x]), 'Kanal'))
          + this.#abschnitt('Bereich', w.art === 'punkt' ? this.#lage(w) + this.#zahl('innen', w.innen, { min: 0, max: 50, schritt: 0.5, titel: 'Voll bis' }) + this.#zahl('aussen', w.aussen, { min: 1, max: 120, schritt: 1, titel: 'Hörweite' }) : w.art === 'bereich' ? this.#rechteck(w) + this.#zahl('rand', w.rand ?? 2, { min: 0, max: 20, schritt: 0.5, titel: 'Übergang' }) : '<div class="hinweis-kasten">Gilt für die ganze Zone.</div>');
      case 'tierBereiche':
        return this.#abschnitt('Tiere', this.#auswahl('art', w.art ?? 'hase', A.TIER_ARTEN, 'Art') + this.#zahl('anzahl', w.anzahl, { min: 0, max: 100, schritt: 1, titel: 'Anzahl' }) + this.#zahl('respawnZeit', w.respawnZeit ?? '', { min: 0, max: 7200, schritt: 30, titel: 'Respawn s' })) + this.#abschnitt('Bereich', this.#rechteck(w));
      case 'zombieBereiche':
        return this.#abschnitt('Zombies', this.#text('name', w.name, 'Name', 'z. B. Friedhof') + this.#zahl('anzahl', w.anzahl, { min: 1, max: 60, schritt: 1, titel: 'Anzahl' }) + this.#auswahl('tageszeit', w.tageszeit ?? 'immer', [['immer', 'immer'], ['tag', 'nur tagsüber'], ['nacht', 'nur nachts']], 'Tageszeit') + this.#zahl('respawnZeit', w.respawnZeit ?? '', { min: 0, max: 7200, schritt: 10, titel: 'Respawn s' }))
          + this.#abschnitt('Mischung (Gewichte)', ZOMBIE_VARIANTEN_NAMEN.map((v) => this.#zahl(`variante.${v}`, w.varianten?.[v] ?? '', { min: 0, max: 100, schritt: 1, titel: v })).join('') + '<div class="hinweis-kasten">Leer = Standard-Mischung des Spiels. Beispiel: normal 6, laeufer 2, brocken 1.</div>')
          + this.#abschnitt('Patrouille / Horden-Route', `<div class="insp-zeile"><span>Route</span><div style="color:var(--text-3)">${w.route ? `${w.route.length} Punkte` : 'keine'}</div></div><div class="insp-knoepfe"><button class="knopf" data-aktion="routeZeichnen">${icon('messen', 14)} Route zeichnen</button>${w.route ? `<button class="knopf" data-aktion="routeWeg">${icon('loeschen', 14)} Route löschen</button>` : ''}</div><div class="hinweis-kasten">Ruhende Zombies laufen die Punkte reihum ab – mit „nur nachts“ eine wandernde Nacht-Horde.</div>`)
          + this.#abschnitt('Bereich', this.#rechteck(w));
      case 'notizen':
        return this.#abschnitt('Notiz', `<textarea class="feld" rows="5" data-feld="text" style="width:100%">${esc(w.text)}</textarea>` + this.#schalter('erledigt', w.erledigt, 'Status', 'erledigt') + this.#auswahl('fuer', w.fuer ?? 'ki', [['ki', 'Auftrag für die KI'], ['mensch', 'Notiz für Menschen']], 'Für') + (w.antwort ? `<div class="hinweis-kasten"><b>KI:</b> ${esc(w.antwort)}</div>` : '') + this.#lage(w));
      case 'bauwerke':
        return this.#abschnitt('Bauwerk', `<div class="insp-zeile"><span>Typ</span><div>${esc(w.typ)}</div></div><div class="insp-zeile"><span>Kachel</span><div class="insp-xyz"><label>X<input class="feld zahl" type="number" step="1" data-feld="tx" value="${w.tx}" /></label><label>Y<input class="feld zahl" type="number" step="1" data-feld="ty" value="${w.ty}" /></label></div></div>`);
      default:
        return '';
    }
  }

  #knoepfe(s) {
    const dup = ['objekte', 'spawnpunkte', 'lootZonen', 'klaenge', 'tierBereiche'].includes(s);
    return `<div class="insp-abschnitt"><div class="insp-knoepfe"><button class="knopf" data-aktion="fokus">${icon('fokus', 14)} Zeigen</button>${dup ? `<button class="knopf" data-aktion="duplizieren">${icon('kopieren', 14)} Duplizieren</button>` : ''}<button class="knopf gefahr" data-aktion="loeschen">${icon('loeschen', 14)} Löschen</button></div></div>`;
  }

  #mehrere(g) {
    const zaehlung = {};
    for (const e of g) zaehlung[e.s] = (zaehlung[e.s] ?? 0) + 1;
    const nurObjekte = g.every((e) => e.s === 'objekte');
    this.el.innerHTML = `<div class="insp-kopf"><div class="insp-symbol">${icon('ebenen', 20)}</div><div><div class="insp-titel">${g.length} Elemente gewählt</div><div class="insp-unter">${Object.entries(zaehlung).map(([s, n]) => `${n} ${TITEL[s]?.[0] ?? s}`).join(' · ')}</div></div></div>`
      + (nurObjekte ? this.#abschnitt('Alle ändern', this.#zahl('alle.skalierung', '', { min: 0.25, max: 4, schritt: 0.05, titel: 'Größe ×' }) + this.#zahl('alle.drehung', '', { min: -180, max: 360, schritt: 15, titel: 'Drehung °' }) + `<button class="knopf" data-aktion="variieren">${icon('ki', 14)} Variieren (Größe & Drehung zufällig)</button>`) : '')
      + `<div class="insp-abschnitt"><div class="insp-knoepfe"><button class="knopf" data-aktion="fokus">${icon('fokus', 14)} Zeigen</button><button class="knopf" data-aktion="duplizieren">${icon('kopieren', 14)} Duplizieren</button><button class="knopf" data-aktion="alsVorlage">${icon('vorlage', 14)} Als Vorlage</button><button class="knopf gefahr" data-aktion="loeschen">${icon('loeschen', 14)} Löschen</button></div></div>`;
  }

  #zone(k) {
    const e = k.werte.einstellungen ?? {};
    const quelle = this.dok.aktiv.quelle;
    this.el.innerHTML = `<div class="insp-kopf"><div class="insp-symbol">${icon(quelle === 'vorlage' ? 'vorlage' : 'zone', 20)}</div><div><div class="insp-titel">${esc(k.name)}</div><div class="insp-unter">${quelle === 'vorlage' ? 'Vorlage in Arbeit' : `Zone ${esc(k.id)}`} · ${k.breite} × ${k.hoehe}</div></div></div>`
      + this.#abschnitt('Allgemein', this.#text('zone.name', k.name, 'Name') + `<div class="insp-zeile"><span>ID</span><div style="color:var(--text-3)">${esc(k.id)}</div></div>` + this.#text('zone.musik', k.werte.musik, 'Musik-Ordner', k.id) + this.#schalter('zone.schnee', k.werte.schnee, 'Schneezone', 'Schneefall statt Regen'))
      + this.#abschnitt('Zone', this.#zahl('zone.zombie.dichte', e.zombie?.dichte ?? '', { min: 0, max: 5, schritt: 0.1, titel: 'Zombie-Dichte' }) + this.#zahl('zone.loot.spawnChance', e.loot?.spawnChance ?? '', { min: 0, max: 1, schritt: 0.05, titel: 'Loot-Chance' }) + this.#zahl('zone.loot.respawnZeit', e.loot?.respawnZeit ?? '', { min: 0, max: 7200, schritt: 30, titel: 'Loot-Respawn s' }))
      + this.#abschnitt('Inhalt', `<div style="color:var(--text-2);line-height:1.7">${k.s('objekte').size} Objekte · ${k.s('raeume').size} Räume · ${k.s('spawnpunkte').size} Spawnpunkte · ${k.s('lootZonen').size} Loot-Zonen · ${k.s('uebergaenge').size} Übergänge · ${k.s('klaenge').size} Klänge</div>`)
      + this.#vorlagenKopien(k)
      + `<div class="insp-abschnitt"><div class="insp-knoepfe">${quelle === 'vorlage' ? `<button class="knopf primaer" data-aktion="vorlageSpeichern">${icon('speichern', 14)} Vorlage speichern</button>` : `<button class="knopf" data-aktion="zoneGroesse">${icon('skalieren', 14)} Größe ändern</button>`}</div></div>`;
  }

  #vorlagenKopien(k) {
    const liste = k.werte.vorlagenInstanzen ?? [];
    if (!liste.length) return '';
    const name = (id) => this.studio.vorlagen().find((v) => v.id === id)?.name ?? id;
    return this.#abschnitt(`Vorlagen-Kopien (${liste.length})`, liste.map((i) => `<div class="insp-zeile"><span title="${esc(i.vorlage)}">${esc(name(i.vorlage))}</span><div><span style="color:var(--text-3)">${i.x}|${i.y}</span><button class="knopf flach" data-aktion="kopieZeigen" data-id="${i.id}" title="Zeigen">${icon('fokus', 14)}</button><button class="knopf flach" data-aktion="kopieAktualisieren" data-id="${i.id}" title="Auf Stand der Vorlage bringen">${icon('wiederholen', 14)}</button><button class="knopf flach" data-aktion="kopieEntkoppeln" data-id="${i.id}" title="Entkoppeln">${icon('link', 14)}</button></div></div>`).join('') + '<div class="hinweis-kasten">Wird eine Vorlage gespeichert, fragt das Studio, ob alle Kopien mitziehen sollen.</div>');
  }

  // ---------- Ändern ----------
  #wert(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? undefined : Number(el.value);
    return el.value;
  }

  #aenderung(e) {
    const umbau = e.target.closest('[data-umbau]');
    if (umbau && umbau.value) {
      const g = this.dok.gewaehlt();
      const f = g.length === 1 && g[0].s === 'raumFlaechen' ? this.dok.karte.s('raumFlaechen').get(g[0].k) : null;
      if (f) this.dok.aendere(umbau.dataset.umbau === 'wand' ? 'Wände getauscht' : 'Boden getauscht', A.raumUmbauOps(this.dok.karte, f, { [umbau.dataset.umbau]: umbau.value }));
      return;
    }
    const el = e.target.closest('[data-feld]');
    if (!el) return;
    const feld = el.dataset.feld;
    const wert = this.#wert(el);
    const { dok } = this;
    const k = dok.karte;
    try {
      if (feld.startsWith('zone.')) return this.#zoneAendern(feld.slice(5), wert);
      const g = dok.gewaehlt();
      if (feld.startsWith('alle.')) {
        const f = feld.slice(5);
        if (wert === undefined) return;
        return dok.aendere(`Alle: ${f}`, g.map(({ k: id, wert: o }) => ({ s: 'objekte', k: id, neu: f === 'skalierung' ? A.skaliertesObjekt(o, wert) : A.gedrehtesObjekt(o, wert) })));
      }
      if (g.length !== 1) return;
      const { s, k: id, wert: w } = g[0];
      if (s === 'objekte' && feld === 'skalierung') return dok.aendere('Größe', [{ s, k: id, neu: A.skaliertesObjekt(w, wert ?? 1) }]);
      if (s === 'objekte' && feld === 'drehung') return dok.aendere('Drehung', [{ s, k: id, neu: A.gedrehtesObjekt(w, wert ?? 0) }]);
      if (feld.startsWith('klang.')) {
        const f = feld.slice(6);
        if (f === 'datei' && !wert) return dok.aendere('Klang entfernt', A.aenderOps(k, s, id, { klang: undefined }));
        return this.#mitKlangDatei(f === 'datei' ? wert : null).then((datei) => dok.aendere('Klang am Objekt', A.aenderOps(k, s, id, { klang: { innen: 2, aussen: 10, lautstaerke: 1, ...(w.klang ?? {}), ...(datei ? { datei, name: datei.split('/').pop() } : { [f]: wert }) } })));
      }
      if (s === 'klaenge' && feld === 'datei') return this.#mitKlangDatei(wert).then((datei) => dok.aendere('Klangdatei', A.aenderOps(k, s, id, { datei: datei || undefined })));
      if (feld.startsWith('menge.')) {
        const i = Number(feld.slice(6));
        const m = [...(w.menge ?? [1, 1])];
        m[i] = wert ?? 1;
        if (m[1] < m[0]) m[1 - i] = m[i];
        return dok.aendere('Menge', A.aenderOps(k, s, id, { menge: m }));
      }
      if (feld.startsWith('variante.')) {
        const v = { ...(w.varianten ?? {}) };
        const name = feld.slice(9);
        if (wert > 0) v[name] = wert;
        else delete v[name];
        return dok.aendere('Zombie-Mischung', A.aenderOps(k, s, id, { varianten: Object.keys(v).length ? v : undefined }));
      }
      if (feld.startsWith('raum.')) {
        const f = feld.slice(5);
        const r = k.s('raeume').get(w.raum) ?? {};
        return dok.aendere('Raum', [{ s: 'raeume', k: w.raum, neu: { ...r, [f]: wert } }]);
      }
      if (feld === '_tabelle') {
        if (!wert) return;
        return dok.aendere('Loot-Inhalt', A.aenderOps(k, s, id, { eintraege: eingebauteVorlagen()[`spiel:${wert}`].eintraege, modus: 'gewicht', name: w.name || `Loot ${wert}` }));
      }
      if (s === 'marker' && (feld === 'mx' || feld === 'my')) {
        const [x, y] = ausSchluessel(id);
        const nx = feld === 'mx' ? wert : x;
        const ny = feld === 'my' ? wert : y;
        if (!k.imFeld(nx, ny)) return;
        dok.aendere('Punkt verschieben', [{ s, k: id, neu: null }, { s, k: markerSchluessel(nx, ny), neu: w }]);
        return dok.waehle([{ s, k: markerSchluessel(nx, ny) }]);
      }
      if (s === 'ankuenfte' && feld === '_name') {
        const neu = String(wert).trim();
        if (!neu || neu === id || k.s('ankuenfte').has(neu)) return this.zeichne();
        dok.aendere('Ankunft umbenennen', [{ s, k: id, neu: null }, { s, k: neu, neu: w }]);
        return dok.waehle([{ s, k: neu }]);
      }
      if (s === 'spawnpunkte' && feld === 'inhalt' && wert.startsWith('tabelle:')) return dok.aendere('Inhalt', A.aenderOps(k, s, id, { inhalt: wert, menge: undefined }));
      dok.aendere(`${feld} ändern`, A.aenderOps(k, s, id, { [feld]: wert === '' ? undefined : wert }));
    } catch (f) {
      this.studio.hinweis(f.message, 'fehler');
      this.zeichne();
    }
  }

  async #mitKlangDatei(datei) {
    if (!datei) return datei;
    return this.studio.klangFuerZone(datei);
  }

  #zoneAendern(feld, wert) {
    const { dok } = this;
    if (feld === 'name') return dok.aendere('Zonenname', [{ s: 'wert', pfad: 'name', neu: String(wert).trim() || dok.karte.id }]);
    if (feld === 'musik') return dok.aendere('Musik', [{ s: 'wert', pfad: 'musik', neu: wert || undefined }]);
    if (feld === 'schnee') return dok.aendere('Schneezone', [{ s: 'wert', pfad: 'schnee', neu: wert || undefined }]);
    return dok.aendere('Zonen-Einstellung', [{ s: 'wert', pfad: `einstellungen.${feld}`, neu: wert }]);
  }

  #aktion(art, knopf) {
    const { dok, studio } = this;
    const k = dok.karte;
    const g = dok.gewaehlt();
    if (art === 'fokus') return studio.ansicht.zeigeAuswahl();
    if (art === 'loeschen') return studio.befehle.aus('bearbeiten.loeschen');
    if (art === 'duplizieren') return studio.befehle.aus('bearbeiten.duplizieren');
    if (art === 'alsVorlage') return studio.befehle.aus('vorlage.ausAuswahl');
    if (art === 'vorlageSpeichern') return studio.befehle.aus('vorlage.speichern');
    if (art === 'zoneGroesse') return studio.befehle.aus('zone.groesse');
    if (art.startsWith('kopie')) {
      const i = A.vorlagenInstanzen(k).find((x) => x.id === Number(knopf.dataset.id));
      if (!i) return undefined;
      if (art === 'kopieZeigen') return studio.ansicht.zeige(i.x + i.b / 2, i.y + i.h / 2, Math.max(i.b, i.h) * 2.2);
      if (art === 'kopieEntkoppeln') return dok.aendere('Vorlage entkoppelt', A.entkoppleOps(k, i.id));
      const v = studio.vorlagen().find((x) => x.id === i.vorlage);
      if (!v) return studio.hinweis(`Vorlage „${i.vorlage}“ gibt es nicht mehr`, 'fehler');
      return dok.aendere('Vorlage aktualisiert', A.aktualisiereInstanzOps(k, i, v.vorlage));
    }
    if ((art === 'raumFenster' || art === 'raumTuer') && g.length === 1 && g[0].s === 'raumFlaechen') {
      const f = k.s('raumFlaechen').get(g[0].k);
      return dok.aendere(art === 'raumTuer' ? 'Tür eingesetzt' : 'Fenster eingesetzt', A.raumUmbauOps(k, f, { [art === 'raumTuer' ? 'tuer' : 'fenster']: knopf.dataset.seite }));
    }
    if (art === 'routeZeichnen' && g.length === 1) return studio.werkzeuge.zeichneRoute(g[0].s, g[0].k);
    if (art === 'routeWeg' && g.length === 1) return dok.aendere('Route gelöscht', A.aenderOps(k, g[0].s, g[0].k, { route: undefined }));
    if (art === 'farbeWeg' && g.length === 1) return dok.aendere('Farbe', A.aenderOps(k, g[0].s, g[0].k, { farbe: undefined }));
    if (art === 'zumZiel' && g.length === 1) {
      const u = g[0].wert;
      return studio.oeffneZone(u.ziel).then(() => {
        const a = dok.karte?.s('ankuenfte').get(u.ankunft);
        if (a) {
          studio.ansicht.zeige(a.x + 0.5, a.y + 0.5, 30);
          dok.waehle([{ s: 'ankuenfte', k: u.ankunft }]);
        } else studio.hinweis(`In „${u.ziel}“ gibt es keinen Ankunftspunkt „${u.ankunft}“ – mit dem Punkt-Werkzeug (P) anlegen`, 'fehler');
      });
    }
    if (art === 'variieren') return dok.aendere('Variieren', g.map(({ k: id, wert: o }) => ({ s: 'objekte', k: id, neu: A.gedrehtesObjekt(A.skaliertesObjekt(o, (o.skalierung ?? 1) * (0.8 + Math.random() * 0.45)), Math.round(Math.random() * 360)) })));
    return undefined;
  }
}
