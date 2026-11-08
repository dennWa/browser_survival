/**
 * KI-Werkzeug (Runde 45): knapper Test-Reporter für `node --test` – bei Erfolg EINE Zeile, sonst nur die Fehlschläge
 * (Datei:Zeile, Name, Fehlermeldung). Spart gegenüber TAP/spec tausende Zeilen Ausgabe.
 * Aufruf über `npm run t [-- runde45 zonen]` (werkzeuge/ki/t.mjs).
 */
import path from 'node:path';

export default async function* kurzReporter(quelle) {
  let ok = 0;
  const fehler = [];
  const start = Date.now();
  for await (const { type, data } of quelle) {
    if (data?.details?.type === 'suite') continue;
    if (type === 'test:pass' && !data.skip && !data.todo) ok++;
    if (type === 'test:fail') {
      const e = data.details?.error;
      const ursache = e?.cause ?? e;
      const text = String(ursache?.message ?? ursache ?? 'unbekannter Fehler')
        .split('\n')
        .filter((z) => z.trim())
        .slice(0, 6)
        .join('\n    ');
      const ort = data.file ? `${path.relative(process.cwd(), data.file)}${data.line ? `:${data.line}` : ''}` : '';
      fehler.push(`✗ ${ort} ${data.name}\n    ${text}`);
    }
  }
  const dauer = ((Date.now() - start) / 1000).toFixed(1).replace('.', ',');
  if (!fehler.length) yield `✓ ${ok} Tests ok (${dauer} s)\n`;
  else yield `${fehler.join('\n')}\n✗ ${fehler.length} fehlgeschlagen, ${ok} ok (${dauer} s)\n`;
}
