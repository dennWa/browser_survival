/**
 * Speicher für den Editor-Testlauf (client/?editorTest=1). IndexedDB statt localStorage: eingebettete 3D-Modelle
 * (.glb, bis 8 MB) sprengen die ~5 MB von localStorage. Der Editor schreibt, das Spiel liest – beide laufen im selben Browser.
 */
const DB_NAME = 'browserSurvival.editorTest';
const STORE = 'daten';
const SCHLUESSEL = 'test';
/** Alter Speicherort (vor IndexedDB) – wird beim Schreiben aufgeräumt, damit er nicht den Platz belegt */
const ALTER_SCHLUESSEL = 'browserSurvival.editorTest';

function oeffne() {
  return new Promise((ok, fehler) => {
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE);
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

/** Eine Anfrage in einer Transaktion; wirft, wenn der Speicher voll oder gesperrt ist. */
async function transaktion(modus, aufgabe) {
  const db = await oeffne();
  try {
    return await new Promise((ok, fehler) => {
      const tx = db.transaction(STORE, modus);
      const anfrage = aufgabe(tx.objectStore(STORE));
      tx.oncomplete = () => ok(anfrage.result);
      tx.onerror = () => fehler(tx.error);
      tx.onabort = () => fehler(tx.error ?? new Error('Speicher abgebrochen'));
    });
  } finally {
    db.close();
  }
}

/** Testdaten ablegen. Wirft, wenn der Browser das nicht erlaubt (Privatmodus, Speicher voll). */
export async function speichereEditorTest(daten) {
  await transaktion('readwrite', (s) => s.put(daten, SCHLUESSEL));
  try {
    localStorage.removeItem(ALTER_SCHLUESSEL);
  } catch {
    // Aufräumen ist nur Kür
  }
}

/** Testdaten lesen oder null, wenn keine da sind. */
export async function leseEditorTest() {
  return (await transaktion('readonly', (s) => s.get(SCHLUESSEL))) ?? null;
}
