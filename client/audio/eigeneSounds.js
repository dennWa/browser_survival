/**
 * Eigene Sounds: Ereignisliste + Parser für client/audio/eigene/ (siehe dortige README.md).
 * Reine Funktionen ohne DOM/Node – genutzt von werkzeuge/audio/indexieren.mjs (Index bauen),
 * tests/eigeneSounds.test.js und (nur EREIGNISSE-Namen) vom Client.
 */

/** Ereignis → [Gruppe, Beschreibung]. Reihenfolge = Reihenfolge in der README. Neue Sound-Ereignisse hier eintragen! */
export const EREIGNISSE = {
  // Waffen & Kampf
  pistole: ['Waffen & Kampf', 'Pistolenschuss'],
  schrotflinte: ['Waffen & Kampf', 'Schrotflintenschuss'],
  leer: ['Waffen & Kampf', 'Klick: Magazin leer / nichts zu tun'],
  nachladen: ['Waffen & Kampf', 'Nachladen'],
  nahkampf: ['Waffen & Kampf', 'Schlag / Hieb in die Luft'],
  treffer_zombie: ['Waffen & Kampf', 'Zombie wird getroffen'],
  treffer_spieler: ['Waffen & Kampf', 'Spieler wird getroffen'],
  // Zombies & Tod
  zombie_stoehnen: ['Zombies & Tod', 'Zombie ruhend / schlurfend (Stöhnen)'],
  zombie_angriff: ['Zombies & Tod', 'Zombie greift an'],
  zombie_tod: ['Zombies & Tod', 'Zombie stirbt'],
  spieler_tod: ['Zombies & Tod', 'Spieler stirbt'],
  // Sammeln & Bauen
  hack_holz: ['Sammeln & Bauen', 'Axt trifft Baum (jeder Hieb)'],
  baum_faellt: ['Sammeln & Bauen', 'Baum fällt um (Holzfällen fertig)'],
  hack_stein: ['Sammeln & Bauen', 'Spitzhacke trifft Eisenerz'],
  stein_bricht: ['Sammeln & Bauen', 'Eisenerz ist abgebaut'],
  hack_felsen: ['Sammeln & Bauen', 'Spitzhacke trifft Fels/Stein'],
  felsen_bricht: ['Sammeln & Bauen', 'Fels/Stein ist abgebaut'],
  aufheben: ['Sammeln & Bauen', 'Item aufheben (leises Rascheln)'],
  beute: ['Sammeln & Bauen', 'Beute / Kiste durchsucht'],
  gebaut: ['Sammeln & Bauen', 'Bauwerk platziert'],
  werkeln: ['Sammeln & Bauen', 'Herstellen / Basteln / Reparieren'],
  graben: ['Sammeln & Bauen', 'Beet anlegen / Hacke / Rasen abtragen'],
  // Türen
  tuer_auf: ['Türen', 'Tür öffnen'],
  tuer_zu: ['Türen', 'Tür schließen'],
  tuer_schlag: ['Türen', 'Zombie schlägt auf Tür'],
  tuer_bricht: ['Türen', 'Tür bricht auf'],
  // Fahrzeuge
  autotuer: ['Fahrzeuge', 'Ein-/Aussteigen'],
  aufprall: ['Fahrzeuge', 'Auto kracht gegen Hindernis'],
  fahrzeug_schaden: ['Fahrzeuge', 'Auto nimmt Schaden'],
  fahrzeug_kaputt: ['Fahrzeuge', 'Auto geht kaputt'],
  // Essen, Feuer, Angeln, Fallen
  essen: ['Essen, Feuer, Angeln, Fallen', 'Essen'],
  trinken: ['Essen, Feuer, Angeln, Fallen', 'Trinken'],
  heilen: ['Essen, Feuer, Angeln, Fallen', 'Heilen (Verband/Medizin)'],
  feuer_an: ['Essen, Feuer, Angeln, Fallen', 'Lagerfeuer anzünden'],
  feuer_aus: ['Essen, Feuer, Angeln, Fallen', 'Lagerfeuer erlischt'],
  knistern: ['Essen, Feuer, Angeln, Fallen', 'Feuer knistert in der Nähe (zufällig)'],
  holz_nachlegen: ['Essen, Feuer, Angeln, Fallen', 'Holz ins Feuer legen'],
  brutzel: ['Essen, Feuer, Angeln, Fallen', 'Essen wird gekocht (Start)'],
  brutzeln: ['Essen, Feuer, Angeln, Fallen', 'Essen brutzelt (Dauergeräusch am Feuer)'],
  fertig: ['Essen, Feuer, Angeln, Fallen', 'Essen ist gar'],
  verbrannt: ['Essen, Feuer, Angeln, Fallen', 'Essen ist verkohlt'],
  angel_wurf: ['Essen, Feuer, Angeln, Fallen', 'Angel auswerfen'],
  angel_biss: ['Essen, Feuer, Angeln, Fallen', 'Fisch beißt an'],
  gefangen: ['Essen, Feuer, Angeln, Fallen', 'Fisch gefangen'],
  falle_auf: ['Essen, Feuer, Angeln, Fallen', 'Falle gespannt'],
  falle_zu: ['Essen, Feuer, Angeln, Fallen', 'Falle schnappt zu'],
  // Sonstiges
  level_auf: ['Sonstiges', 'Level-Aufstieg'],
};

