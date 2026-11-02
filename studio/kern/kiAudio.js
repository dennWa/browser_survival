import { filtereKatalog } from '../../editor/kern/audioKatalog.js';
import { setzeSoundEinstellung } from '../../editor/kern/audioKatalog.js';

/**
 * KI-/MCP-Ausführung der Audio-Zentrale (Phase 2) – Werkzeug-Liste: kiWerkzeuge.KI_AUDIO_WERKZEUGE.
 * Dieselben Methoden wie die Oberfläche (studio.audio = audio/audioZentrale.js, .werk = audio/audioWerk.js); funktioniert
 * auch, wenn die Zentrale nicht offen ist (Daten werden bei Bedarf gelesen, Dekodieren im Studio-Fenster).
 */
export function kiAudioWerkzeuge(studio) {
  const ok = (text, daten) => ({ ok: true, text, ...(daten !== undefined ? { daten } : {}) });
  const z = async () => {
    const a = studio.audio;
    if (!a.daten) await a.ladeDaten();
    return a;
  };
  const kurz = (e) => ({ id: e.id, name: e.name, art: e.art, quelle: e.quelle, ...(e.ereignis ? { ereignis: e.ereignis } : {}), ...(e.ordner ? { ordner: e.ordner } : {}), pegel: e.pegel, dateien: e.dateien?.length ? e.dateien : undefined, ...(e.titel ? { titel: e.titel } : {}), ...(e.loop ? { schleife: true } : {}) });
  const analyse = async (a, pfad) => ({ pfad, ...a.werk.analyse(await a.werk.lade(pfad, { neu: true })) });

  return {
    audio_liste: async ({ suche, gruppe }) => {
      const a = await z();
      const l = filtereKatalog(a.katalog, { suche: suche ?? '', gruppe: gruppe || null });
      return ok(`${l.length} Einträge${l.length > 200 ? ' (erste 200)' : ''}`, l.slice(0, 200).map(kurz));
    },
    audio_dateien: async ({ suche }) => {
      const a = await z();
      const s = String(suche ?? '').toLowerCase();
      const l = a.dateien.filter((p) => !s || p.toLowerCase().includes(s));
      return ok(`${l.length} Dateien`, l.slice(0, 300));
    },
    audio_info: async ({ id, pfad }) => {
      const a = await z();
      if (pfad) return ok(null, await analyse(a, pfad));
      const e = a.eintrag(id);
      if (!e) throw new Error(`Eintrag „${id}“ gibt es nicht (audio_liste)`);
      const dateien = [];
      for (const p of (e.dateien ?? []).slice(0, 8)) dateien.push(await analyse(a, p).catch((f) => ({ pfad: p, fehler: f.message })));
      const zonen = e.ereignis ? (setzeSoundEinstellung(a.einst, e.ereignis, {})[e.ereignis]?.zonen ?? {}) : undefined;
      return ok(null, { ...kurz(e), wann: e.wann, wo: e.wo, streuung: e.streuung, verzoegerung: e.verzoegerung, maxDauer: e.maxDauer, einmal: e.einmal, zonen, musik: e.art === 'musikOrdner' ? a.musikEinst[e.ordner] ?? {} : undefined, analyse: dateien });
    },
    audio_zentrale_oeffnen: async ({ id }) => {
      const a = studio.audio;
      await a.oeffne(id && id !== 'mischpult' ? id : null);
      if (id === 'mischpult') a.waehle('mischpult');
      return ok('Audio-Zentrale offen.');
    },
    audio_einstellen: async ({ ereignis, lautstaerke, streuung, verzoegerung, max_dauer, einmal, zone, zonen_faktor }) => {
      const a = await z();
      const w = {};
      if (lautstaerke !== undefined) w.lautstaerke = Number(lautstaerke);
      if (streuung !== undefined) w.streuung = Number(streuung);
      if (verzoegerung !== undefined) w.verzoegerung = Number(verzoegerung);
      if (max_dauer !== undefined) w.maxDauer = Number(max_dauer);
      if (einmal !== undefined) w.einmal = !!einmal;
      if (zone) w.zonen = { ...(setzeSoundEinstellung(a.einst, ereignis, {})[ereignis]?.zonen ?? {}), [zone]: Number(zonen_faktor ?? 1) };
      await a.einstellen(ereignis, w);
      a.aktualisiere();
      return ok(`Gespeichert: ${JSON.stringify(setzeSoundEinstellung(a.einst, ereignis, {})[ereignis] ?? {})}`);
    },
    audio_schneiden: async (x) => {
      const a = await z();
      await a.bearbeite(x.pfad);
      const s = a.schnitt;
      const d = s.analyse.dauer;
      const e = { ...s.e };
      if (x.stille_weg) Object.assign(e, { start: Math.max(0, s.analyse.stilleAnfang - 0.01), ende: Math.min(d, d - s.analyse.stilleEnde + 0.02) });
      for (const [k, n] of [['start', 'start'], ['ende', 'ende'], ['fade_in', 'fadeIn'], ['fade_out', 'fadeOut'], ['gain_db', 'gainDb'], ['ueberblendung', 'ueberblendung']]) if (x[k] !== undefined) e[n] = Number(x[k]);
      for (const k of ['normalisieren', 'loop']) if (x[k] !== undefined) e[k] = !!x[k];
      const ziel = x.ziel === 'variante' || x.ziel === 'ersetzen' ? { art: 'ereignis', ereignis: x.ereignis, ersetzen: x.ziel === 'ersetzen' } : x.ziel === 'musik' ? { art: 'musik', ordner: x.musik_ordner, name: x.name } : { art: 'datei', pfad: x.pfad };
      if (ziel.art === 'ereignis' && !x.ereignis) throw new Error('ereignis fehlt');
      if (ziel.art === 'musik' && !x.musik_ordner) throw new Error('musik_ordner fehlt');
      const pfad = await a.speichereSchnitt(ziel, e);
      return ok(`Gespeichert: ${pfad}`, await analyse(a, pfad));
    },
    audio_zuordnen: async ({ pfad, ereignis, ersetzen }) => ok(`Zugeordnet: ${await (await z()).zuordnen(pfad, ereignis, { ersetzen: !!ersetzen })}`),
    musik_titel_hinzu: async ({ pfad, ordner, name }) => ok(`Titel: ${await (await z()).musikTitelHinzu(pfad, ordner, name)}`),
    musik_einstellen: async ({ ordner, zufall, ueberblendung, pause, reihenfolge }) => {
      const a = await z();
      await a.musikEinstellen(ordner, { ...(zufall !== undefined ? { zufall: !!zufall } : {}), ...(ueberblendung !== undefined ? { ueberblendung: Number(ueberblendung) } : {}), ...(pause !== undefined ? { pause: Number(pause) } : {}), ...(Array.isArray(reihenfolge) ? { reihenfolge } : {}) });
      return ok(`Musik-Ordner ${ordner}: ${JSON.stringify(a.musikEinst[ordner] ?? {})}`);
    },
    audio_loeschen: async ({ pfad }) => ok(`In den Papierkorb: ${(await (await z()).loesche(pfad)).papierkorb}`),
    mischpult: async ({ wetter, tageszeit, ort, zone, abspielen }) => {
      const a = await z();
      const w = {};
      if (wetter) w.wetter = wetter;
      if (tageszeit) w.tageszeit = tageszeit;
      if (ort) w.ort = ort;
      if (zone !== undefined) w.zone = zone;
      const m = a.mischpultZustand(w);
      if (abspielen !== undefined) a.mischpultAn(!!abspielen);
      a.aktualisiere();
      return ok(`Aktiv: ${m.schichten.filter((s) => s.aktiv).map((s) => `${s.name} ${Math.round(s.staerke * 100)} %`).join(', ') || 'nichts'}`, m);
    },
  };
}
