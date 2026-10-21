/**
 * Nach dem Blender-Export: Der Knochen „Root“ hat dort die Bind-Pose des Blender-Imports (Figur läge ~5 m unter dem Boden).
 * Alle anderen Knochen stimmen mit dem Original überein → Root-Knoten und Root-Animationswerte aus der Quelldatei übernehmen.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function lies(datei) {
  const b = readFileSync(datei);
  const jsonLaenge = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLaenge).toString('utf8'));
  const binStart = 20 + jsonLaenge + 8;
  return { b, json, jsonLaenge, binStart };
}

export function repariereRoot(zielDatei, quelleDatei) {
  const q = lies(quelleDatei);
  const wurzel = q.json.nodes.find((n) => n.name === 'Root');
  const z = lies(zielDatei);
  const knoten = z.json.nodes.find((n) => n.name === 'Root');
  knoten.translation = wurzel.translation;
  knoten.rotation = wurzel.rotation;
  const konstanten = { translation: wurzel.translation, rotation: wurzel.rotation, scale: [1, 1, 1] };
  for (const anim of z.json.animations) {
    for (const kanal of anim.channels) {
      if (kanal.target.node !== z.json.nodes.indexOf(knoten)) continue;
      const wert = konstanten[kanal.target.path];
      const a = z.json.accessors[anim.samplers[kanal.sampler].output];
      const bv = z.json.bufferViews[a.bufferView];
      const start = z.binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
      for (let i = 0; i < a.count; i++) wert.forEach((x, k) => z.b.writeFloatLE(x, start + (i * wert.length + k) * 4));
      if (a.min) { a.min = [...wert]; a.max = [...wert]; }
    }
  }
  // JSON zurückschreiben (gleiche Länge nicht nötig: Chunk neu bauen)
  let neu = Buffer.from(JSON.stringify(z.json), 'utf8');
  neu = Buffer.concat([neu, Buffer.alloc((4 - (neu.length % 4)) % 4, 0x20)]);
  const rest = z.b.subarray(20 + z.jsonLaenge);
  const kopf = Buffer.from(z.b.subarray(0, 20));
  kopf.writeUInt32LE(neu.length, 12);
  const ganz = Buffer.concat([kopf, neu, rest]);
  ganz.writeUInt32LE(ganz.length, 8);
  writeFileSync(zielDatei, ganz);
}
