import { frageGemini } from '../kern/gemini.js';
import { kiAnfrage, kiErgebnis, rahmenUm, KI_AUFGABEN } from '../kern/kiPipeline.js';
import { findeLuecken, befundeText } from '../kern/lueckenfinder.js';
import { neueZone, ZONEN_ID_MUSTER, MAX_GROESSE } from '../kern/zone.js';
import { objektInfo } from '../kern/katalog.js';
import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { ladeEinstellungen } from './geminiUi.js';
import { dialog, esc } from './dialoge.js';

/**
 * KI-Aufgaben (Editor 2.0, Phase 9) – alle über die eine Pipeline (kern/kiPipeline.js):
 *   Senden NUR nach „Das wird gesendet“-Dialog → Antwort → Vorschau (kiUi.pruefeText, Geister auf der Karte) → Übernehmen = 1 Undo-Schritt.
 *   aktionen.textZuKarte()        9.2 Prompt → Aktionsliste mit Prefabs als Bausteine (markierter Bereich oder neue leere Zone)
 *   aktionen.lueckenfinder()      9.3 lokal (kern/lueckenfinder.js) → Liste + Markierungen → 🤖 erklären/priorisieren + Korrekturen
 *   aktionen.fehlerErklaeren(e)   9.4 ein Prüfungsfehler: 1 Satz + Korrektur, Kontext nur die Umgebung (±6 Kacheln)
 *   aktionen.lootBalance()        9.5 Loot gegen Schwierigkeit → Tabelle + Vorschlagswerte (wert/raum)
 *   aktionen.zonenThema()         9.6 „mach die Zone winterlich“ → bodenton/typtextur/wert gebündelt
 *   aktionen.beschriftung()       9.7 Namen für unbenannte Räume/Objekte/Übergänge/Loot-Zonen
 *   aktionen.releaseNotes(zeilen) 9.7 Beschreibung aus der Änderungsübersicht (Veröffentlichen-Dialog), nur Text
 * Schlüssel/Modell aus dem 🤖 Helfer (localStorage `browserSurvival.editorGemini`).
 */
