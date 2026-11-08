#!/usr/bin/env node
/**
 * KI-Werkzeug (Runde 45): Gliederung statt ganze Dateien lesen – spart Tokens.
 *
 *   npm run ki:gliederung -- <datei>        Funktionen/Klassen/Methoden mit Zeilennummer + 1. Doku-Zeile (JS/MJS, PY, MD-Überschriften)
 *   npm run ki:gliederung -- <ordner>       Dateien des Ordners (rekursiv) mit Zeilenzahl + erster Zeile des Kopfkommentars
 *   npm run ki:gliederung -- --wo <name>    Wo ist <name> DEFINIERT? (Teilwort, Groß/klein egal; nur Definitionen, keine Aufrufe)
 *   … -- --ohne-konst <datei>               wie oben, aber ohne GROSS_GESCHRIEBENE Konstanten (nur Funktionen/Klassen/Methoden)
 *
 * Danach gezielt lesen: `sed -n 'START,ENDEp' datei` bzw. Read mit offset/limit. Ein Eintrag gilt bis zur nächsten Zeile der Gliederung.
 * Kein echter Parser: Scanner kennt Strings, Template-Literale, Kommentare und Regex-Literale (Heuristik) – reicht für Ebene 0/1.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Beim rekursiven Durchsuchen übersprungen (generiert/fremd/Historie) – ausdrücklich angegebene Ordner werden trotzdem gelistet */
