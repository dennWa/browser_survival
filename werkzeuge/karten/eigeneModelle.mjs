import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const KOPF = 'data:model/gltf-binary;base64,';

/**
 * Eingebettete 3D-Modelle (typ.glb, Data-URL aus dem Editor) → Dateien unter <clientOrdner>/assets/eigene/<karte>_<typ>.glb.
 * Der Typ bekommt danach nur noch den Pfad (glbDatei). Keine Lizenzprüfung (Nutzer-Entscheidung), aber Urheber/Lizenz
 * werden in assets/eigene/LIZENZEN.md festgehalten – fehlt die Lizenz, steht das dort ausdrücklich.
 * @returns {string[]} angelegte Pfade, relativ zu client/
 */
export function schreibeEigeneModelle(definition, clientOrdner) {
  const dateien = [];
  const lizenzZeilen = [];
  for (const [id, t] of Object.entries(definition.typen ?? {})) {
    if (!t.glb) continue;
    if (!/^[a-z0-9_]+$/.test(definition.id) || !/^[a-z0-9_]+$/.test(id)) throw new Error(`Modell „${id}“: Karten- und Typ-ID nur a–z, 0–9, _`);
    if (!t.glb.startsWith(KOPF)) throw new Error(`Modell „${id}“ ist keine .glb-Datei (binäres glTF)`);
    const relativ = `assets/eigene/${definition.id}_${id}.glb`;
    const ziel = path.join(clientOrdner, relativ);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, Buffer.from(t.glb.slice(KOPF.length), 'base64'));
    lizenzZeilen.push(`| ${relativ} | ${t.name ?? id} | ${t.urheber || '–'} | ${t.lizenz || '**keine Angabe**'} |`);
    delete t.glb;
    t.glbDatei = relativ;
    dateien.push(relativ);
  }
  if (lizenzZeilen.length) {
    const kopf = ['# Eigene 3D-Modelle – Urheber & Lizenzen', '', 'Vom Editor hochgeladen; die Rechte liegen bei der hochladenden Person.', '',
      '| Datei | Typ | Urheber | Lizenz |', '|---|---|---|---|'];
    writeFileSync(path.join(clientOrdner, 'assets/eigene/LIZENZEN.md'), [...kopf, ...lizenzZeilen].join('\n') + '\n', 'utf-8');
  }
  return dateien;
}
