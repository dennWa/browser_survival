import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { BENUTZERNAME_MUSTER } from '../../gemeinsam/konstanten.js';
import { hashePasswort } from '../node/passwort.js';

/**
 * Legt einen Account an oder setzt das Passwort eines bestehenden neu.
 *   npm run konto -- <benutzername> <passwort>
 */
const DATEI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../daten/konten.json');

const [benutzername, passwort] = process.argv.slice(2);
if (!benutzername || !passwort) {
  console.error('Aufruf: npm run konto -- <benutzername> <passwort>');
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
if (vorhanden) vorhanden.passwortHash = passwortHash;
else daten.konten.push({ benutzername, passwortHash, angelegt: new Date().toISOString() });

await mkdir(path.dirname(DATEI), { recursive: true });
await writeFile(DATEI, JSON.stringify(daten, null, 2) + '\n');
console.info(vorhanden ? `Passwort für "${benutzername}" geändert.` : `Account "${benutzername}" angelegt.`);