export function kiAufgabenUi({ zustand, aktionen, zeichner, pruefeText, layout }) {
  const prefabs = () => aktionen.eigenePrefabs?.() ?? [];

  /** Pipeline: Kontext bauen → zeigen → senden → Ergebnis. null = abgebrochen/Fehler */
  async function fuehreAus({ aufgabe, frage, rechteck = null, extra = [], titel = KI_AUFGABEN[aufgabe].name, bestaetigen = true }) {
    const k = zustand.karte;
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler'), null;
    const einst = ladeEinstellungen();
    if (!einst.schluessel) {
      layout?.zeige('ki');
      zustand.meldung('Kein Gemini-Schlüssel – im 🤖 Helfer unter ⚙ eintragen', 'fehler');
      return null;
    }
    const { anfrage, kontext, gesendet } = kiAnfrage({ aufgabe, karte: k, frage, rechteck, prefabs: prefabs(), extra });
    // bestaetigen:false nur, wo der Aufrufer selbst anzeigt, was gesendet wird (Release-Notes im Veröffentlichen-Dialog)
    const ok = !bestaetigen || await dialog({
      titel: `🤖 ${titel}: Das wird gesendet`,
      html: `${kontext.gross ? `<p class="fehler">⚠ Großer Bereich (~${Math.round(kontext.zeichen / 1000)}k Zeichen): dauert länger, kostet mehr, Gemini kann ablehnen. Kein Limit – du entscheidest.</p>` : ''}<ul class="liste">${gesendet.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><details><summary>Kompletter Text (${kontext.zeichen} Zeichen)</summary><pre class="ki-gesendet">${esc(kontext.text)}\n\n---\n${esc(frage)}</pre></details>`,
      knoepfe: [{ text: 'Abbrechen', wert: false }, { text: '🤖 Senden', wert: true, art: 'akzent' }],
    });
    if (!ok) return null;
    zustand.meldung(`🤖 ${titel}: KI denkt nach …`);
    try {
      const { text } = await frageGemini({ schluessel: einst.schluessel, modell: einst.modell, anfrage });
      return { erg: kiErgebnis(k, text, { bereich: kontext.bereich, prefabs: prefabs() }), bereich: kontext.bereich, text };
    } catch (e) {
      zustand.meldung(`🤖 ${e.message}`, 'fehler');
      return null;
    }
  }

  /** Antwort zeigen; mit Vorschlag → Knopf „Vorschau“ (Geister auf der Karte, Übernehmen = 1 Undo-Schritt) */
  async function zeigeErgebnis(titel, r) {
    if (!r) return;
    const { erg, bereich } = r;
    const mitVorschlag = erg.vorschlag && !erg.fehler;
    const w = await dialog({
      titel: `🤖 ${titel}`,
      html: `<div class="ki-antwort">${esc(erg.antwort || '(keine Erklärung)').replace(/\n/g, '<br>')}</div>${erg.fehler ? `<p class="fehler">⚠ ${esc(erg.fehler)}</p>` : ''}${mitVorschlag ? `<p class="leise">${erg.vorschlag.anzahl} Änderungen vorgeschlagen – erst die Vorschau zeigt, was gültig ist.</p>` : ''}`,
      knoepfe: mitVorschlag ? [{ text: 'Verwerfen', wert: false }, { text: `🔍 Vorschau (${erg.vorschlag.anzahl})`, wert: true, art: 'akzent' }] : [{ text: 'OK', wert: false, art: 'akzent' }],
    });
    if (w) pruefeText(erg.vorschlag.json, bereich);
  }

  // --- 9.2 Text zu Karte -------------------------------------------------------------------------
  aktionen.textZuKarte = async () => {
    // 7.2: KI-Markierung (aus dem Chat, darf über die Zone ragen) hat Vorrang vor dem ⬚-Rahmen
    const markiert = aktionen.kiRechteck?.() ?? aktionen.auswahlBereich?.();
    const w = await dialog({
      titel: '🗺 Text zu Karte',
      html: `<p class="leise">Beschreibe, was entstehen soll. Die KI baut mit Prefabs, Wegen, Natur und Spawns – du siehst alles erst als Vorschau.</p>
        <textarea name="text" rows="4" placeholder="z. B. Ein kleines Dorf mit drei Häusern an einer Straße, Wald drumherum, ein paar Zombies am Waldrand"></textarea>
        <label class="feld"><span>Wo?</span><select name="wo"><option value="bereich"${markiert ? ' selected' : ''}${markiert ? '' : ' disabled'}>Markierter Bereich${markiert ? ` (${markiert.b} × ${markiert.h})` : ' (erst ⬚ markieren)'}</option><option value="neu"${markiert ? '' : ' selected'}>Neue leere Zone</option></select></label>
        <label class="feld"><span>Größe (neu)</span><span><input name="b" type="number" value="40" min="8" max="${MAX_GROESSE}" style="width:80px"> × <input name="h" type="number" value="30" min="8" max="${MAX_GROESSE}" style="width:80px"></span></label>
        <p class="leise">Kein Größenlimit – große Bereiche brauchen aber lange und kosten mehr (Gemini kann sehr große Anfragen ablehnen).</p>`,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Weiter', art: 'akzent', wert: (b) => ({ text: b.querySelector('[name=text]').value.trim(), wo: b.querySelector('[name=wo]').value, b: Number(b.querySelector('[name=b]').value), h: Number(b.querySelector('[name=h]').value) }) }],
    });
    if (!w?.text) return;
    let rechteck = markiert;
    if (w.wo === 'neu' || !rechteck) {
      // 7.1: kein KI-Limit mehr (früher 50 × 50) – nur die Zonengrenze des Editors
      const bb = Math.max(8, Math.min(MAX_GROESSE, Math.round(w.b) || 40));
      const hh = Math.max(8, Math.min(MAX_GROESSE, Math.round(w.h) || 30));
      let id = 'ki_zone';
      for (let n = 2; zustand.zonen.has(id); n++) id = `ki_zone_${n}`;
      if (!ZONEN_ID_MUSTER.test(id)) return;
      zustand.fuegeZoneHinzu(neueZone({ id, name: w.text.slice(0, 30), breite: bb, hoehe: hh }));
      zeichner.einpassen();
      rechteck = { x: 0, y: 0, b: bb, h: hh };
      zustand.auswahlRechteck = rechteck;
      zustand.melde('auswahl');
    }
    zeigeErgebnis('Text zu Karte', await fuehreAus({ aufgabe: 'textZuKarte', frage: w.text, rechteck }));
  };

  // --- 9.3 Lückenfinder --------------------------------------------------------------------------
  aktionen.lueckenfinder = async () => {
    const k = zustand.karte;
    if (!k) return;
    const befunde = findeLuecken(k);
    zeichner.ueberlagerungen = befunde.filter((b) => b.x !== null).map((b) => ({ rechteck: { x: b.x, y: b.y, b: 1, h: 1 }, farbe: '#ff8a3c', text: b.art }));
    zeichner.anfordern();
    const w = await dialog({
      titel: `🔎 Lückenfinder: ${befunde.length} Befunde`,
      html: befunde.length ? `<p class="leise">Lokal berechnet (Spiel-Regeln, Sichtlinie). Orange markiert auf der Karte. Die KI kann sie erklären, priorisieren und Korrekturen vorschlagen.</p><ul class="liste">${befunde.map((b) => `<li>${'❗'.repeat(b.gewicht)} ${esc(b.text)}${b.x !== null ? ` <span class="leise">(${b.x}|${b.y})</span>` : ''}</li>`).join('')}</ul>` : '<p>✓ Keine Lücken gefunden.</p>',
      knoepfe: befunde.length ? [{ text: 'Schließen', wert: false }, { text: '🤖 Erklären & Korrekturen', wert: true, art: 'akzent' }] : [{ text: 'OK', wert: false, art: 'akzent' }],
    });
    zeichner.ueberlagerungen = [];
    zeichner.anfordern();
    if (!w) return;
    const rechteck = rahmenUm(k, befunde.filter((b) => b.x !== null), { rand: 3 });
    zeigeErgebnis('Lückenfinder', await fuehreAus({ aufgabe: 'luecken', frage: 'Erkläre und priorisiere die Befunde, schlage Korrekturen vor.', rechteck, extra: [{ titel: 'Lokale Befunde', text: befundeText(befunde) }] }));
  };

  // --- 9.4 Fehler erklären -----------------------------------------------------------------------
  aktionen.fehlerErklaeren = async (eintrag) => {
    const k = zustand.karte;
    if (!k || !eintrag) return;
    const rechteck = eintrag.x !== null ? rahmenUm(k, [eintrag], { rand: 6 }) : null;
    zeigeErgebnis('Fehler erklärt', await fuehreAus({ aufgabe: 'fehler', frage: 'Was bedeutet der Fehler und wie behebe ich ihn?', rechteck, extra: [{ titel: 'Prüfungsfehler', text: `[${eintrag.schwere}/${eintrag.code}] ${eintrag.text}${eintrag.x !== null ? ` bei ${eintrag.x}|${eintrag.y}` : ''}` }] }));
  };

  // --- 9.5 Loot-Balance --------------------------------------------------------------------------
  aktionen.lootBalance = async () => {
    const k = zustand.karte;
    if (!k) return;
    zeigeErgebnis('Loot-Balance', await fuehreAus({ aufgabe: 'lootBalance', frage: 'Passt der Loot zur Schwierigkeit? Tabelle + Vorschlagswerte.', extra: [{ titel: 'Loot & Schwierigkeit', text: lootDaten(k) }] }));
  };

  // --- 9.6 Zonen-Themen --------------------------------------------------------------------------
  aktionen.zonenThema = async () => {
    const w = await dialog({
      titel: '🎨 Zonen-Thema',
      html: '<p class="leise">Die KI bündelt Bodentöne, Typ-Texturen, Wetter und Musik-Ordner – Vorschau, dann ein Undo-Schritt.</p><input name="thema" placeholder="z. B. winterlich, verregneter Herbst, verlassene Wüste">',
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Weiter', art: 'akzent', wert: (b) => b.querySelector('[name=thema]').value.trim() }],
    });
    if (!w) return;
    zeigeErgebnis('Zonen-Thema', await fuehreAus({ aufgabe: 'thema', frage: `Mach diese Zone: ${w}`, extra: [{ titel: 'Kacheln in der Zone', text: kachelZaehlung(zustand.karte) }] }));
  };

  // --- 9.7 Beschriftung --------------------------------------------------------------------------
  aktionen.beschriftung = async () => {
    const k = zustand.karte;
    if (!k) return;
    const liste = unbenannte(k);
    if (!liste.length) return zustand.meldung('Alles hat schon einen Namen ✓', 'ok');
    // Objekte/Übergänge mit Ort brauchen einen Bereich: der Rahmen um sie (falls klein genug)
    const rechteck = rahmenUm(k, liste.filter((e) => e.x !== undefined), { rand: 1 });
    zeigeErgebnis('Beschriftung', await fuehreAus({ aufgabe: 'beschriftung', frage: 'Schlage Namen vor.', rechteck, extra: [{ titel: 'Unbenannt', text: liste.map((e) => e.text).join('\n') }] }));
  };

  /** 9.7: Release-Notes (nur Text) aus der Änderungsübersicht – für den Veröffentlichen-Dialog */
  aktionen.releaseNotes = async (zeilen) => {
    const r = await fuehreAus({ aufgabe: 'beschriftung', frage: `Schreibe kurze Release-Notes (3–6 Stichpunkte, Deutsch, für Spieler verständlich) zu diesen Änderungen an der Zone. Keine Aktionen.\n${zeilen.map((z) => `- ${z}`).join('\n')}`, titel: 'Release-Notes', bestaetigen: false });
    return r?.erg.antwort ?? null;
  };
}

