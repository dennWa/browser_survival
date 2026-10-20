import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { KACHEL_GROESSE } from '../../gemeinsam/konstanten.js';
import { nachDefinition } from './format.js';
import { hatModell, hatAudio } from './bibliothek.js';
import { kachelPruefer, lootVorschau } from './lootZonenEditor.js';
import { ausSchluessel } from './karte.js';
import { istBekannterTyp } from './katalog.js';
import { ZONEN_ID_MUSTER } from './zone.js';
import { pruefWelt } from './innen.js';

/**
 * Live-Validierung. Liefert eine Liste { schwere: 'fehler' | 'warnung', code, text, x, y } (x/y = Kachel zum Hinspringen).
 * "fehler" verhindern Test/Veröffentlichen, "warnung" nicht.
 * Klänge (Phase 4): klang-quelle (Fehler), klang-fehlt (Datei nicht in der Audio-Bibliothek), klang-radius, klang-schnitt, klang-musik.
 *
 * Die Spielregeln kommen aus dem Spiel selbst: die Karte wird mit kartenLader.verarbeiteKarte geladen und als Welt
 * aufgebaut → istBlockiert / istInnen / Erreichbarkeit sind exakt wie im Spiel.
 *
 * @param zonen  Map/Objekt id → EditorKarte aller bekannten Zonen (für Übergänge: Ziel, Ankunft, Rückweg) – optional
 */
