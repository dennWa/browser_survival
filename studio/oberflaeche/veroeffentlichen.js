import { dialog, formular, melde, esc } from './dialoge.js';
import { icon } from './icons.js';

/**
 * „Veröffentlichen“-Dialog (Phase 4.6): zeigt die Änderungen im Spielordner, übernimmt auf Wunsch offene Zonen ins Spiel,
 * dann Tests → Commit → Push (studio/main/veroeffentlichen.mjs). GitHub Pages zeigt main nach ein paar Minuten.
 */
export async function oeffneVeroeffentlichen(studio) {
  const offen = [...studio.dok.zonen].filter(([, z]) => z.quelle !== 'vorlage' && z.karte.version !== z.gespeichertVersion);
  const st = await studio.nativ.aufruf('git.status');
  if (!st.gitDa) return melde('Veröffentlichen', 'Git ist auf diesem Rechner nicht installiert (oder nicht im PATH). Installiere Git und öffne das Studio neu.', 'fehler');
  const liste = st.aenderungen.slice(0, 60).map((a) => `<div class="neben"><b>${esc(a.art)}</b> ${esc(a.datei)}</div>`).join('') + (st.aenderungen.length > 60 ? `<div class="neben">… und ${st.aenderungen.length - 60} weitere</div>` : '');
  const f = formular([
    { art: 'hinweis', html: `Zweig <b>${esc(st.zweig)}</b>${st.zweig !== 'main' ? ' <span style="color:var(--gelb)">(nicht main – GitHub Pages zeigt main)</span>' : ''} · ${st.aenderungen.length} geänderte Datei(en):<div style="max-height:180px;overflow:auto;margin-top:6px">${liste || '<div class="neben">Keine Dateiänderungen.</div>'}</div>` },
    ...(offen.length ? [{ name: 'zonen', titel: 'Zonen', art: 'schalter', wert: true, text: `vorher ins Spiel übernehmen: ${offen.map(([id]) => id).join(', ')}` }] : []),
    { name: 'nachricht', titel: 'Beschreibung', wert: st.vorschlag, voll: true },
    { art: 'hinweis', html: 'Ablauf: Tests → Commit → neuesten Stand holen → hochladen. Schlägt ein Schritt fehl, wird nichts hochgeladen.' },
  ]);
  const w = await dialog({ titel: 'Veröffentlichen', icon: 'insSpiel', breit: true, inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Veröffentlichen', art: 'primaer', wert: () => f.werte() }] });
  if (!w) return null;
  try {
    if (w.zonen) for (const [id] of offen) {
      studio.hinweis(`Zone ${id} ins Spiel übernehmen …`);
      await studio.dok.insSpiel(id);
    }
    studio.hinweis('Tests laufen, dann Commit & Push … (dauert etwas)');
    const r = await studio.nativ.aufruf('git.veroeffentlichen', { nachricht: w.nachricht });
    const schritte = r.schritte.map((s) => `<div>${icon(s.ok ? 'pruefen' : 'fehler', 14)} <b>${esc(s.name)}</b>${s.ok ? '' : `<pre class="code" style="max-height:200px;overflow:auto;white-space:pre-wrap">${esc(s.ausgabe)}</pre>`}</div>`).join('');
    studio.hinweis(r.ok ? `Veröffentlicht: ${r.commit}` : 'Veröffentlichen fehlgeschlagen', r.ok ? 'erfolg' : 'fehler');
    await melde(r.ok ? 'Veröffentlicht' : 'Nicht veröffentlicht', `${schritte}${r.ok ? `<div style="margin-top:8px">Commit <code>${esc(r.commit)}</code> ist auf <b>${esc(r.zweig)}</b>. GitHub Pages braucht meist 1–3 Minuten.</div>` : ''}`, r.ok ? 'pruefen' : 'fehler');
    return r;
  } catch (f) {
    studio.hinweis(f.message, 'fehler');
    return null;
  }
}
