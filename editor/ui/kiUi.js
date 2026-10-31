import { ausschnitt, ausschnittText, bereichText, bereichsPruefsumme } from '../kern/ausschnitt.js';
import { leseKiAntwort, pruefeAenderungen, eintragRechteck } from '../kern/kiImport.js';
import { randFuer, verschiebeAktionen, rechteckAusBereich } from '../kern/kiSchutz.js';
import { dialog, esc } from './dialoge.js';
import { herunterladen, dateiWaehlen } from './speicher.js';

/**
 * KI-Arbeit (Phase 8): Ausschnitt-Export (markierter Bereich → Text/JSON für eine KI) und KI-Import mit Vorschau.
 * Import-Ablauf: Antwort einfügen → Prüfen → Reiter „KI-Import“ zeigt den Diff (＋ neu grün, － weg rot, ～ geändert gelb,
 * ✗ ungültig orange, mit Grund) und hebt alles auf der Karte hervor → erst „Übernehmen“ ändert die Karte (1 Verlaufsschritt).
 * Runde 19: Export nimmt zuerst den KI-Bereich (Rechtsklick → ⬚ KI-Bereich; darf über die Zone ragen), dann die ⬚-Auswahl,
 * sonst die ganze Zone – mit Feld „Dein Auftrag“ und den geschützten Flächen (🛡). Einfügen (Datei → 📥 KI-Bereich einfügen):
 * Zone kommt aus der Antwort (wechselt dorthin), Bereich aus der Antwort bzw. dem KI-Bereich; ragt er über die Zone, wächst die
 * Zone erst (eigener Verlaufsschritt) und die Aktionen werden umgerechnet. Geschützte Flächen (Sitzung + Antwort) sind tabu.
 */
const FARBE = { neu: '#4caf50', weg: '#e5484d', aendern: '#f5b83d', ungueltig: '#ff8a3c' };
const ZEICHEN = { neu: '＋', weg: '－', aendern: '～', ungueltig: '✗' };

