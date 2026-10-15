import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Passwort-Hashing mit scrypt (in Node eingebaut, kein extra Paket nötig).
 * Format: "scrypt$<salt hex>$<hash hex>" – Klartext-Passwörter werden NIE gespeichert.
 */
const scryptAsync = promisify(scrypt);
const SCHLUESSEL_LAENGE = 64;

export async function hashePasswort(passwort) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(passwort, salt, SCHLUESSEL_LAENGE);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function pruefePasswort(passwort, gespeichert) {
  const [verfahren, saltHex, hashHex] = String(gespeichert).split('$');
  if (verfahren !== 'scrypt' || !saltHex || !hashHex) return false;
  const erwartet = Buffer.from(hashHex, 'hex');
  const berechnet = await scryptAsync(passwort, Buffer.from(saltHex, 'hex'), erwartet.length);
  return timingSafeEqual(erwartet, berechnet);
}