// --- Kontext-Bausteine (nur Zahlen/Listen, keine Kacheln) ---------------------------------------
function lootDaten(k) {
  const lootJeRaum = {};
  let zombies = 0;
  let horde = 0;
  for (const m of k.s('marker').values()) {
    if (m.art === 'loot') lootJeRaum[m.raum] = (lootJeRaum[m.raum] ?? 0) + 1;
    if (m.art === 'zombie') {
      zombies += m.anzahl ?? 1;
      if (m.horde) horde++;
    }
  }
  const z = STANDARD_KONFIGURATION.zombie;
  const l = STANDARD_KONFIGURATION.loot;
  return [
    `Zone ${k.breite} × ${k.hoehe} Kacheln.`,
    `Räume: ${[...k.s('raeume')].map(([b, r]) => `${b} „${r.name}“ Tabelle ${r.lootTabelle}, ${lootJeRaum[b] ?? 0} Punkte${r.spawnChance !== undefined ? `, spawnChance ${r.spawnChance}` : ''}${r.respawnZeit ? `, respawn ${r.respawnZeit}s` : ''}`).join('; ') || 'keine'}.`,
    `Loot-Zonen: ${[...k.s('lootZonen').values()].map((lz) => `„${lz.name}“ ${lz.punkte} Punkte, ${lz.eintraege?.length ?? 0} Items, ${lz.modus}`).join('; ') || 'keine'}.`,
    `Zombies: ${zombies} je Durchgang an Spawns (${horde} Horden-Punkte); Zonen-Werte zombie: ${JSON.stringify(k.wert('einstellungen.zombie') ?? {})}; loot: ${JSON.stringify(k.wert('einstellungen.loot') ?? {})}.`,
    `Spiel-Standard: zombie.respawnZeit ${z.respawnZeit}s, nachtHorde ${z.nachtHorde ?? '–'}, loot.spawnChance ${l.spawnChance}, loot.respawnZeit ${l.respawnZeit}s.`,
  ].join('\n');
}