export function validiere(karte, { zonen = null, mitErreichbarkeit = true } = {}) {
  const liste = [];
  const fehler = (code, text, x = null, y = null) => liste.push({ schwere: 'fehler', code, text, x, y });
  const warnung = (code, text, x = null, y = null) => liste.push({ schwere: 'warnung', code, text, x, y });

  if (!ZONEN_ID_MUSTER.test(karte.id)) fehler('id', `Zonen-ID "${karte.id}" ungültig (nur a–z, 0–9, _)`);
  const marker = [...karte.s('marker')].map(([k, m]) => [...ausSchluessel(k), m]);
  if (!marker.some(([, , m]) => m.art === 'start')) fehler('start', 'Spieler-Start fehlt (Spawns → Spieler-Start)');

  // Loot & Räume
  for (const [x, y, m] of marker) {
    if (!karte.imFeld(x, y)) fehler('marker-aussen', `Marker außerhalb der Zone (${x}|${y})`, x, y);
    if (m.art !== 'loot') continue;
    const raum = karte.s('raeume').get(m.raum);
    if (!raum) fehler('loot-raum', `Loot-Punkt ohne Raum "${m.raum}"`, x, y);
    else if (!LOOT_TABELLEN[raum.lootTabelle]) fehler('loot-typ', `Unbekannter Loot-Typ "${raum.lootTabelle}" (Raum ${m.raum} „${raum.name}“)`, x, y);
  }
  for (const [k, r] of karte.s('raeume')) {
    if (!LOOT_TABELLEN[r.lootTabelle]) fehler('loot-typ', `Raum ${k} „${r.name}“: unbekannter Loot-Typ "${r.lootTabelle}"`);
    for (const f of ['spawnChance']) if (r[f] !== undefined && !(r[f] >= 0 && r[f] <= 1)) fehler('loot-wert', `Raum ${k}: ${f} muss 0–1 sein`);
  }

  // Objekte & Bauwerke
  const eigeneGemeldet = new Set();
  for (const [, o] of karte.s('objekte')) {
    // Fehler = Position (linke obere Ecke) außerhalb; nur überstehend = Warnung (Baumkronen dürfen überstehen, wie in stadtrand)
    if (o.x < 0 || o.y < 0 || o.x >= karte.breite || o.y >= karte.hoehe) fehler('objekt-aussen', `Objekt „${o.typ}“ außerhalb der Zone`, Math.floor(o.x), Math.floor(o.y));
    else if (o.ebene !== 'oben' && (o.x < 0 || o.y < 0 || o.x + o.b > karte.breite + 1e-9 || o.y + o.h > karte.hoehe + 1e-9)) warnung('objekt-rand', `Objekt „${o.typ}“ ragt über den Rand`, Math.floor(o.x), Math.floor(o.y));
    if (!(o.b > 0 && o.h > 0)) fehler('objekt-groesse', `Objekt „${o.typ}“ ohne Größe`, Math.floor(o.x), Math.floor(o.y));
    if (!istBekannterTyp(o.typ, karte)) warnung('objekt-typ', `Unbekannter Objekttyp „${o.typ}“ (Spiel zeichnet einen Ersatz-Quader)`, Math.floor(o.x), Math.floor(o.y));
    else if (karte.s('typen').has(o.typ) && !eigeneGemeldet.has(o.typ)) {
      const t = karte.s('typen').get(o.typ);
      if (t.asset && !t.glb && !t.glbDatei && !hatModell(t.asset)) {
        eigeneGemeldet.add(o.typ);
        warnung('modell-fehlt', `Typ „${o.typ}“: 3D-Modell fehlt in der Bibliothek (anderer Browser? Backup/Entwurf-Datei mit Modellen öffnen)`, Math.floor(o.x), Math.floor(o.y));
      } else if (!t.glb && !t.asset && !t.glbDatei) {
        eigeneGemeldet.add(o.typ);
        warnung('eigener-typ', `Eigener Typ „${o.typ}“: im Spiel ein Platzhalter-Quader (ohne 3D-Modell)`, Math.floor(o.x), Math.floor(o.y));
      }
    }
  }
  // Nächte sind dunkel (Editor 2.0, 2.1): Licht gibt es nur an Lampen, Laternen, Scheinwerfern und Lagerfeuern
  const hatLicht = [...karte.s('objekte').values()].some((o) => o.typ === 'licht') || [...karte.s('bauwerke').values()].some((b) => b.typ === 'lagerfeuer');
  if (!hatLicht && karte.breite * karte.hoehe > 0) warnung('kein-licht', 'Keine Lichtquelle: nachts ist die Zone stockdunkel (nur Taschenlampe) – Lampe, Laterne, Scheinwerfer oder Lagerfeuer setzen');
  // Loot-Zonen (6.2): gleiche Regeln wie der Spiel-Lader
  if (karte.s('lootZonen').size) {
    const kachel = kachelPruefer(karte);
    for (const [id, z] of karte.s('lootZonen')) {
      const v = lootVorschau(karte, id, kachel);
      const name = `Loot-Zone „${z.name ?? id}“`;
      for (const f of v.fehler) (f === 'keine Items' ? warnung : fehler)('loot-zone', `${name}: ${f}`, z.x, z.y);
      if (v.zone && v.frei === 0) fehler('loot-zone-flaeche', `${name}: keine freie Kachel${v.zone.ort !== 'alle' ? ` (${v.zone.ort})` : ''} – Punkte haben keinen Platz`, z.x, z.y);
      else if (v.zone && v.frei < v.zone.punkte) warnung('loot-zone-punkte', `${name}: nur ${v.frei} freie Kacheln für ${v.zone.punkte} Punkte`, z.x, z.y);
    }
  }
  // Klänge (Phase 4): Datei muss da sein, Punkt/Bereich in der Zone, sinnvolle Radien; höchstens eine Karten-Musik ersetzt den Ordner
  let ersetzend = 0;
  for (const [, c] of karte.s('klaenge')) {
    const ort = c.art === 'global' ? [null, null] : [Math.floor(c.x), Math.floor(c.y)];
    if (!c.audio && !c.daten && !c.datei) fehler('klang-quelle', `Klang „${c.name}“ ohne Audio-Datei`, ...ort);
    else if (c.audio && !c.daten && !c.datei && !hatAudio(c.audio)) warnung('klang-fehlt', `Klang „${c.name}“: Audio-Datei fehlt in der Bibliothek (anderer Browser? Backup/Entwurf-Datei mit Audio öffnen)`, ...ort);
    if (c.art === 'punkt' && (c.x < 0 || c.y < 0 || c.x > karte.breite || c.y > karte.hoehe)) fehler('objekt-aussen', `Klang „${c.name}“ außerhalb der Zone`, ...ort);
    if (c.art === 'punkt' && !(c.aussen > c.innen)) warnung('klang-radius', `Klang „${c.name}“: Hörweite muss größer sein als „Voll bis“`, ...ort);
    if (c.art === 'bereich' && (c.x < 0 || c.y < 0 || c.x + c.b > karte.breite || c.y + c.h > karte.hoehe)) fehler('objekt-aussen', `Ambiente „${c.name}“ außerhalb der Zone`, ...ort);
    if (c.ende && c.ende <= c.start) warnung('klang-schnitt', `Klang „${c.name}“: Ende liegt vor dem Start`, ...ort);
    if (c.art === 'global' && c.ersetztMusik) ersetzend++;
  }
  if (ersetzend > 1) warnung('klang-musik', `${ersetzend} globale Klänge ersetzen die Zonen-Musik – sie laufen gleichzeitig`);
  for (const [, b] of karte.s('bauwerke')) {
    if (!BAUWERKE[b.typ]) fehler('bauwerk-typ', `Unbekanntes Bauwerk „${b.typ}“`, b.tx, b.ty);
    if (!karte.imFeld(b.tx, b.ty)) fehler('objekt-aussen', `Bauwerk „${b.typ}“ außerhalb der Zone`, b.tx, b.ty);
  }
  for (const [, t] of karte.s('tierBereiche')) {
    if (t.x < 0 || t.y < 0 || t.x + t.b > karte.breite || t.y + t.h > karte.hoehe) fehler('objekt-aussen', 'Tier-Bereich außerhalb der Zone', t.x, t.y);
    if (!(Number.isInteger(t.anzahl) && t.anzahl >= 0)) fehler('tier-anzahl', 'Tier-Bereich: Anzahl fehlt', t.x, t.y);
  }
  for (const [, r] of karte.s('raumFlaechen')) if (!karte.s('raeume').has(r.raum)) warnung('raum-flaeche', `Raumfläche ohne Raum "${r.raum}"`, r.x, r.y);

  // Übergänge & Ankünfte
  for (const [, u] of karte.s('uebergaenge')) {
    const ok = Number.isInteger(u.x) && Number.isInteger(u.y) && u.b > 0 && u.h > 0 && u.x >= 0 && u.y >= 0 && u.x + u.b <= karte.breite && u.y + u.h <= karte.hoehe;
    if (!ok) fehler('uebergang-aussen', 'Übergang liegt (teilweise) außerhalb der Zone', u.x, u.y);
    if (!u.ziel) fehler('uebergang-ziel', `Übergang „${u.name ?? ''}“ ohne Zielzone`, u.x, u.y);
    if (!u.ankunft) fehler('uebergang-ankunft', `Übergang „${u.name ?? ''}“ ohne Ankunftspunkt`, u.x, u.y);
    const amRand = u.x === 0 || u.y === 0 || u.x + u.b === karte.breite || u.y + u.h === karte.hoehe;
    if (ok && !amRand) warnung('uebergang-rand', `Übergang „${u.name ?? u.ziel}“ liegt nicht am Rand`, u.x, u.y);
    if (zonen && u.ziel) {
      const ziel = zonen instanceof Map ? zonen.get(u.ziel) : zonen[u.ziel];
      if (!ziel) fehler('uebergang-ziel', `Zielzone „${u.ziel}“ gibt es nicht`, u.x, u.y);
      else {
        const p = ziel.s('ankuenfte').get(u.ankunft);
        if (!p) fehler('uebergang-ankunft', `Zielzone „${u.ziel}“ hat keine Ankunft „${u.ankunft}“`, u.x, u.y);
        if (![...ziel.s('uebergaenge').values()].some((v) => v.ziel === karte.id)) fehler('uebergang-rueckweg', `Kein Weg zurück: „${u.ziel}“ hat keinen Übergang nach „${karte.id}“`, u.x, u.y);
      }
    }
  }
  for (const [n, p] of karte.s('ankuenfte')) {
    if (!karte.imFeld(p.x, p.y)) {
      fehler('ankunft-aussen', `Ankunft „${n}“ außerhalb der Zone`, p.x, p.y);
      continue;
    }
    for (const [, u] of karte.s('uebergaenge')) {
      if (p.x >= u.x && p.x < u.x + u.b && p.y >= u.y && p.y < u.y + u.h) fehler('ankunft-im-uebergang', `Ankunft „${n}“ liegt im Übergang „${u.name ?? u.ziel}“ (Ping-Pong)`, p.x, p.y);
    }
  }

  // Ab hier: Spielregeln über den echten Lader + Welt
  try {
    verarbeiteKarte(nachDefinition(karte), KACHEL_GROESSE);
  } catch (e) {
    if (!/Spieler-Start|Übergang|Ankunft/.test(e.message)) fehler('lader', `Spiel-Lader: ${e.message}`);
  }
  const pw = pruefWelt(karte);
  if (pw) {
    const { geladen, welt } = pw;
    for (const [n, p] of karte.s('ankuenfte')) if (karte.imFeld(p.x, p.y) && welt.istBlockiert(p.x, p.y)) fehler('ankunft-blockiert', `Ankunft „${n}“ steht auf einem Hindernis`, p.x, p.y);
    for (const [x, y, m] of marker) {
      if (!karte.imFeld(x, y)) continue;
      if (welt.istBlockiert(x, y)) fehler('marker-blockiert', `${markerName(m)} steht auf einem Hindernis`, x, y);
      if (m.art === 'zombie' && welt.istInnen((x + 0.5) * KACHEL_GROESSE, (y + 0.5) * KACHEL_GROESSE)) fehler('zombie-innen', 'Zombie im Haus (Zombie-Spawns nur draußen)', x, y);
    }
    for (const index of welt.moebelBlockiert) {
      const x = index % welt.breite;
      const y = Math.floor(index / welt.breite);
      if ('#FT'.includes(welt.kachelAn(x, y))) warnung('moebel-wand', `Möbel in Wand/Tür (${welt.kachelAn(x, y)})`, x, y);
    }
    if (mitErreichbarkeit && geladen.spielerStarts.length) erreichbarkeit(welt, geladen, warnung);
  }
  return liste;
}