const AUSLASSEN = ['node_modules', '.git', 'client/vendor', 'client/assets', 'client/musik', 'client/audio/eigene', 'client/audio/samples', 'werkzeuge/test/ausgabe', 'werkzeuge/python-pakete', 'archiv', '.studio'];
const ENDUNGEN = new Set(['.js', '.mjs', '.py', '.md']);
const KEIN_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'with', 'else', 'do', 'try', 'new', 'typeof', 'await']);
const REGEX_DAVOR = /[(,=:[!&|?{};+\-*%<>~^]$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await|delete|throw)$/;

/** Ersetzt Strings/Kommentare/Regex durch Leerzeichen (Zeilenumbrüche bleiben) → Klammern zählen wird zuverlässig. */
function maskiere(text) {
  const aus = [];
  const tiefeTemplate = []; // Klammertiefe je offenem `${`
  let i = 0;
  let tiefe = 0;
  let letzte = ''; // letztes signifikantes Zeichen/Wort (für Regex-Erkennung)
  const weiter = (n) => {
    for (let k = 0; k < n; k++) aus.push(text[i + k] === '\n' ? '\n' : ' ');
    i += n;
  };
  const template = () => {
    // in einem Template-Literal: bis ` oder ${
    while (i < text.length) {
      if (text[i] === '\\') weiter(2);
      else if (text[i] === '`') return weiter(1);
      else if (text[i] === '$' && text[i + 1] === '{') {
        aus.push('${');
        i += 2;
        tiefeTemplate.push(tiefe);
        tiefe++;
        return;
      } else weiter(1);
    }
  };
  while (i < text.length) {
    const z = text[i];
    const n = text[i + 1];
    if (z === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') weiter(1);
    } else if (z === '/' && n === '*') {
      const ende = text.indexOf('*/', i + 2);
      weiter((ende < 0 ? text.length : ende + 2) - i);
    } else if (z === '"' || z === "'") {
      weiter(1);
      while (i < text.length && text[i] !== z && text[i] !== '\n') weiter(text[i] === '\\' ? 2 : 1);
      weiter(1);
      letzte = 'x';
    } else if (z === '`') {
      weiter(1);
      template();
      letzte = 'x';
    } else if (z === '/' && REGEX_DAVOR.test(letzte || '(')) {
      weiter(1);
      let klasse = false;
      while (i < text.length && text[i] !== '\n') {
        if (text[i] === '\\') weiter(2);
        else if (text[i] === '[') (klasse = true), weiter(1);
        else if (text[i] === ']') (klasse = false), weiter(1);
        else if (text[i] === '/' && !klasse) break;
        else weiter(1);
      }
      weiter(1);
      while (/[a-z]/.test(text[i] ?? '')) weiter(1);
      letzte = 'x';
    } else {
      if (z === '{') tiefe++;
      if (z === '}') {
        tiefe--;
        if (tiefeTemplate.length && tiefe === tiefeTemplate.at(-1)) {
          tiefeTemplate.pop();
          aus.push('}');
          i++;
          template();
          letzte = 'x';
          continue;
        }
      }
      aus.push(z);
      i++;
      if (!/\s/.test(z)) {
        if (/[\w$]/.test(z)) letzte = /[\w$]/.test(letzte.at(-1) ?? '') ? (letzte + z).slice(-12) : z;
        else letzte = z;
      }
    }
  }
  return aus.join('');
}

/** Erste Satz-Zeile eines JSDoc-/Zeilen-Kommentars direkt über Zeile `nr` (0-basiert) – oder Kommentar am Zeilenende. */
function dokuZeile(zeilen, nr) {
  const hinten = zeilen[nr].match(/\/\/\s*(.+)$/);
  let k = nr - 1;
  while (k >= 0 && zeilen[k].trim() === '') k--;
  if (k >= 0 && /\*\/\s*$/.test(zeilen[k])) {
    let start = k;
    while (start > 0 && !zeilen[start].includes('/**') && !zeilen[start].includes('/*')) start--;
    const text = zeilen
      .slice(start, k + 1)
      .join(' ')
      .replace(/\/\*\*?|\*\/|^\s*\*|\s\*\s/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }
  if (k >= 0 && /^\s*\/\/(.*)/.test(zeilen[k])) return zeilen[k].replace(/^\s*\/\/\s*/, '');
  return hinten ? hinten[1] : '';
}

const kurz = (text, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** Gliederung einer JS-Datei: [{ zeile, ebene, text }] */
function gliederungJs(text) {
  const zeilen = text.split('\n');
  const maske = maskiere(text).split('\n');
  const eintraege = [];
  let tiefe = 0;
  const klassen = []; // Tiefe des Klassenkörpers
  for (let nr = 0; nr < maske.length; nr++) {
    const m = maske[nr];
    const roh = zeilen[nr];
    const inKlasse = klassen.length && tiefe === klassen.at(-1);
    let treffer = null;
    if (tiefe === 0 || inKlasse) {
      const t = m.trim();
      let x;
      if ((x = t.match(/^(export\s+)?(default\s+)?class\s+([\w$]+)/))) treffer = { ebene: 0, name: `class ${x[3]}`, klasse: true };
      else if ((x = t.match(/^(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([\w$]+)\s*\(/))) treffer = { ebene: 0, name: `${x[1] ? 'export ' : ''}${x[4]}()` };
      else if (tiefe === 0 && (x = t.match(/^(export\s+)?(const|let|var)\s+([\w$]+)\s*=\s*(async\s+)?(\([^)]*\)|[\w$]+)\s*=>/))) treffer = { ebene: 0, name: `${x[1] ? 'export ' : ''}${x[3]}()` };
      else if (tiefe === 0 && (x = t.match(/^(export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=/))) treffer = { ebene: 0, name: `${x[1] ? 'export ' : ''}${x[2]}` };
      else if (inKlasse && (x = t.match(/^(static\s+)?(async\s+)?(get\s+|set\s+)?\*?(#?[\w$]+)\s*\([^)]*\)?\s*\{?/)) && !KEIN_NAME.has(x[4]))
        treffer = { ebene: 1, name: `${x[1] ?? ''}${x[3] ?? ''}${x[4]}()` };
    }
    if (treffer) {
      const doku = dokuZeile(zeilen, nr);
      eintraege.push({ zeile: nr + 1, ebene: treffer.ebene + (klassen.length && !treffer.klasse && treffer.ebene === 0 ? 0 : 0), text: treffer.name + (doku ? ` – ${kurz(doku)}` : '') });
      if (treffer.klasse) {
        // Klassenkörper beginnt mit der nächsten { auf dieser oder folgenden Zeilen
        klassen.push(tiefe + 1);
      }
    }
    for (const z of m) {
      if (z === '{') tiefe++;
      if (z === '}') {
        tiefe--;
        while (klassen.length && tiefe < klassen.at(-1)) klassen.pop();
      }
    }
    void roh;
  }
  return eintraege;
}

function gliederungPy(text) {
  return text.split('\n').flatMap((z, nr) => {
    const x = z.match(/^(\s*)(def|class)\s+([\w]+)/);
    if (!x) return [];
    return [{ zeile: nr + 1, ebene: x[1].length ? 1 : 0, text: `${x[2] === 'class' ? 'class ' : ''}${x[3]}${x[2] === 'def' ? '()' : ''}` }];
  });
}

function gliederungMd(text) {
  let imCode = false;
  return text.split('\n').flatMap((z, nr) => {
    if (z.startsWith('```')) imCode = !imCode;
    const x = !imCode && z.match(/^(#{1,4})\s+(.*)/);
    return x ? [{ zeile: nr + 1, ebene: x[1].length - 1, text: kurz(x[2], 100) }] : [];
  });
}

function gliederung(datei) {
  const text = readFileSync(datei, 'utf8');
  const endung = path.extname(datei);
  const liste = endung === '.py' ? gliederungPy(text) : endung === '.md' ? gliederungMd(text) : gliederungJs(text);
  return { zeilen: text.split('\n').length, liste };
}

/**
 * Erste aussagekräftige Zeile des Kopfkommentars: Kommentar ganz oben, sonst der erste MEHRZEILIGE /**-Block (Klassen-Doku
 * nach den Imports), sonst der erste Kommentar überhaupt. PY: Docstring/#, MD: erste Überschrift.
 */
function kopfZeile(datei) {
  const zeilen = readFileSync(datei, 'utf8').split('\n').slice(0, 120);
  const text = (z) =>
    z
      .replace(/^\s*(\/\*\*?|\*\/?|\/\/|#!.*|#+|"""|''')\s?/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^[╔║╚═\s]+|[╗║╝═\s]+$/g, '')
      .trim();
  const brauchbar = (t) => t && !/^(eslint|@ts-|-\*-|use strict)/.test(t) && !/^[-=*_]{3,}$/.test(t);
  const ersteAus = (start) => {
    for (let i = start; i < zeilen.length && i < start + 8; i++) {
      const t = text(zeilen[i]);
      if (brauchbar(t)) return kurz(t, 110);
      if (/\*\/\s*$/.test(zeilen[i]) && i > start) break;
    }
    return '';
  };
  const ersteCode = zeilen.findIndex((z) => z.trim() && !/^\s*(\/\*|\*|\/\/|#|"""|''')/.test(z));
  const istKommentar = (z) => /^\s*(\/\*|\*|\/\/|#|"""|''')/.test(z);
  if (ersteCode !== 0 && istKommentar(zeilen.find((z) => z.trim()) ?? '')) {
    const t = ersteAus(zeilen.findIndex((z) => z.trim()));
    if (t) return t;
  }
  const block = zeilen.findIndex((z, i) => /^\s*\/\*\*\s*$/.test(z) && /^\s*\*/.test(zeilen[i + 1] ?? ''));
  if (block >= 0) return ersteAus(block);
  const irgendeiner = zeilen.findIndex(istKommentar);
  return irgendeiner >= 0 ? ersteAus(irgendeiner) : '';
}

function dateienIn(ordner) {
  const aus = [];
  for (const name of readdirSync(ordner).sort()) {
    const p = path.join(ordner, name);
    if (name.startsWith('.') || AUSLASSEN.includes(path.relative(WURZEL, p).replaceAll(path.sep, '/'))) continue;
    if (statSync(p).isDirectory()) aus.push(...dateienIn(p));
    else if (ENDUNGEN.has(path.extname(name))) aus.push(p);
  }
  return aus;
}

const rel = (p) => path.relative(WURZEL, p) || '.';
const roheArgs = process.argv.slice(2);
const ohneKonst = roheArgs.includes('--ohne-konst');
const args = roheArgs.filter((a) => a !== '--ohne-konst');
if (!args.length) {
  console.log('Aufruf: npm run ki:gliederung -- <datei|ordner>  |  -- --wo <name>');
  process.exit(1);
}
if (args[0] === '--wo') {
  const such = (args[1] ?? '').toLowerCase();
  const basis = ['client', 'server', 'gemeinsam', 'editor', 'studio', 'werkzeuge'].map((o) => path.join(WURZEL, o));
  for (const datei of basis.flatMap(dateienIn).filter((d) => !d.endsWith('.md'))) {
    for (const e of gliederung(datei).liste) if (e.text.split(' – ')[0].toLowerCase().includes(such)) console.log(`${rel(datei)}:${e.zeile}  ${e.text}`);
  }
} else {
  for (const ziel of args) {
    const p = path.resolve(ziel);
    if (statSync(p).isDirectory()) {
      for (const datei of dateienIn(p)) console.log(`${String(readFileSync(datei, 'utf8').split('\n').length).padStart(5)}  ${rel(datei)}  ${kopfZeile(datei)}`);
    } else {
      const { zeilen, liste } = gliederung(p);
      console.log(`${rel(p)} (${zeilen} Zeilen)`);
      for (const e of liste) {
        if (ohneKonst && /^(export )?[A-Z][A-Z0-9_]+( |$)/.test(e.text)) continue;
        console.log(`${String(e.zeile).padStart(5)} ${'  '.repeat(e.ebene)}${e.text}`);
      }
    }
  }
}
