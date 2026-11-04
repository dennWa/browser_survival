// Runde 32: Karten mit den neuen Modellen schmücken (Büsche, Felsen, Baumstümpfe, Stämme, Fässer, ein kleines Lager).
// Aufruf: node werkzeuge/karten/r32_deko.mjs   (idempotent: ersetzt den Block zwischen den Markierungen in der Kartendatei)
// Platzierung deterministisch (fester Zufall), nur auf freien Gras-Kacheln mit Abstand zu Wegen, Gebäuden und Objekten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const START = '    // ── Runde 32 Deko (werkzeuge/karten/r32_deko.mjs) START';
const ENDE = '    // ── Runde 32 Deko ENDE';
const TYP_START = '  // ── Runde 32 Deko-Typen START';
const TYP_ENDE = '  // ── Runde 32 Deko-Typen ENDE';

/** Spielordner-Typen (Modelle aus baue_r32.py): b/h = Grundfläche (Kacheln), hoehe3d = Höhe (Kacheln ≈ m) */
const TYPEN = {
  r32_fels_0: { b: 1.2, h: 1.3, hoehe3d: 0.8, blockiert: true },
  r32_fels_1: { b: 1.3, h: 1.2, hoehe3d: 0.85, blockiert: true },
  r32_fels_3: { b: 1.4, h: 1.4, hoehe3d: 0.7, blockiert: true },
  r32_fels_6: { b: 1.6, h: 1.6, hoehe3d: 0.55, blockiert: false },
  r32_fels_7: { b: 1.3, h: 1.0, hoehe3d: 0.5, blockiert: false },
  r32_stumpf_0: { b: 0.7, h: 0.8, hoehe3d: 0.9, blockiert: true },
  r32_stumpf_2: { b: 1.0, h: 1.0, hoehe3d: 0.9, blockiert: true },
  r32_stumpf_5: { b: 1.0, h: 1.2, hoehe3d: 0.8, blockiert: true },
  r32_stumpf_7: { b: 0.9, h: 0.7, hoehe3d: 1.0, blockiert: true },
  r32_eichenstamm: { b: 1.0, h: 2.5, hoehe3d: 1.0, blockiert: true },
  r32_fass_0: { b: 0.7, h: 0.7, hoehe3d: 1.0, blockiert: true },
  r32_fass_2: { b: 0.7, h: 0.7, hoehe3d: 1.0, blockiert: true },
  r32_fass_4: { b: 0.7, h: 0.7, hoehe3d: 1.0, blockiert: true },
  r32_zelt: { b: 2.2, h: 2.2, hoehe3d: 1.5, blockiert: true },
  r32_holzbau_8: { b: 0.8, h: 2.0, hoehe3d: 1.4, blockiert: true },
};

/** Was wohin: [Typ, Anzahl, Abstand zu Nicht-Gras (Kacheln)] */
const PLAN = {
  stadtrand: { buesche: 70, deko: [['r32_fels_0', 4, 3], ['r32_fels_1', 4, 3], ['r32_fels_3', 3, 3], ['r32_fels_6', 4, 2], ['r32_fels_7', 4, 2], ['r32_stumpf_0', 4, 2], ['r32_stumpf_2', 3, 2], ['r32_stumpf_5', 3, 2], ['r32_stumpf_7', 3, 2], ['r32_eichenstamm', 3, 3]], lager: true },
  waldweg: { buesche: 40, deko: [['r32_fels_0', 3, 2], ['r32_fels_3', 3, 2], ['r32_fels_7', 3, 2], ['r32_stumpf_2', 4, 2], ['r32_stumpf_5', 3, 2], ['r32_eichenstamm', 4, 2]], lager: false },
};