export function kiUi({ zustand, panel, aktionen, layout, zeichner }) {
  const auswahlBereich = () => aktionen.auswahlBereich();
  let offen = null; // { ergebnis, karte, quelle }

  /** Runde 19: KI-Bereich (darf hinausragen) > ⬚-Auswahl > ganze Zone. @returns { r, quelle } */
  const exportBereich = () => {
    if (zustand.kiBereich) return { r: zustand.kiBereich, quelle: 'ki' };
    const a = auswahlBereich();
    if (a) return { r: a, quelle: 'auswahl' };
    return zustand.karte ? { r: { x: 0, y: 0, b: zustand.karte.breite, h: zustand.karte.hoehe }, quelle: 'zone' } : null;
  };
  let letzterAuftrag = '';

  aktionen.ausschnittExport = async () => {
    const k = zustand.karte;
    if (!k) return;
    const { r, quelle } = exportBereich();
    const schutz = zustand.kiSchutz;
    const baue = (auftrag) => ausschnitt(k, r, { aussen: quelle === 'ki', schutz, auftrag });
    const a = baue(letzterAuftrag);
    const name = `${k.id}_x${a.bereich.x0}-${a.bereich.x1}_y${a.bereich.y0}-${a.bereich.y1}`;
    const hinweis = { ki: '🤖 KI-Bereich', auswahl: '⬚ Auswahl', zone: 'Kein Bereich markiert – das ist die ganze Zone (Rechtsklick → ⬚ KI-Bereich markieren)' }[quelle];
    const knoten = document.createElement('div');
    knoten.innerHTML = `<p class="leise">${esc(hinweis)}${a.aussen ? ' · ragt über die Zone – die KI darf dort neu bauen, beim Einfügen wächst die Zone' : ''}${schutz.length ? ` · 🛡 ${schutz.length} geschützte Fläche(n)` : ''}. Text + <b>📘 Anleitung</b> (Regeln &amp; Katalog) an die KI schicken; die Antwort (JSON) über <b>Datei → 📥 KI-Bereich einfügen</b> zurückholen.</p>
      <label class="feld" style="grid-template-columns:1fr"><span>Dein Auftrag an die KI (kommt oben in den Text)</span><textarea name="auftrag" style="min-height:70px" placeholder="z. B. Baue einen Waldweg zum Haus und passe die Umgebung an das Gebäude an"></textarea></label>
      <textarea name="text" readonly style="min-height:260px"></textarea>`;
    const feldAuftrag = knoten.querySelector('[name=auftrag]');
    const feldText = knoten.querySelector('[name=text]');
    feldAuftrag.value = letzterAuftrag;
    const aktualisiere = () => (feldText.value = ausschnittText(baue(feldAuftrag.value)));
    feldAuftrag.addEventListener('input', aktualisiere);
    feldAuftrag.addEventListener('keydown', (e) => e.stopPropagation());
    aktualisiere();
    const w = await dialog({
      titel: `🤖 Ausschnitt für KI: „${k.name}“ ${bereichText(a.bereich)}`,
      knoten,
      knoepfe: [{ text: 'Schließen', wert: null }, { text: '📘 Anleitung (.md)', wert: 'anleitung' }, { text: '⬇ JSON', wert: 'json' }, { text: '⬇ Text (.md)', wert: 'md' }, { text: '📋 Text kopieren', wert: 'kopieren', art: 'akzent' }],
    });
    // Runde 26: die feste KI-Anleitung (Regeln + Katalog) – immer zusammen mit dem Ausschnitt an die KI schicken
    if (w === 'anleitung') {
      try {
        const antwort = await fetch(new URL('../KI_KARTEN_ANLEITUNG.md', import.meta.url));
        if (!antwort.ok) throw new Error(antwort.status);
        herunterladen('KI_KARTEN_ANLEITUNG.md', await antwort.text(), 'text/markdown');
        zustand.meldung('📘 Anleitung heruntergeladen – zusammen mit dem Ausschnitt an die KI schicken', 'ok');
      } catch (e) {
        zustand.meldung(`Anleitung nicht ladbar (${e.message})`, 'fehler');
      }
    }
    letzterAuftrag = feldAuftrag.value;
    const text = ausschnittText(baue(letzterAuftrag));
    if (w === 'json') herunterladen(`${name}.ausschnitt.json`, JSON.stringify(baue(letzterAuftrag), null, 1));
    if (w === 'md') herunterladen(`${name}.ausschnitt.md`, text, 'text/markdown');
    if (w === 'kopieren') {
      try {
        await navigator.clipboard.writeText(text);
        zustand.meldung('📋 Ausschnitt kopiert – in den KI-Chat einfügen', 'ok');
      } catch {
        herunterladen(`${name}.ausschnitt.md`, text, 'text/markdown');
        zustand.meldung('Zwischenablage gesperrt – als Datei heruntergeladen', 'fehler');
      }
    }
  };

  aktionen.kiImport = async () => {
    if (!zustand.zonen.size) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    const k = zustand.karte;
    const r = zustand.kiBereich ?? auswahlBereich();
    const w = await dialog({
      titel: '📥 KI-Bereich einfügen',
      html: `<p class="leise">Antwort der KI hier einfügen (JSON, gern mit Text drumherum) – oder eine Datei laden. Die Zone und der Bereich kommen aus der Antwort (<code>{"aktion":"bereich","zone":…}</code>), sonst gilt ${r && k ? `der markierte Bereich <b>${esc(bereichText({ x0: r.x, y0: r.y, x1: r.x + r.b - 1, y1: r.y + r.h - 1 }))}</b> in „${esc(k.name)}“` : 'ein vorher markierter Bereich'}. Ragt der Bereich über die Zone, wird sie vergrößert. 🛡 Geschützte Flächen bleiben unverändert. Vor dem Übernehmen gibt es eine Vorschau.</p>
        <textarea name="text" placeholder='[{"aktion":"bereich","zone":"…","x0":…}, {"aktion":"setze","typ":"baum","x":23,"y":14}]'></textarea>`,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: '📂 Datei …', wert: 'datei' }, { text: 'Prüfen', art: 'akzent', wert: (b) => ({ text: b.querySelector('[name="text"]').value }) }],
    });
    let text = w?.text;
    if (w === 'datei') text = (await dateiWaehlen('.json,.txt,.md'))?.text;
    if (!text?.trim()) return;
    await fuegeEin(text);
  };

  /** Zone per ID oder Anzeigename finden (KIs schreiben oft den Namen) */
  const zoneZu = (angabe) => {
    const a = String(angabe ?? '').trim().toLowerCase();
    return [...zustand.zonen.keys()].find((id) => id.toLowerCase() === a || zustand.zonen.get(id).karte.name.trim().toLowerCase() === a) ?? null;
  };

  /** Runde 19: Antwort einfügen – Zone wählen, Zone bei Bedarf vergrößern (Aktionen umrechnen), dann prüfen + Vorschau */
  async function fuegeEin(text) {
    try {
      let gelesen = leseKiAntwort(text, zustand.karte);
      const ziel = gelesen.meta.zone ? zoneZu(gelesen.meta.zone) : zustand.aktivId;
      if (!ziel) throw new Error(`Die Antwort ist für Zone „${gelesen.meta.zone}“ – die gibt es in diesem Projekt nicht`);
      if (ziel !== zustand.aktivId) {
        zustand.aktiviere(ziel);
        zeichner.einpassen();
        gelesen = leseKiAntwort(text, zustand.karte); // Ausschnitt-Antworten hängen an der Karte
        zustand.meldung(`Zone „${zustand.karte.name}“ geöffnet (aus der KI-Antwort)`);
      }
      const k = zustand.karte;
      const markiert = zustand.kiBereich ?? auswahlBereich();
      const bereich = gelesen.meta.bereich ?? (markiert ? { x0: markiert.x, y0: markiert.y, x1: markiert.x + markiert.b - 1, y1: markiert.y + markiert.h - 1 } : null);
      const geschuetzt = [...zustand.kiSchutz, ...(gelesen.meta.geschuetzt ?? []).filter((g) => [g?.x, g?.y, g?.b, g?.h].every(Number.isFinite))];
      if (bereich) {
        const rand = randFuer(k, rechteckAusBereich(bereich));
        if (Object.values(rand).some((v) => v > 0)) {
          // Prüfsumme gegen den Stand VOR dem Vergrößern (danach ist der Außenbereich Rasen statt „?“)
          if (gelesen.meta.pruefsumme && gelesen.meta.pruefsumme !== bereichsPruefsumme(k, bereich)) gelesen.warnungen.push('Der Bereich hat sich seit dem Export geändert – Vorschau genau ansehen');
          delete gelesen.meta.pruefsumme;
          const seiten = Object.entries(rand).filter(([, v]) => v > 0).map(([s, v]) => `${v} ${s}`).join(', ');
          const vorher = { b: k.breite, h: k.hoehe };
          await aktionen.zoneGroesse(rand);
          if (k.breite === vorher.b && k.hoehe === vorher.h) return zustand.meldung('Zone nicht vergrößert – KI-Antwort nicht eingefügt', 'fehler');
          zustand.meldung(`Zone um ${seiten} Kacheln vergrößert (eigener Rückgängig-Schritt)`, 'ok');
          const dx = rand.links;
          const dy = rand.oben;
          gelesen = { ...gelesen, aktionen: verschiebeAktionen(gelesen.aktionen, dx, dy), meta: { ...gelesen.meta, bereich: { x0: bereich.x0 + dx, x1: bereich.x1 + dx, y0: bereich.y0 + dy, y1: bereich.y1 + dy } } };
          for (const g of geschuetzt) if (!zustand.kiSchutz.includes(g)) Object.assign(g, { x: g.x + dx, y: g.y + dy });
        }
      }
      pruefeGelesen(gelesen, bereich && !gelesen.meta.bereich ? bereich : null, 'Inspektor', geschuetzt);
    } catch (e) {
      dialog({ titel: 'KI-Antwort nicht verwendbar', html: `<p>${esc(e.message)}</p>` });
    }
  }

  /** Antworttext prüfen und als Vorschau zeigen (auch vom Gemini-Helfer genutzt). bereich = {x0,x1,y0,y1}|null */
  function pruefeText(text, bereich, zurueck = 'Inspektor') {
    try {
      pruefeGelesen(leseKiAntwort(text, zustand.karte), bereich, zurueck, [...zustand.kiSchutz]);
    } catch (e) {
      dialog({ titel: 'KI-Antwort nicht verwendbar', html: `<p>${esc(e.message)}</p>` });
    }
  }

  function pruefeGelesen(gelesen, bereich, zurueck, geschuetzt) {
    const k = zustand.karte;
    const ergebnis = pruefeAenderungen(k, gelesen, { bereich, prefabs: aktionen.eigenePrefabs?.() ?? [], geschuetzt });
    offen = { ergebnis, karte: k, gelesen, bereich, zurueck, geschuetzt };
    zeigeVorschau();
  }

  function zeigeVorschau() {
    const { ergebnis } = offen;
    zeichner.ueberlagerungen = [
      { rechteck: { x: ergebnis.bereich.x0, y: ergebnis.bereich.y0, b: ergebnis.bereich.x1 - ergebnis.bereich.x0 + 1, h: ergebnis.bereich.y1 - ergebnis.bereich.y0 + 1 }, farbe: '#4fc3ff', gestrichelt: true, text: `KI-Bereich ${bereichText(ergebnis.bereich)}` },
      ...ergebnis.eintraege.map((e) => ({ rechteck: eintragRechteck(e), farbe: FARBE[e.art], gestrichelt: e.art === 'ungueltig', text: `${ZEICHEN[e.art]}${e.nr}` })).filter((u) => u.rechteck),
    ];
    zeichner.anfordern();
    const b = ergebnis.bereich;
    zeichner.springeZu(Math.round((b.x0 + b.x1) / 2), Math.round((b.y0 + b.y1) / 2), Math.min(28, Math.max(6, (zeichner.groesse.b - 60) / (b.x1 - b.x0 + 4))));
    panel.registriere('KI-Import', kiReiter, { ereignisse: ['zone'] });
    layout.zeigeReiter('rechts', 'KI-Import');
  }

  function verwerfen(meldung = 'KI-Änderungen verworfen') {
    const zurueck = offen?.zurueck ?? 'Inspektor';
    offen = null;
    zeichner.ueberlagerungen = [];
    zeichner.anfordern();
    panel.entferne('KI-Import');
    panel.zeige(zurueck);
    zustand.meldung(meldung);
  }

  /** Reiter „KI-Import“ – nur sichtbar, solange eine Vorschau offen ist */
  function kiReiter() {
    const el = panel.el;
    if (!offen) {
      el.innerHTML = '<p class="leise">Keine KI-Änderungen geladen – Menü KI → KI-Antwort importieren.</p>';
      return;
    }
    const { ergebnis, karte } = offen;
    if (karte !== zustand.karte) {
      el.innerHTML = '<p>Die Vorschau gehört zu einer anderen Zone. Zurückwechseln oder verwerfen.</p>';
      const v = Object.assign(document.createElement('button'), { textContent: 'Verwerfen' });
      v.addEventListener('click', () => verwerfen());
      el.append(v);
      return;
    }
    const z = ergebnis.zaehler;
    el.innerHTML = `<h3>KI-Änderungen (Vorschau)</h3><p>Bereich <b>${esc(bereichText(ergebnis.bereich))}</b><br>
      <span style="color:${FARBE.neu}">＋ ${z.neu} neu</span> · <span style="color:${FARBE.weg}">－ ${z.weg} weg</span> · <span style="color:${FARBE.aendern}">～ ${z.aendern} geändert</span> · <span style="color:${FARBE.ungueltig}">✗ ${z.ungueltig} ungültig</span></p>
      ${ergebnis.warnungen.map((w) => `<p style="color:var(--gelb)">⚠ ${esc(w)}</p>`).join('')}
      ${z.ungueltig ? '<p class="leise">Ungültige Aktionen werden NICHT übernommen (Grund steht dabei).</p>' : ''}`;
    const reihe = document.createElement('div');
    reihe.className = 'knopfreihe';
    const ok = Object.assign(document.createElement('button'), { textContent: `✔ Übernehmen (${ergebnis.ops.length ? z.neu + z.weg + z.aendern : 0})`, className: 'akzent', disabled: !ergebnis.ops.length });
    ok.addEventListener('click', () => {
      // Hat sich die Karte seit der Vorschau geändert? Dann neu prüfen und die neue Vorschau zeigen statt blind anzuwenden
      const frisch = pruefeAenderungen(karte, offen.gelesen, { bereich: offen.bereich, prefabs: aktionen.eigenePrefabs?.() ?? [], geschuetzt: offen.geschuetzt });
      if (JSON.stringify(frisch.ops) !== JSON.stringify(ergebnis.ops)) {
        offen.ergebnis = frisch;
        zeigeVorschau();
        return zustand.meldung('Die Karte hat sich seit der Vorschau geändert – Vorschau aktualisiert, bitte nochmal prüfen', 'fehler');
      }
      const n = z.neu + z.weg + z.aendern;
      zustand.ausfuehren(`KI-Änderungen (${n})`, ergebnis.ops);
      verwerfen(`✔ ${n} KI-Änderungen übernommen – Strg+Z macht alle auf einmal rückgängig`);
    });
    const nein = Object.assign(document.createElement('button'), { textContent: '✗ Verwerfen', className: 'gefahr' });
    nein.addEventListener('click', () => verwerfen());
    reihe.append(ok, nein);
    el.append(reihe);
    const ul = document.createElement('ul');
    ul.className = 'liste';
    for (const e of ergebnis.eintraege) {
      const li = document.createElement('li');
      li.className = `diff-${e.art === 'ungueltig' ? 'ungueltig' : e.art === 'weg' ? 'weg' : e.art === 'neu' ? 'neu' : 'aendern'}`;
      li.textContent = `${e.nr}. ${e.art === 'ungueltig' ? '✗ ' : ''}${e.text}`;
      li.addEventListener('click', () => e.x !== null && e.x !== undefined && zeichner.springeZu(e.x, e.y));
      ul.append(li);
    }
    el.append(ul);
  }

  return { verwerfen, pruefeText };
}