function markerName(m) {
  return m.art === 'start' ? 'Spieler-Start' : m.art === 'zombie' ? 'Zombie-Spawn' : `Loot-Punkt (${m.raum})`;
}

/** Wie tests/inhalte.test.js: alles vom ersten Start aus zu Fuß erreichbar? */
function erreichbarkeit(welt, karte, warnung) {
  const g = welt.kachelGroesse;
  const start = karte.spielerStarts[0];
  const besucht = new Uint8Array(welt.breite * welt.hoehe);
  const stapel = [[Math.floor(start.x / g), Math.floor(start.y / g)]];
  while (stapel.length) {
    const [x, y] = stapel.pop();
    if (x < 0 || y < 0 || x >= welt.breite || y >= welt.hoehe) continue;
    const i = y * welt.breite + x;
    if (besucht[i] || welt.istBlockiert(x, y)) continue;
    besucht[i] = 1;
    stapel.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (const p of [...karte.lootPunkte, ...karte.zombieSpawns, ...karte.spielerStarts]) {
    const x = Math.floor(p.x / g);
    const y = Math.floor(p.y / g);
    if (!besucht[y * welt.breite + x] && !welt.istBlockiert(x, y)) warnung('unerreichbar', `Nicht erreichbar vom Start${p.raum ? ` (Loot ${p.raum})` : ''}`, x, y);
  }
  // Gelände (2.3): erhöhte Flächen, die man nicht erreicht (Klippe ohne Rampe) – je Fläche eine Warnung
  if (welt.hoehen) {
    const gesehen = new Uint8Array(welt.breite * welt.hoehe);
    let gemeldet = 0;
    for (let i = 0; i < gesehen.length && gemeldet < 5; i++) {
      if (gesehen[i] || besucht[i] || welt.hoehen[i] < 0.5 || welt.istBlockiert(i % welt.breite, Math.floor(i / welt.breite))) continue;
      // zusammenhängende, unerreichte, erhöhte Fläche einsammeln
      const flaeche = [];
      const offen = [i];
      gesehen[i] = 1;
      while (offen.length) {
        const j = offen.pop();
        flaeche.push(j);
        const x = j % welt.breite;
        const y = Math.floor(j / welt.breite);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= welt.breite || ny >= welt.hoehe) continue;
          const n = ny * welt.breite + nx;
          if (gesehen[n] || besucht[n] || welt.hoehen[n] < 0.5 || welt.istBlockiert(nx, ny)) continue;
          gesehen[n] = 1;
          offen.push(n);
        }
      }
      if (flaeche.length < 4) continue;
      gemeldet++;
      warnung('plateau-ohne-zugang', `Erhöhte Fläche (${flaeche.length} Kacheln) ohne Zugang – Rampe oder Stufen anlegen (Gelände-Werkzeug)`, flaeche[0] % welt.breite, Math.floor(flaeche[0] / welt.breite));
    }
  }
  for (const u of welt.uebergaenge) {
    let ok = false;
    for (let y = u.y; y < u.y + u.h && !ok; y++) for (let x = u.x; x < u.x + u.b && !ok; x++) ok = besucht[y * welt.breite + x] === 1;
    if (!ok) warnung('unerreichbar', `Übergang „${u.name}“ nicht erreichbar vom Start`, u.x, u.y);
  }
}

export const hatFehler = (liste) => liste.some((e) => e.schwere === 'fehler');