function kachelZaehlung(k) {
  const n = {};
  for (const z of k.zellen) n[z] = (n[z] ?? 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([z, c]) => `"${z}" ×${c}`).join(', ');
}

function unbenannte(k) {
  const liste = [];
  if (!k.name || /^neue zone/i.test(k.name)) liste.push({ text: `Zone (id ${k.id}) heißt „${k.name}“` });
  for (const [b, r] of k.s('raeume')) if (!r.name || r.name === b || /^raum\b/i.test(r.name)) liste.push({ text: `Raum ${b}: „${r.name ?? ''}“ (Loot ${r.lootTabelle})` });
  for (const [id, u] of k.s('uebergaenge')) if (!u.name || u.name === u.ziel) liste.push({ text: `Übergang id ${id} nach ${u.ziel} bei ${u.x}|${u.y}`, x: u.x, y: u.y });
  for (const [id, z] of k.s('lootZonen')) if (/^Loot-Zone( \d+)?$/.test(z.name ?? '')) liste.push({ text: `Loot-Zone id ${id} „${z.name}“ bei ${z.x}|${z.y}`, x: z.x, y: z.y });
  let objekte = 0;
  for (const [id, o] of k.s('objekte')) {
    if (o.name || objekte >= 20 || ['baum', 'baum_herbst', 'busch', 'stein', 'gras'].includes(o.typ)) continue;
    objekte++;
    liste.push({ text: `Objekt id ${id}: ${objektInfo(o.typ, k).name} bei ${Math.floor(o.x)}|${Math.floor(o.y)}`, x: Math.floor(o.x), y: Math.floor(o.y) });
  }
  return liste;
}

