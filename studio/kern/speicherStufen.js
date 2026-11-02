/**
 * Speicher-Stufen einer Zone (Studio Phase 4.14) – rein, ohne DOM. Macht sichtbar, WO ein Stand gerade liegt:
 *   ① entwurf  Arbeitsstand in <Spielordner>/.studio/entwuerfe/ (Strg+S) – nur im Studio sichtbar
 *   ② spiel    Kartendatei server/spiel/karten/<id>.js geschrieben (Strg+Umschalt+E) – lokales Spiel/Testlauf hat sie
 *   ③ online   committet + gepusht (Strg+Umschalt+P) – GitHub Pages zeigt sie nach 1–3 Minuten
 * speicherStufen({ quelle, version, gespeichertVersion, git }) → { stufen: [{ id, titel, stand: 'ok'|'offen'|'unbekannt', text }], naechster }
 *   quelle: 'neu' | 'entwurf' | 'spiel' | 'vorlage' (dokument.js) · git: { zoneGeaendert, voraus } | null (unbekannt/kein Git)
 *   naechster: Befehls-ID des nächsten sinnvollen Schritts (zone.speichern | zone.insSpiel | projekt.veroeffentlichen) oder null
 */
export const STUFEN = Object.freeze([
  { id: 'entwurf', titel: 'Entwurf', befehl: 'zone.speichern', taste: 'Strg+S', erklaerung: 'Dein Arbeitsstand. Liegt nur im Studio (.studio/entwuerfe/), das Spiel merkt davon nichts. Gut zum Zwischenspeichern.' },
  { id: 'spiel', titel: 'Im Spiel', befehl: 'zone.insSpiel', taste: 'Strg+Umschalt+E', erklaerung: 'Schreibt die Kartendatei ins Spiel (server/spiel/karten/). Ab jetzt spielst du sie lokal und im Testlauf.' },
  { id: 'online', titel: 'Online', befehl: 'projekt.veroeffentlichen', taste: 'Strg+Umschalt+P', erklaerung: 'Tests → Commit → Push. Nach 1–3 Minuten ist die Zone auf der Spiel-Webseite für alle da.' },
]);

export function speicherStufen({ quelle, version, gespeichertVersion, git = null }) {
  const gesichert = version === gespeichertVersion;
  if (quelle === 'vorlage') {
    return { stufen: [{ id: 'entwurf', titel: 'Vorlage', stand: gesichert ? 'ok' : 'offen', text: gesichert ? 'Vorlage gespeichert' : 'Vorlage nicht gespeichert' }], naechster: gesichert ? null : 'zone.speichern' };
  }
  const imSpiel = quelle === 'spiel' && gesichert;
  const entwurf = gesichert
    ? { stand: 'ok', text: quelle === 'spiel' ? 'Gleich wie im Spiel – kein Entwurf nötig' : 'Entwurf gespeichert' }
    : { stand: 'offen', text: 'Ungespeicherte Änderungen' };
  const spiel = imSpiel ? { stand: 'ok', text: 'Kartendatei ist im Spiel' } : { stand: 'offen', text: quelle === 'neu' || (quelle === 'entwurf' && gesichert) ? 'Noch nicht im Spiel' : 'Spiel hat einen älteren Stand' };
  let online;
  if (!git) online = { stand: 'unbekannt', text: 'Git-Stand unbekannt' };
  else if (imSpiel && !git.zoneGeaendert && !git.voraus) online = { stand: 'ok', text: 'Veröffentlicht' };
  else if (imSpiel && !git.zoneGeaendert && git.voraus) online = { stand: 'offen', text: `${git.voraus} Commit(s) noch nicht hochgeladen` };
  else online = { stand: 'offen', text: imSpiel ? 'Kartendatei noch nicht veröffentlicht' : 'Erst ins Spiel übernehmen' };
  const stufen = STUFEN.map((s, i) => ({ id: s.id, titel: s.titel, ...[entwurf, spiel, online][i] }));
  const naechster = !gesichert ? 'zone.speichern' : !imSpiel ? 'zone.insSpiel' : online.stand === 'offen' ? 'projekt.veroeffentlichen' : null;
  return { stufen, naechster };
}

/** Git-Status (veroeffentlichen.status) → { zoneGeaendert, voraus } für eine Zone */
export function gitStandFuerZone(st, id) {
  if (!st?.gitDa) return null;
  const datei = `server/spiel/karten/${id}.js`;
  return { zoneGeaendert: st.aenderungen.some((a) => a.datei === datei), voraus: st.voraus ?? 0 };
}
