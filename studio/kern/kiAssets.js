/**
 * KI-/MCP-Werkzeuge der Asset-Suche (Studio Phase 4.11) – Werkzeug-Liste: kiWerkzeuge.KI_ASSET_WERKZEUGE.
 * Suche/Download im Hauptprozess (studio/main/assetSuche.mjs), Import über studio.importiereAsset (oberflaeche/assetSuche.js):
 * Modelle → Werkstatt + speichern, Texturen → client/assets/eigene/texturen/, Klänge → Audio-Zentrale (Ereignis/Musik-Ordner).
 */
export function kiAssetWerkzeuge(studio) {
  const ok = (text, daten) => ({ ok: true, text, ...(daten !== undefined ? { daten } : {}) });
  return {
    asset_suchen: async ({ art = 'modell', quelle, text = '', seite = 0 }) => {
      const quellen = await studio.nativ.aufruf('quellen.info');
      if (!quellen[art]) throw new Error('art: modell, textur, klang');
      const q = quelle || Object.keys(quellen[art]).find((id) => !quellen[art][id].schluessel || quellen[art][id].hatSchluessel);
      if (!q) throw new Error(`Für ${art} ist keine Quelle ohne Schlüssel da – ein Mensch muss den API-Schlüssel eintragen (Datei → Im Internet suchen → Schlüssel)`);
      const r = await studio.nativ.aufruf('asset.suche', { art, quelle: q, text, seite });
      return ok(`${r.liste.length} Treffer bei ${quellen[art][q].name}${r.mehr ? ' (seite+1 für mehr)' : ''}. Import mit asset_importieren (quelle ${q}, id).`, r.liste.map(({ id, titel, urheber, lizenz, info }) => ({ id, titel, urheber, lizenz, info })));
    },
    asset_importieren: async ({ art, quelle, id, name, hoehe, ereignis, musik_ordner, ersetzen }) => {
      const ziel = art === 'klang' ? (ereignis ? { art: 'ereignis', ereignis, ersetzen: !!ersetzen } : musik_ordner ? { art: 'musik', ordner: musik_ordner } : null) : null;
      if (art === 'klang' && !ziel) throw new Error('Klang: ereignis oder musik_ordner angeben');
      return ok(await studio.importiereAsset({ art, quelle, id, name, hoehe, speichern: true, ziel }));
    },
    texturen_liste: async () => ok(null, await studio.nativ.aufruf('textur.liste')),
    modell_textur_setzen: async ({ material, textur }) => {
      if (!studio.werkstatt.offen) throw new Error('Modell-Werkstatt ist nicht offen – zuerst werkstatt_oeffnen');
      await studio.werkstatt.texturAusBibliothek(material, textur.replace(/^client\//, ''));
      return ok(`Textur ${textur} liegt auf „${material}“ (modell_speichern nicht vergessen).`);
    },
  };
}
