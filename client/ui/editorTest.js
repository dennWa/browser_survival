import { leseEditorTest } from './editorTestSpeicher.js';

/**
 * Testmodus des Map-Editors: `client/?editorTest=1` startet das Spiel lokal mit den Entwürfen, die der Editor in
 * IndexedDB (editorTestSpeicher.js) abgelegt hat – ohne Login-Bildschirm, ohne Repo-Änderung.
 * Banner oben: welche Zone getestet wird + „⟵ Zurück zum Editor“ (Entwürfe liegen im Editor-Speicher, nichts geht verloren).
 */
/** @returns { start, karten } oder null (kein Test / Daten kaputt) */
export async function ladeEditorTest(suche = location.search) {
  if (!new URLSearchParams(suche).has('editorTest')) return null;
  try {
    const t = await leseEditorTest();
    if (!t || typeof t.start !== 'string' || !t.karten?.[t.start]?.kacheln) return null;
    return t;
  } catch {
    return null;
  }
}

/** Banner mit Zurück-Knopf (touch-tauglich, oben mittig) */
export function zeigeTestBanner(dokument, test) {
  const banner = dokument.createElement('div');
  banner.id = 'editor-test-banner';
  banner.style.cssText = 'position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:60;display:flex;gap:8px;align-items:center;padding:6px 10px;background:rgba(20,24,30,0.88);border:1px solid #4caf50;border-radius:8px;color:#e4e7ec;font:600 13px system-ui;pointer-events:auto';
  const name = test.karten[test.start].name ?? test.start;
  banner.innerHTML = `<span>🧪 Editor-Test: ${String(name).replace(/[<>&]/g, '')}</span>`;
  const zurueck = dokument.createElement('a');
  zurueck.href = `../editor/?vonTest=${encodeURIComponent(test.start)}`;
  zurueck.textContent = '⟵ Zurück zum Editor';
  zurueck.style.cssText = 'color:#fff;background:#2e6b31;padding:6px 10px;border-radius:6px;text-decoration:none;min-height:30px;display:inline-flex;align-items:center';
  banner.append(zurueck);
  dokument.body.append(banner);
  return banner;
}