export const ENDUNGEN = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'opus', 'flac'];
const DATEI = new RegExp(`^(.+?)(?:_(\\d+))?\\.(${ENDUNGEN.join('|')})$`, 'i');

/** "holz_faellen_2.ogg" → { ereignis: 'holz_faellen', nummer: 2 }; null wenn keine Audiodatei. */
export function parseDateiname(datei) {
  const m = DATEI.exec(datei);
  if (!m) return null;
  return { ereignis: m[1].toLowerCase(), nummer: m[2] === undefined ? 0 : Number(m[2]) };
}

/** Text "name zahl" (# = Kommentar) → { name: zahl }. Fehlerhafte Zeilen landen in warnungen. */
export function parseLautstaerke(text, warnungen = []) {
  const ergebnis = {};
  text.split(/\r?\n/).forEach((zeile, i) => {
    const s = zeile.replace(/#.*/, '').trim();
    if (!s) return;
    const teile = s.split(/[\s=:]+/);
    const zahl = Number(String(teile[1] ?? '').replace(',', '.').replace('%', ''));
    if (teile.length !== 2 || !Number.isFinite(zahl) || zahl < 0) {
      warnungen.push(`lautstaerke.txt Zeile ${i + 1}: "${zeile.trim()}" – erwartet "ereignis zahl" (0–100, darüber verstärkt)`);
      return;
    }
    ergebnis[teile[0].toLowerCase()] = Math.min(zahl, 300);
  });
  return ergebnis;
}

/**
 * Baut den Index für den Client: { ereignis: { dateien: [...], lautstaerke: 0..3 } }.
 * Nur Ereignisse mit eigenen Dateien ODER eigener Lautstärke tauchen auf.
 * Unbekannte Namen → Warnung (Tippfehler!), werden aber trotzdem aufgenommen.
 */
export function baueIndex(dateinamen, lautstaerkeText = '') {
  const warnungen = [];
  const index = {};
  const eintrag = (name) => (index[name] ??= { dateien: [], lautstaerke: 1 });
  for (const datei of [...dateinamen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const p = parseDateiname(datei);
    if (!p) continue;
    eintrag(p.ereignis).dateien.push(datei);
  }
  for (const [name, wert] of Object.entries(parseLautstaerke(lautstaerkeText, warnungen))) {
    eintrag(name).lautstaerke = wert / 100;
  }
  for (const name of Object.keys(index)) {
    if (!(name in EREIGNISSE)) warnungen.push(`Unbekanntes Ereignis "${name}" – Tippfehler? (Liste: eigene/README.md)`);
  }
  return { index, warnungen };
}

/** README-Tabelle der Ereignisse (Markdown), gruppiert. */
export function ereignisTabelle() {
  const zeilen = [];
  let gruppe = null;
  for (const [name, [g, text]] of Object.entries(EREIGNISSE)) {
    if (g !== gruppe) {
      gruppe = g;
      zeilen.push('', `### ${g}`, '', '| Dateiname (ohne Endung) | Wann? |', '|---|---|');
    }
    zeilen.push(`| \`${name}\` | ${text} |`);
  }
  return zeilen.join('\n');
}
