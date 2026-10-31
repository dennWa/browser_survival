import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { erzeugeText, ZIEL } from '../werkzeuge/ki/kiAnleitung.mjs';

/** Runde 26: Die KI-Karten-Anleitung muss zum aktuellen Stand passen (neue Modelle/Sounds/Items/Kacheln → npm run ki:anleitung). */
test('KI_KARTEN_ANLEITUNG.md ist aktuell (sonst: npm run ki:anleitung)', () => {
  assert.equal(readFileSync(ZIEL, 'utf8'), erzeugeText());
});

test('Anleitung enthält Antwortformat, Beispiel und alle Katalog-Abschnitte', () => {
  const t = erzeugeText();
  for (const teil of ['## 4. So antwortest du', '"aktion":"bereich"', '### Kacheln', '### Objekttypen', '### Bauwerke', '### Prefabs', '### Loot-Tabellen', '### Items', '### Eigene 3D-Modelle', '### Sounds', '### Zonen-Werte', '`revolver`', '`kies`'.replace('kies', '%')]) assert.ok(t.includes(teil), teil);
});

test('Beispiel aus der Anleitung geht ohne Fehler durch den Editor-Import', async () => {
  const { ausDefinition } = await import('../editor/kern/format.js');
  const { leseKiAntwort, pruefeAenderungen } = await import('../editor/kern/kiImport.js');
  const def = (await import('../server/spiel/karten/waldweg.js')).WALDWEG;
  const json = erzeugeText().split('```json\n')[1].split('```')[0];
  const { karte } = ausDefinition(def);
  const r = pruefeAenderungen(karte, leseKiAntwort(json, karte), {});
  assert.equal(r.zaehler.ungueltig, 0, JSON.stringify(r.eintraege.filter((e) => e.art === 'ungueltig')));
  assert.ok(r.zaehler.neu >= 5);
});
