import { dialog, frage, esc } from './dialoge.js';
import { icon } from './icons.js';
import { setzeSpielordner } from '../../editor/kern/spielordner.js';

/**
 * Papierkorb-Dialog (Phase 4.5): gelöschte Modelle und Klänge (Projekt.papierkorb*, .studio/papierkorb/) zurückholen oder
 * endgültig löschen. Einträge leeren sich nach 20 Tagen von selbst (beim Studio-Start).
 */
export async function oeffnePapierkorb(studio) {
  const zeichne = async (el) => {
    const liste = await studio.nativ.aufruf('papierkorb.liste');
    el.innerHTML = liste.length
      ? liste.map((e) => `<div class="az-datei" style="min-height:32px">${icon(e.art === 'modell' ? 'modell' : 'audio', 15)}<span><b>${esc(e.name)}</b> <span class="neben">${esc(e.dateien.join(', '))} · gelöscht ${new Date(e.zeit).toLocaleString('de-DE')} · noch ${e.tageUebrig} Tag(e)</span></span><button class="knopf" data-zurueck="${esc(e.id)}">Zurückholen</button><button class="knopf flach" data-weg="${esc(e.id)}" title="Endgültig löschen">${icon('loeschen', 14)}</button></div>`).join('')
      : '<div class="insp-leer">Der Papierkorb ist leer.</div>';
  };
  const inhalt = document.createElement('div');
  inhalt.innerHTML = '<div class="hinweis-kasten" style="margin-bottom:8px">Gelöschte Modelle und Klänge bleiben hier 20 Tage, dann verschwinden sie beim nächsten Studio-Start endgültig. Der Papierkorb liegt in <code>.studio/papierkorb/</code> (nicht im Repo).</div><div id="korb-liste"></div>';
  const liste = inhalt.querySelector('#korb-liste');
  await zeichne(liste);
  liste.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-zurueck],[data-weg]');
    if (!t) return;
    try {
      if (t.dataset.zurueck) {
        const r = await studio.nativ.aufruf('papierkorb.wiederherstellen', { id: t.dataset.zurueck });
        studio.hinweis(`„${r.name}“ ist zurück`, 'erfolg');
        if (r.art === 'modell') setzeSpielordner(await studio.nativ.aufruf('projekt.modellIndex'));
        if (r.art === 'audio' && studio.audio?.daten) await studio.audio.ladeDaten();
        studio.assets.zeichne();
      } else if (await frage('Endgültig löschen?', 'Das lässt sich nicht rückgängig machen.', { ja: 'Löschen', gefahr: true })) await studio.nativ.aufruf('papierkorb.loeschen', { id: t.dataset.weg });
      await zeichne(liste);
    } catch (f) {
      studio.hinweis(String(f.message).replace(/^Error invoking remote method 'studio': (Error: )?/, ''), 'fehler');
    }
  });
  const w = await dialog({ titel: 'Papierkorb', icon: 'loeschen', breit: true, inhalt, knoepfe: [{ text: 'Papierkorb leeren', wert: 'leeren', art: 'gefahr' }, { text: 'Schließen', wert: null, art: 'primaer' }] });
  if (w === 'leeren' && (await frage('Papierkorb leeren?', 'Alle Einträge werden endgültig gelöscht.', { ja: 'Leeren', gefahr: true }))) {
    const n = await studio.nativ.aufruf('papierkorb.leeren');
    studio.hinweis(`${n} Einträge endgültig gelöscht`, 'erfolg');
  }
}