function zufall(saat) {
  let s = saat >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

async function schmuecke(datei, exportName, id) {
  const pfad = path.join(WURZEL, 'server', 'spiel', 'karten', datei);
  let text = fs.readFileSync(pfad, 'utf8').split(String.fromCharCode(13)).join('');
  // alten Block entfernen (idempotent)
  const weg = (t, a, b) => {
    const i = t.indexOf(a);
    if (i < 0) return t;
    const j = t.indexOf(b, i);
    return t.slice(0, i) + t.slice(t.indexOf('\n', j) + 1);
  };
  text = weg(weg(text, START, ENDE), TYP_START, TYP_ENDE);
  fs.writeFileSync(pfad, text);
  const karte = (await import(`${pathToFileURL(pfad).href}?t=${Date.now()}`))[exportName];
  const plan = PLAN[id];
  const H = karte.kacheln.length;
  const B = karte.kacheln[0].length;
  const belegt = Array.from({ length: H }, () => new Uint8Array(B));
  for (const o of karte.objekte) {
    for (let y = Math.floor(o.y) - 1; y <= Math.ceil(o.y + o.h); y++) for (let x = Math.floor(o.x) - 1; x <= Math.ceil(o.x + o.b); x++) if (y >= 0 && y < H && x >= 0 && x < B) belegt[y][x] = 1;
  }
  const gras = (x, y) => y >= 0 && y < H && x >= 0 && x < B && karte.kacheln[y][x] === ',';
  const frei = (x, y, w, h, rand) => {
    for (let yy = y - rand; yy < y + h + rand; yy++) for (let xx = x - rand; xx < x + w + rand; xx++) if (!gras(xx, yy)) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (belegt[yy][xx]) return false;
    return true;
  };
  const markiere = (x, y, w, h) => {
    for (let yy = y - 1; yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (yy >= 0 && yy < H && xx >= 0 && xx < B) belegt[yy][xx] = 1;
  };
  const z = zufall(id.length * 7919 + 32);
  const neu = [];
  const setze = (typ, w, h, rand, extra = {}) => {
    for (let versuch = 0; versuch < 4000; versuch++) {
      const x = Math.floor(z() * (B - w)), y = Math.floor(z() * (H - h));
      if (!frei(x, y, Math.ceil(w), Math.ceil(h), rand)) continue;
      markiere(x, y, Math.ceil(w), Math.ceil(h));
      neu.push({ typ, x, y, b: w, h, ...extra });
      return { x, y };
    }
    return null;
  };
  // Büsche (Ressource „busch“ → Äste), in kleinen Gruppen
  let buesche = 0;
  while (buesche < plan.buesche) {
    const kern = setze('busch', 1.5, 1.5, 1, { ebene: 'oben' });
    if (!kern) break;
    buesche++;
    for (let k = 0; k < 2 && buesche < plan.buesche; k++) {
      const x = kern.x + Math.round((z() - 0.5) * 6), y = kern.y + Math.round((z() - 0.5) * 6);
      if (!frei(x, y, 2, 2, 0)) continue;
      markiere(x, y, 2, 2);
      neu.push({ typ: 'busch', x, y, b: 1.5, h: 1.5, ebene: 'oben' });
      buesche++;
    }
  }
  for (const [typ, anzahl, rand] of plan.deko) {
    const t = TYPEN[typ];
    for (let i = 0; i < anzahl; i++) setze(typ, t.b, t.h, rand, { ...(t.blockiert ? { blockiert: true } : {}), drehung: [0, 90, 180, 270][Math.floor(z() * 4)] });
  }
  // Kleines verlassenes Lager: Zelt, Fässer, Stamm (zusammen, braucht 7 × 7 freies Gras)
  if (plan.lager) {
    const ort = setze('r32_zelt', 2.2, 2.2, 3, { blockiert: true, drehung: 0 });
    if (ort) {
      for (const [dx, dy, typ] of [[3, 0, 'r32_fass_0'], [3.8, 0.4, 'r32_fass_2'], [3.2, 1.2, 'r32_fass_4'], [-2, 3, 'r32_eichenstamm'], [1, 3.4, 'r32_holzbau_8']]) {
        const t = TYPEN[typ];
        neu.push({ typ, x: ort.x + dx, y: ort.y + dy, b: t.b, h: t.h, blockiert: true, drehung: typ === 'r32_eichenstamm' ? 90 : 0 });
      }
    }
  }
  const zeilen = neu.map((o) => `    ${JSON.stringify(o).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\w+: )/g, ', ').replace(/"/g, "'").replace(/^\{/, '{ ').replace(/\}$/, ' }')},`);
  const block = [START, ...zeilen, ENDE].join('\n') + '\n';
  // vor das Ende der objekte-Liste setzen
  const ende = text.indexOf('\n  ],\n', text.indexOf('  objekte: ['));
  text = text.slice(0, ende + 1) + block + text.slice(ende + 1);
  // Typen anhängen (typen: {...} vorhanden → hinein, sonst neu vor die letzte schließende Klammer)
  const benutzte = [...new Set(neu.map((o) => o.typ).filter((t) => TYPEN[t]))];
  const typZeilen = benutzte.map((t) => {
    const d = TYPEN[t];
    return `    ${t}: { name: '${t.replace('r32_', '').replace(/_/g, ' ')}', kategorie: 'Spielordner', b: ${d.b}, h: ${d.h}, hoehe3d: ${d.hoehe3d}, blockiert: ${!!d.blockiert}, farbe: '#80c080', glbDatei: 'assets/eigene/${t}.glb' },`;
  });
  if (text.includes('\n  typen: {\n')) {
    text = text.replace('\n  typen: {\n', `\n  typen: {\n${TYP_START}\n${typZeilen.join('\n')}\n${TYP_ENDE}\n`);
  } else {
    const schluss = text.lastIndexOf('\n};');
    text = text.slice(0, schluss) + `\n  typen: {\n${TYP_START}\n${typZeilen.join('\n')}\n${TYP_ENDE}\n  },` + text.slice(schluss);
  }
  fs.writeFileSync(pfad, text);
  console.log(`${datei}: ${neu.length} Objekte (${buesche} Büsche)`);
}

await schmuecke('stadtrand.js', 'STADTRAND', 'stadtrand');
await schmuecke('waldweg.js', 'WALDWEG', 'waldweg');
