import { spielordnerTyp } from '../../editor/kern/spielordner.js';

/**
 * KI-/MCP-Ausführung der Modell-Werkstatt (Phase 3) – Werkzeug-Liste: kiWerkzeuge.KI_MODELL_WERKZEUGE.
 * Alle Werkzeuge rufen dieselben Methoden wie die Oberfläche (studio.werkstatt = werkstatt/werkstatt.js, .werk = modellWerk.js)
 * → jeder Aufruf ist ein Undo-Schritt der Werkstatt und sofort in der Bühne sichtbar. Öffnet bei Bedarf die Werkstatt nicht
 * von selbst (außer werkstatt_oeffnen) – die KI soll bewusst laden, damit nichts Ungespeichertes verloren geht.
 * @returns { name: (argumente) → Ergebnis { ok, text?, daten?, bild? } }
 */
export function kiModellWerkzeuge(studio) {
  const ok = (text, daten) => ({ ok: true, text, ...(daten !== undefined ? { daten } : {}) });
  const ws = () => studio.werkstatt;
  const werk = () => {
    const w = ws();
    if (!w.offen || !w.werk?.eintrag) throw new Error('Modell-Werkstatt ist nicht offen – zuerst werkstatt_oeffnen');
    return w.werk;
  };
  const kurz = (e) => ({ modell: e.datei.replace(/\.glb$/, ''), name: e.name, bereich: e.kategorie, hoehe: e.zielHoehe ?? e.masse?.hoehe, ...(e.blockiert === false ? { kollision: false } : {}), ...(e.ebene ? { ebene: e.ebene } : {}), ...(e.leerlauf ? { leerlauf: e.leerlauf } : {}) });

  return {
    modelle_liste: async ({ suche, bereich }) => {
      const index = await studio.nativ.aufruf('projekt.modellIndex');
      const s = String(suche ?? '').trim().toLowerCase();
      const liste = index.filter((e) => (!bereich || e.kategorie === bereich) && (!s || `${e.name} ${e.datei}`.toLowerCase().includes(s)));
      return ok(`${liste.length} Modelle${liste.length > 150 ? ' (erste 150)' : ''}`, liste.slice(0, 150).map(kurz));
    },
    werkstatt_oeffnen: async ({ modell, neu }) => {
      const w = ws();
      await w.oeffne();
      if (neu) await w.neu(String(neu), { ohneFrage: true });
      else if (modell) await w.lade(String(modell).replace(/\.glb$/, ''), { ohneFrage: true });
      return ok(`Werkstatt offen: „${w.werk.eintrag.name}“ (${w.stem ? `${w.stem}.glb` : 'neu, ungespeichert'}).`, w.werk.info());
    },
    werkstatt_schliessen: async () => {
      const w = ws();
      w.el.classList.remove('offen');
      w.offen = false;
      w.werk?.halte();
      return ok('Werkstatt geschlossen.');
    },
    modell_info: () => {
      const w = werk();
      const e = w.eintrag;
      return ok(null, {
        modell: ws().stem,
        name: e.name,
        bereich: e.kategorie,
        spiel: { hoehe: w.spielHoehe, kollision: e.blockiert !== false && e.ebene !== 'oben', ebene: e.ebene ?? 'moebel', grundflaeche: w.grundflaeche(), grundflaecheEigen: !!e.fuss, leerlauf: w.leerlauf || null },
        info: w.info(),
        teile: w.teile().map((t) => ({ ...t, ...(t.art !== 'knochen' ? w.lage(t.uuid) : {}) })),
        materialien: w.materialien(),
        animationen: w.animationen(),
        benutztIn: ws().verwendung(),
        ungespeichert: ws().geaendert,
      });
    },
    modell_einstellen: (a) => {
      const w = werk();
      w.stoppeAnimation(); // Maße in Ruhepose
      const f = {};
      if (a.hoehe !== undefined) f.zielHoehe = a.hoehe;
      if (a.kollision !== undefined) f.blockiert = a.kollision ? null : false;
      if (a.ebene) f.ebene = a.ebene;
      if (a.grundflaeche_auto) f.fuss = null;
      else if (a.grundflaeche_b !== undefined || a.grundflaeche_t !== undefined) {
        const fl = w.grundflaeche();
        f.fuss = { b: a.grundflaeche_b ?? fl.b, h: a.grundflaeche_t ?? fl.h };
        f.zielHoehe ??= w.spielHoehe;
      }
      if (a.name) f.name = a.name;
      if (a.bereich) f.kategorie = a.bereich;
      if (a.urheber !== undefined) f.urheber = a.urheber;
      if (a.lizenz !== undefined) f.lizenz = a.lizenz;
      if (a.quelle !== undefined) f.url = a.quelle;
      ws().einstellen(f);
      return ok(`Eingestellt (gilt nach modell_speichern): Höhe ${w.spielHoehe} m, Grundfläche ${w.grundflaeche().b} × ${w.grundflaeche().h} Kacheln.`);
    },
    modell_teil_hinzu: ({ form, name, groesse, position, drehung, farbe, eltern }) => ok(`Teil „${werk().teilHinzu(form, { name, groesse, position, drehung, farbe, eltern })}“ angefügt.`),
    modell_teil_aendern: (a) => {
      const w = werk();
      let ref = a.teil;
      if (a.position || a.drehung || a.groesse) w.setzeLage(ref, { position: a.position, drehung: a.drehung, groesse: a.groesse });
      if (a.name) ref = w.teilUmbenennen(ref, a.name);
      if (a.sichtbar !== undefined) w.teilSichtbar(ref, a.sichtbar);
      if (a.eltern !== undefined) w.teilAnhaengen(ref, a.eltern || null);
      return ok(`Teil „${ref}“ geändert.`, w.lage(ref));
    },
    modell_teil_loeschen: ({ teil }) => {
      werk().teilLoeschen(teil);
      return ok(`Teil „${teil}“ gelöscht.`);
    },
    modell_teil_duplizieren: ({ teil }) => ok(`Kopie „${werk().teilDuplizieren(teil)}“ angelegt.`),
    modell_material: ({ material, farbe, rauheit, metall, eigenes }) => {
      const w = werk();
      if (eigenes) w.eigenesMaterial(material);
      w.setzeMaterial(material, { farbe, rauheit, metall });
      return ok('Material geändert.');
    },
    modell_farbton: ({ grad = 0, saettigung = 1, helligkeit = 1 }) => {
      werk().farbton(Number(grad) || 0, Number(saettigung) || 1, Number(helligkeit) || 1);
      return ok('Farben verschoben.');
    },
    modell_ausrichten: ({ aktion, achse, winkel }) => {
      const w = werk();
      if (aktion === 'drehen') w.drehen(achse || 'y', Number(winkel) || 90);
      else if (aktion === 'spiegeln') w.spiegeln(achse || 'x');
      else if (aktion === 'ursprung') w.ursprungUntenMitte();
      else throw new Error('aktion: drehen, spiegeln, ursprung');
      return ok('Ausgerichtet.');
    },
    modell_animation: ({ aktion, art, teil, achse, dauer, staerke, name }) => {
      const w = werk();
      if (aktion === 'neu') {
        const clip = w.animationHinzu({ art: art || 'drehen', teil: teil || null, achse, dauer, staerke });
        w.spieleAnimation(clip);
        return ok(`Animation „${clip}“ angelegt (läuft im Spiel als Leerlauf, Vorschau läuft).`);
      }
      if (aktion === 'loeschen') w.animationLoeschen(name);
      else if (aktion === 'leerlauf') w.setzeLeerlauf(name || '');
      else if (aktion === 'abspielen') w.spieleAnimation(name);
      else if (aktion === 'stopp') w.stoppeAnimation();
      else throw new Error('aktion: neu, loeschen, leerlauf, abspielen, stopp');
      return ok('Erledigt.', w.animationen());
    },
    modell_knochen: ({ aktion, an, kante, name, knochen, teil, laenge }) => {
      const w = werk();
      if (aktion === 'liste') return ok(null, w.knochen());
      if (aktion === 'neu') return ok(`Knochen „${w.knochenHinzu({ an: an || null, kante: kante || 'unten', name, laenge })}“ angelegt.`, w.knochen());
      if (aktion === 'binden') {
        w.knochenBinden(knochen, teil);
        return ok(`„${teil}“ hängt an „${knochen}“.`);
      }
      if (aktion === 'laenge') {
        w.knochenLaenge(knochen, laenge);
        return ok('Länge gesetzt.');
      }
      if (aktion === 'loeschen') {
        w.knochenLoeschen(knochen);
        return ok('Knochen gelöscht (Kinder hängen am Eltern-Knoten).');
      }
      throw new Error('aktion: liste, neu, binden, laenge, loeschen');
    },
    modell_keyframe: ({ aktion, clip, zeit = 0, dauer = 2, knoten }) => {
      const w = werk();
      if (aktion === 'clip_neu') return ok(`Clip „${w.clipNeu(clip || 'Eigene Animation', dauer)}“ angelegt.`);
      if (aktion === 'setzen') return ok(`Keyframe bei ${zeit} s. Schlüssel: ${w.keyframeSetzen(clip, zeit, knoten?.length ? knoten : null).join(', ')} s`);
      if (aktion === 'loeschen') {
        w.keyframeLoeschen(clip, zeit);
        return ok('Keyframe gelöscht.');
      }
      if (aktion === 'zeige') {
        w.zeigeZeit(clip, zeit);
        return ok(`Pose bei ${zeit} s liegt auf dem Modell.`);
      }
      if (aktion === 'zeiten') return ok(null, w.keyframeZeiten(clip));
      throw new Error('aktion: clip_neu, setzen, loeschen, zeige, zeiten');
    },
    modell_textur_effekt: ({ art, staerke = 0.5, material, farbe }) => {
      const n = werk().texturEffekt(material || null, art, { staerke: Number(staerke), farbe, saat: Math.floor(Math.random() * 1000) });
      return ok(n ? `Effekt „${art}“ auf ${n} Material(ien).` : 'Kein Material passte (Teile ohne UV: nur dunkler/faerben/verblassen).');
    },
    modell_malen: ({ teil, punkte, farbe = '#7a0d0d', groesse = 24, deckkraft = 0.8 }) => {
      werk().maleUv(teil, punkte ?? [], { farbe, groesse, deckkraft });
      return ok(`${punkte?.length ?? 0} Pinselpunkte gemalt.`);
    },
    modell_bild: async ({ blick }) => {
      const w = werk();
      if (blick) w.blick(blick);
      await new Promise((r) => setTimeout(r, 120));
      return { ok: true, text: `Bühne (${blick || 'aktuell'}): ${JSON.stringify(w.info())}`, bild: w.bild() };
    },
    modell_rueckgaengig: ({ wiederholen }) => {
      const w = werk();
      const r = wiederholen ? w.wiederholen() : w.rueckgaengig();
      return ok(r ? 'Erledigt.' : 'Nichts zu tun.');
    },
    modell_loeschen: async ({ bestaetigt }) => {
      werk();
      if (!bestaetigt) throw new Error('bestaetigt = true nötig');
      const stem = ws().stem;
      const v = ws().verwendung();
      await ws().loesche();
      return ok(`${stem}.glb ist im Papierkorb${v.length ? ` (war benutzt in: ${v.map((x) => x.zone).join(', ')})` : ''}.`);
    },
    modell_speichern: async ({ als_kopie }) => {
      werk();
      const text = await ws().speichere({ kopie: als_kopie || null });
      const typ = spielordnerTyp(ws().stem);
      return ok(`${text}. Im Karten-Editor: objekt_platzieren id=modell:${ws().stem}${typ ? ` (Grundfläche ${typ.b} × ${typ.h})` : ''}.`);
    },
  };
}
