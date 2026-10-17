import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { KACHEL_GROESSE } from '../../gemeinsam/konstanten.js';
import { nachDefinition } from './format.js';
import { ausSchluessel } from './karte.js';
import { istBekannterTyp } from './katalog.js';
import { ZONEN_ID_MUSTER } from './zone.js';
import { pruefWelt } from './innen.js';

/**
 * Live-Validierung. Liefert eine Liste { schwere: 'fehler' | 'warnung', code, text, x, y } (x/y = Kachel zum Hinspringen).
 * "fehler" verhindern Test/Veröffentlichen, "warnung" nicht.
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
  for (const [, o] of karte.s('objekte')) {
    // Fehler = Position (linke obere Ecke) außerhalb; nur überstehend = Warnung (Baumkronen dürfen überstehen, wie in stadtrand)
    if (o.x < 0 || o.y < 0 || o.x >= karte.breite || o.y >= karte.hoehe) fehler('objekt-aussen', `Objekt „${o.typ}“ außerhalb der Zone`, Math.floor(o.x), Math.floor(o.y));
    else if (o.ebene !== 'oben' && (o.x < 0 || o.y < 0 || o.x + o.b > karte.breite + 1e-9 || o.y + o.h > karte.hoehe + 1e-9)) warnung('objekt-rand', `Objekt „${o.typ}“ ragt über den Rand`, Math.floor(o.x), Math.floor(o.y));
    if (!(o.b > 0 && o.h > 0)) fehler('objekt-groesse', `Objekt „${o.typ}“ ohne Größe`, Math.floor(o.x), Math.floor(o.y));
    if (!istBekannterTyp(o.typ, karte)) warnung('objekt-typ', `Unbekannter Objekttyp „${o.typ}“ (Spiel zeichnet einen Ersatz-Quader)`, Math.floor(o.x), Math.floor(o.y));
  }
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
  for (const u of welt.uebergaenge) {
    let ok = false;
    for (let y = u.y; y < u.y + u.h && !ok; y++) for (let x = u.x; x < u.x + u.b && !ok; x++) ok = besucht[y * welt.breite + x] === 1;
    if (!ok) warnung('unerreichbar', `Übergang „${u.name}“ nicht erreichbar vom Start`, u.x, u.y);
  }
}

export const hatFehler = (liste) => liste.some((e) => e.schwere === 'fehler');
