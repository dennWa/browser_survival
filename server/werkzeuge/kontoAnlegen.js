import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { BENUTZERNAME_MUSTER } from '../../gemeinsam/konstanten.js';
import { hashePasswort } from '../node/passwort.js';

/**
 * Legt einen Account an oder setzt das Passwort eines bestehenden neu.
 *   npm run konto -- <benutzername> <passwort> [--admin | --kein-admin]
 * --admin schaltet Admin-Befehle (Gottmodus …) frei, --kein-admin nimmt sie wieder weg.
 */
const DATEI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../daten/konten.json');

const argumente = process.argv.slice(2);
const adminSchalter = argumente.includes('--admin') ? true : argumente.includes('--kein-admin') ? false : null;
const [benutzername, passwort] = argumente.filter((a) => !a.startsWith('--'));
if (!benutzername || !passwort) {
  console.error('Aufruf: npm run konto -- <benutzername> <passwort> [--admin | --kein-admin]');
  process.exit(1);
}
if (!BENUTZERNAME_MUSTER.test(benutzername)) {
  console.error('Ungültiger Benutzername (2–20 Zeichen: Buchstaben, Ziffern, _ und -)');
  process.exit(1);
}
if (passwort.length < 6) {
  console.error('Passwort muss mindestens 6 Zeichen haben');
  process.exit(1);
}

let daten = { konten: [] };
try {
  daten = JSON.parse(await readFile(DATEI, 'utf8'));
} catch (fehler) {
  if (fehler.code !== 'ENOENT') throw fehler;
}

const passwortHash = await hashePasswort(passwort);
const vorhanden = daten.konten.find((k) => k.benutzername.toLowerCase() === benutzername.toLowerCase());
const konto = vorhanden ?? { benutzername, angelegt: new Date().toISOString() };
konto.passwortHash = passwortHash;
if (adminSchalter !== null) konto.admin = adminSchalter;
if (!vorhanden) daten.konten.push(konto);

await mkdir(path.dirname(DATEI), { recursive: true });
await writeFile(DATEI, JSON.stringify(daten, null, 2) + '\n');
console.info('\nFür einen Online-Server ohne Dateien (z. B. Render): Umgebungsvariable KONTEN_JSON =');
console.info(JSON.stringify({ konten: daten.konten.map(({ benutzername, passwortHash, admin }) => ({ benutzername, passwortHash, admin })) }));
console.info((vorhanden ? `Passwort für "${benutzername}" geändert.` : `Account "${benutzername}" angelegt.`) + (konto.admin ? ' (Admin)' : ''));
