import { KATEGORIEN } from '../kern/katalog.js';
import { passtModell, verwendungen, loeschOps, ersetzOps, typAusModell, typIdFuer, benutzteModelle } from '../kern/bibliothek.js';
import { groesseText } from '../kern/backup.js';
import { dialog, bestaetigen, esc, feldHtml, liesFelder } from './dialoge.js';
import { leseModellDatei, DATEI_ANNAHME } from './modellImport.js';
import { POLY_PIZZA } from '../kern/quellen.js';
import { oeffneWerkstatt } from './werkstatt.js';

/**
 * Reiter „📦 Modelle“ (linke Seitenleiste, Editor 2.0 Phase 3): Projekt-Bibliothek der 3D-Modelle.
 *   • Hochladen: Drag & Drop (mehrere Dateien) oder 📂 – .glb/.gltf/.obj/.fbx (ui/modellImport.js prüft + wandelt um),
 *     Maße/Dreiecke/Animationen/Vorschaubild automatisch, Ordner = aktueller Ordner-Filter.
 *   • Suche (Name, #Tag, Ordner, Urheber), Ordner-Filter, Karte klicken = in der Zone platzieren (legt den Typ an).
 *   • ✎ Details: Name, Kategorie, Ordner, Tags, Maße, Lizenz/Urheber/Quelle; 🗑 Löschen mit Abhängigkeitsprüfung
 *     („in 2 Zonen von 14 Objekten benutzt“ → mitlöschen oder durch anderes Modell ersetzen; je Zone 1 Undo-Schritt).
 *   • 🌐 Poly Pizza (Schritt 3.5, kern/quellen.js): Suche mit Vorschau + Lizenz, „Übernehmen“ lädt in die Bibliothek
 *     (Urheber/Lizenz/Quelle wandern mit). API-Schlüssel nur in localStorage `browserSurvival.editorPolyPizza` (nie in
 *     Backup/Entwurf). Blockiert der Browser den Zugriff (CORS): Link zur Seite + „Datei mit Lizenzangaben importieren“.
 *   • 🛠 Werkstatt (Schritt 5.1, ui/werkstatt.js): Modell drehen/skalieren/ausrichten, Teile ausblenden → neue Version.
 * Aktionen: aktionen.verwendeModell(id), aktionen.modelle() (Reiter zeigen), aktionen.modellHochladen(), aktionen.polyPizza(),
 *   aktionen.werkstatt(id).
 */
const REITER = '📦 Modelle';
const QUELLEN_SPEICHER = 'browserSurvival.editorPolyPizza';
const LIZENZ_WAHL = [['CC0', 'CC0 (gemeinfrei)'], ['CC-BY 4.0', 'CC-BY 4.0 (Namensnennung)'], ['CC-BY 3.0', 'CC-BY 3.0 (Namensnennung)']];

export function modelleUi({ zustand, panel, aktionen, layout, bibliothek }) {
  let suche = '';
  let ordner = '';
  const wurzel = document.createElement('div');
  wurzel.className = 'modelle';
  wurzel.innerHTML = `<div class="ablage" tabindex="0" title="3D-Dateien hierher ziehen">⬇ .glb / .gltf / .obj / .fbx hierher ziehen<br><button type="button" class="akzent" data-waehlen>📂 Dateien wählen …</button> <button type="button" data-poly title="Kostenlose CC0/CC-BY-Modelle suchen">🌐 Poly Pizza</button></div>
    <div class="modelle-filter"><input type="search" placeholder="Modelle suchen … (#tag)" aria-label="Modelle suchen"><select aria-label="Ordner"></select></div>
    <div class="modelle-liste"></div>`;
  const eingabe = wurzel.querySelector('input[type=search]');
  const ordnerWahl = wurzel.querySelector('select');
  const liste = wurzel.querySelector('.modelle-liste');
  const ablage = wurzel.querySelector('.ablage');

  eingabe.addEventListener('input', () => {
    suche = eingabe.value;
    zeichneListe();
  });
  eingabe.addEventListener('keydown', (e) => e.stopPropagation());
  ordnerWahl.addEventListener('change', () => {
    ordner = ordnerWahl.value;
    zeichneListe();
  });
  wurzel.querySelector('[data-waehlen]').addEventListener('click', () => waehleDateien());
  wurzel.querySelector('[data-poly]').addEventListener('click', () => polyPizza());
  for (const art of ['dragenter', 'dragover']) ablage.addEventListener(art, (e) => (e.preventDefault(), ablage.classList.add('ueber')));
  for (const art of ['dragleave', 'drop']) ablage.addEventListener(art, () => ablage.classList.remove('ueber'));
  ablage.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) hochladen([...e.dataTransfer.files]);
  });
  liste.addEventListener('click', (e) => {
    const karte = e.target.closest('[data-modell]');
    if (!karte) return;
    const id = karte.dataset.modell;
    if (e.target.closest('[data-bearbeiten]')) return bearbeiten(id);
    if (e.target.closest('[data-werkstatt]')) return aktionen.werkstatt(id);
    aktionen.verwendeModell(id);
  });

  const zaehle = (id) => verwendungen(new Map([...zustand.zonen].map(([zid, e]) => [zid, e.karte])), id);

  function zeichneListe() {
    const alle = bibliothek.liste;
    const ordnerListe = bibliothek.ordner;
    ordnerWahl.innerHTML = `<option value="">Alle Ordner (${alle.length})</option>${ordnerListe.map((o) => `<option value="${esc(o)}"${o === ordner ? ' selected' : ''}>📁 ${esc(o)}</option>`).join('')}`;
    if (ordner && !ordnerListe.includes(ordner)) ordner = '';
    const treffer = alle.filter((m) => (!ordner || m.ordner === ordner || m.ordner.startsWith(`${ordner}/`)) && (!suche.trim() || passtModell(m, suche)));
    if (!alle.length) {
      liste.innerHTML = '<p class="leise">Noch keine Modelle. Datei hierher ziehen – sie liegt dann im Projekt (alle Zonen) und steht auch im Asset-Browser.</p>';
      return;
    }
    liste.innerHTML = treffer.length
      ? `<div class="modell-raster">${treffer
          .map((m) => {
            const v = zaehle(m.id);
            const titel = `${m.name} – ${m.masse.b} × ${m.masse.h} × ${m.masse.hoehe} m · ${m.dreiecke.toLocaleString('de-DE')} Dreiecke${m.tags.length ? ` · #${m.tags.join(' #')}` : ''}${m.lizenz ? ` · ${m.lizenz}` : ''}\nKlick = platzieren`;
            return `<div class="modell" data-modell="${esc(m.id)}" title="${esc(titel)}" role="button" tabindex="0">
              ${m.vorschau ? `<img src="${esc(m.vorschau)}" alt="">` : '<span class="symbol">🧊</span>'}
              <span class="name">${esc(m.name)}</span>
              <span class="leise klein">${v.objekte ? `${v.objekte}× in ${v.zonen.length} Zone${v.zonen.length > 1 ? 'n' : ''}` : 'unbenutzt'}</span>
              <button type="button" data-bearbeiten title="Details / Löschen">✎</button><button type="button" data-werkstatt title="In der Werkstatt bearbeiten (neue Version)">🛠</button></div>`;
          })
          .join('')}</div>`
      : '<p class="leise">Nichts gefunden.</p>';
  }

  panel.registriere(REITER, () => {
    if (panel.el.firstChild !== wurzel) panel.el.replaceChildren(wurzel);
    zeichneListe();
  }, { ereignisse: ['zone', 'bibliothek'], ohneKarte: true });

  function waehleDateien() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: DATEI_ANNAHME, multiple: true });
    input.addEventListener('change', () => input.files?.length && hochladen([...input.files]));
    input.click();
  }

  async function hochladen(dateien) {
    const fertig = [];
    const fehler = [];
    const hinweise = [];
    for (const [i, datei] of dateien.entries()) {
      zustand.meldung(`⟳ ${i + 1}/${dateien.length}: ${datei.name} wird geprüft …`);
      try {
        const m = await leseModellDatei(datei);
        const name = datei.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Modell';
        const { meta, neu } = await bibliothek.fuegeHinzu(m.bytes, { name, ordner, kategorie: 'Eigene', masse: m.masse, dreiecke: m.info.dreiecke, animationen: m.info.animationen, vorschau: m.vorschau, tags: [] });
        fertig.push(meta);
        if (!neu) hinweise.push(`${datei.name}: schon in der Bibliothek („${meta.name}“)`);
        hinweise.push(...m.warnungen.map((w) => `${datei.name}: ${w}`));
      } catch (e) {
        fehler.push(`${datei.name}: ${e.message}`);
      }
    }
    layout.zeigeReiter('links', REITER);
    zustand.meldung(`📦 ${fertig.length} Modell${fertig.length === 1 ? '' : 'e'} in der Bibliothek${fehler.length ? `, ${fehler.length} abgelehnt` : ''}`, fehler.length ? 'fehler' : 'ok');
    if (fehler.length || hinweise.length) await dialog({ titel: '📦 Hochladen', html: `${fehler.length ? `<p><b>Abgelehnt:</b></p><ul>${fehler.map((f) => `<li style="color:var(--rot)">${esc(f)}</li>`).join('')}</ul>` : ''}${hinweise.length ? `<p><b>Hinweise:</b></p><ul>${hinweise.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}` });
    if (fertig.length === 1) bearbeiten(fertig[0].id);
  }

  async function bearbeiten(id) {
    const m = bibliothek.meta(id);
    if (!m) return;
    const v = zaehle(id);
    const felder = [
      { name: 'name', label: 'Name', typ: 'text', wert: m.name, pflicht: true },
      { name: 'kategorie', label: 'Kategorie', typ: 'auswahl', wert: KATEGORIEN.includes(m.kategorie) ? m.kategorie : 'Eigene', optionen: KATEGORIEN.map((k) => [k, k]), hilfe: 'Gruppe im Asset-Browser' },
      { name: 'ordner', label: 'Ordner', typ: 'text', wert: m.ordner, hilfe: 'z. B. Wald/Bäume – eigener Ordner für die Bibliothek' },
      { name: 'tags', label: 'Tags', typ: 'text', wert: m.tags.join(', '), hilfe: 'Komma-getrennt, für die Suche (#tag)' },
      { name: 'b', label: 'Breite (Kacheln)', typ: 'zahl', wert: m.masse.b, min: 0.1, schritt: 0.1, hilfe: 'aus dem Modell gemessen (1 m = 1 Kachel) – gilt für neu angelegte Typen' },
      { name: 'h', label: 'Tiefe (Kacheln)', typ: 'zahl', wert: m.masse.h, min: 0.1, schritt: 0.1 },
      { name: 'hoehe', label: 'Höhe (m)', typ: 'zahl', wert: m.masse.hoehe, min: 0.05, schritt: 0.05 },
      { name: 'lizenz', label: 'Lizenz', typ: 'text', wert: m.lizenz, hilfe: 'z. B. CC0 oder CC-BY 4.0 (landet in LIZENZEN.md)' },
      { name: 'urheber', label: 'Urheber', typ: 'text', wert: m.urheber },
      { name: 'quelle', label: 'Quelle (URL)', typ: 'text', wert: m.quelle },
      ...(m.animationen.length ? [{ name: 'leerlauf', label: 'Leerlauf-Animation', typ: 'auswahl', wert: m.leerlauf ?? '', optionen: [['', '– keine (still) –'], ...m.animationen.map((a) => [a, a])], hilfe: 'Standard für neu platzierte Objekte (im Spiel als Schleife); je Typ änderbar' }] : []),
    ];
    const kopf = `<div class="modell-kopf">${m.vorschau ? `<img src="${esc(m.vorschau)}" alt="">` : '<span class="symbol">🧊</span>'}<p class="leise">${m.dreiecke.toLocaleString('de-DE')} Dreiecke · ${groesseText(m.groesse)}${m.animationen.length ? ` · Animationen: ${esc(m.animationen.join(', '))}` : ''}${m.basis ? `<br>Version ${m.version} von „${esc(bibliothek.meta(m.basis)?.name ?? m.basis)}“` : ''}<br>${v.objekte ? `Benutzt: ${v.zonen.map((z) => `${esc(z.name)} (${z.objekte})`).join(', ')}` : 'In keiner Zone benutzt'}</p></div>`;
    const w = await dialog({
      titel: `🧊 ${m.name}`,
      html: kopf + felder.map(feldHtml).join(''),
      knoepfe: [{ text: '🗑 Löschen …', art: 'gefahr', wert: 'loeschen' }, { text: '🛠 Werkstatt', wert: 'werkstatt' }, { text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'akzent', wert: (b) => liesFelder(b, felder) }],
    });
    if (w === 'loeschen') return loeschen(id);
    if (w === 'werkstatt') return aktionen.werkstatt(id);
    if (!w) return;
    const neu = await bibliothek.aendere(id, { name: w.name, kategorie: w.kategorie, ordner: w.ordner ?? '', tags: w.tags ?? '', lizenz: w.lizenz ?? '', urheber: w.urheber ?? '', quelle: w.quelle ?? '', masse: { b: w.b, h: w.h, hoehe: w.hoehe }, ...(m.animationen.length ? { leerlauf: w.leerlauf ?? '' } : {}) });
    // Urheber/Lizenz/Quelle auch in den Typen der Zonen nachziehen (sonst fehlen sie in LIZENZEN.md)
    if (neu && (neu.lizenz !== m.lizenz || neu.urheber !== m.urheber || neu.quelle !== m.quelle))
      for (const [, e] of zustand.zonen) {
        const ops = ersetzOps(e.karte, id, neu);
        if (ops.length) zustand.ausfuehren(`Lizenz „${neu.name}“`, ops, e.karte, { alleEbenen: true });
      }
    zustand.meldung(`🧊 „${neu?.name}“ gespeichert`, 'ok');
  }

  async function loeschen(id) {
    const m = bibliothek.meta(id);
    const v = zaehle(id);
    if (!v.typen) {
      if (!(await bestaetigen('Modell löschen', `„${esc(m.name)}“ aus der Bibliothek löschen? Das geht nicht rückgängig (vorher: Datei → Komplett-Backup).`, { ok: 'Löschen', gefahr: true }))) return;
      await bibliothek.entferne(id);
      return zustand.meldung(`🗑 „${m.name}“ gelöscht`, 'ok');
    }
    const andere = bibliothek.liste.filter((x) => x.id !== id);
    const html = `<p>„${esc(m.name)}“ wird in <b>${v.zonen.length} Zone${v.zonen.length > 1 ? 'n' : ''}</b> von <b>${v.objekte} Objekt${v.objekte === 1 ? '' : 'en'}</b> benutzt:</p>
      <ul>${v.zonen.map((z) => `<li>${esc(z.name)} (${esc(z.id)}): ${z.objekte} Objekte</li>`).join('')}</ul>
      ${andere.length ? feldHtml({ name: 'ersatz', label: 'Ersetzen durch', typ: 'auswahl', wert: andere[0].id, optionen: andere.map((x) => [x.id, x.name]) }) : ''}
      <p class="leise">„Mitlöschen“ entfernt die Objekte und den Typ in jeder Zone (je Zone rückgängig machbar), „Ersetzen“ lässt die Objekte stehen und zeigt das andere Modell. Das Modell selbst verschwindet aus der Bibliothek – das ist <b>nicht</b> rückgängig zu machen. Im Repo räumt der nächste <code>npm run karte:editor</code> verwaiste Dateien auf.</p>`;
    const w = await dialog({
      titel: '🗑 Modell löschen',
      html,
      knoepfe: [{ text: 'Abbrechen', wert: null }, ...(andere.length ? [{ text: 'Ersetzen & löschen', wert: (b) => ({ art: 'ersetzen', ersatz: b.querySelector('[name=ersatz]').value }) }] : []), { text: `Mitlöschen (${v.objekte})`, art: 'gefahr', wert: { art: 'mit' } }],
    });
    if (!w) return;
    for (const z of v.zonen) {
      const karte = zustand.zonen.get(z.id).karte;
      const ops = w.art === 'mit' ? loeschOps(karte, id) : ersetzOps(karte, id, bibliothek.meta(w.ersatz));
      zustand.ausfuehren(w.art === 'mit' ? `Modell „${m.name}“ entfernt` : `Modell „${m.name}“ ersetzt`, ops, karte, { alleEbenen: true });
    }
    await bibliothek.entferne(id);
    zustand.meldung(`🗑 „${m.name}“ gelöscht${w.art === 'mit' ? ` – ${v.objekte} Objekte entfernt` : ` – ersetzt durch „${bibliothek.meta(w.ersatz)?.name}“`}`, 'ok');
  }

  /** Modell in der aktiven Zone platzieren: Typ anlegen (falls noch keiner darauf verweist) und als Asset wählen */
  aktionen.verwendeModell = (id) => {
    const k = zustand.karte;
    const m = bibliothek.meta(id);
    if (!k) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    if (!m) return;
    let typId = [...k.s('typen')].find(([, t]) => t.asset === id)?.[0];
    if (!typId) {
      typId = typIdFuer(m.name, (x) => k.s('typen').has(x));
      zustand.ausfuehren(`Modell „${m.name}“ in die Zone`, [{ s: 'typen', k: typId, neu: typAusModell(m) }]);
    }
    aktionen.waehleKatalog(`eigen:${typId}`);
  };
  aktionen.modelle = () => layout.zeigeReiter('links', REITER);
  aktionen.modellHochladen = () => {
    layout.zeigeReiter('links', REITER);
    waehleDateien();
  };
  aktionen.modellBearbeiten = bearbeiten;
  aktionen.modellMeta = (id) => bibliothek.meta(id);
  aktionen.werkstatt = (id) => oeffneWerkstatt({ id, bibliothek, zustand });
  aktionen.polyPizza = () => polyPizza();

  // --- Externe Quelle: Poly Pizza ------------------------------------------------------------
  const liesSchluessel = () => {
    try {
      return JSON.parse(localStorage.getItem(QUELLEN_SPEICHER) ?? '{}')?.schluessel ?? '';
    } catch {
      return '';
    }
  };
  const merkeSchluessel = (schluessel) => {
    try {
      localStorage.setItem(QUELLEN_SPEICHER, JSON.stringify({ schluessel }));
    } catch {
      /* gesperrt → nur für diese Sitzung */
    }
  };
  let letzteSuche = 'tree';

  async function polyPizza() {
    const knoten = document.createElement('div');
    knoten.className = 'quelle';
    knoten.innerHTML = `<p class="leise">Kostenlose Low-Poly-Modelle, nur <b>CC0/CC-BY</b>. Eigener API-Schlüssel (kostenlos): <a href="${POLY_PIZZA.schluesselSeite}" target="_blank" rel="noopener">poly.pizza/settings/api</a> – bleibt nur in diesem Browser.</p>
      <div class="quelle-zeile"><input type="password" name="schluessel" placeholder="API-Schlüssel" autocomplete="off" aria-label="API-Schlüssel"></div>
      <div class="quelle-zeile"><input type="search" name="suche" placeholder="englisch suchen, z. B. tree, car, fence" aria-label="Suche"><button type="button" class="akzent" data-suchen>Suchen</button></div>
      <div class="quelle-status leise"></div><div class="modell-raster quelle-liste"></div>`;
    const feldSchluessel = knoten.querySelector('[name=schluessel]');
    const feldSuche = knoten.querySelector('[name=suche]');
    const status = knoten.querySelector('.quelle-status');
    const liste = knoten.querySelector('.quelle-liste');
    feldSchluessel.value = liesSchluessel();
    feldSuche.value = letzteSuche;
    let treffer = [];
    const rueckfall = (text) => {
      status.innerHTML = `<span style="color:var(--rot)">${esc(text)}</span><br>Rückfall: <a href="${POLY_PIZZA.seite(feldSuche.value)}" target="_blank" rel="noopener">auf poly.pizza suchen</a>, Modell als <b>.glb</b> herunterladen und mit <button type="button" data-datei>📂 Datei mit Lizenzangaben importieren</button> übernehmen.`;
      status.querySelector('[data-datei]').addEventListener('click', () => dateiMitLizenz());
    };
    const suchen = async () => {
      letzteSuche = feldSuche.value.trim() || 'tree';
      merkeSchluessel(feldSchluessel.value.trim());
      status.textContent = '⟳ suche …';
      liste.innerHTML = '';
      try {
        const e = await POLY_PIZZA.suche(letzteSuche, { schluessel: feldSchluessel.value.trim() });
        treffer = e.liste;
        status.textContent = `${e.gesamt} Treffer${e.ausgefiltert ? ` (${e.ausgefiltert} mit anderer Lizenz ausgeblendet)` : ''} – Klick = in die Bibliothek übernehmen`;
        liste.innerHTML = treffer
          .map((t, i) => `<div class="modell" data-nr="${i}" role="button" tabindex="0" title="${esc(`${t.titel} von ${t.urheber} (${t.lizenz})${t.dreiecke ? ` · ${t.dreiecke} Dreiecke` : ''}${t.animiert ? ' · animiert' : ''}`)}">${t.vorschau ? `<img src="${esc(t.vorschau)}" alt="" loading="lazy">` : '<span class="symbol">🧊</span>'}<span class="name">${esc(t.titel)}</span><span class="leise klein">${esc(t.lizenz)} · ${esc(t.urheber)}</span></div>`)
          .join('');
      } catch (e) {
        if (e.cors) rueckfall(e.message);
        else status.innerHTML = `<span style="color:var(--rot)">${esc(e.message)}</span>`;
      }
    };
    liste.addEventListener('click', async (ev) => {
      const t = treffer[ev.target.closest('[data-nr]')?.dataset.nr];
      if (!t) return;
      status.textContent = `⟳ „${t.titel}“ wird geladen …`;
      try {
        const bytes = await POLY_PIZZA.lade(t);
        const m = await leseModellDatei(new File([bytes], `${t.id}.glb`));
        const { meta, neu } = await bibliothek.fuegeHinzu(m.bytes, { name: t.titel, ordner: ordner || 'Poly Pizza', kategorie: 'Eigene', tags: [...t.tags, 'polypizza'], lizenz: t.lizenz, urheber: t.urheber, quelle: t.quelle, masse: m.masse, dreiecke: m.info.dreiecke, animationen: m.info.animationen, vorschau: m.vorschau });
        status.textContent = `✓ „${meta.name}“ ${neu ? 'übernommen' : 'war schon in der Bibliothek'} (${t.lizenz}, ${t.urheber})${m.warnungen.length ? ` – ${m.warnungen.join('; ')}` : ''}`;
      } catch (e) {
        if (e.cors) rueckfall(e.message);
        else status.innerHTML = `<span style="color:var(--rot)">${esc(e.message)}</span>`;
      }
    });
    knoten.querySelector('[data-suchen]').addEventListener('click', suchen);
    for (const f of [feldSuche, feldSchluessel])
      f.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') suchen();
      });
    await dialog({ titel: '🌐 Poly Pizza – Modelle suchen', knoten, knoepfe: [{ text: '📂 Datei mit Lizenzangaben …', wert: 'datei' }, { text: 'Schließen', art: 'akzent', wert: null }], beiOeffnen: () => feldSchluessel.value && suchen() }).then((w) => w === 'datei' && dateiMitLizenz());
  }

  /** Rückfall ohne API: heruntergeladene Datei + Urheber/Lizenz/Quelle von Hand */
  async function dateiMitLizenz() {
    const felder = [
      { name: 'name', label: 'Name', typ: 'text', wert: '', pflicht: true },
      { name: 'urheber', label: 'Urheber', typ: 'text', wert: '', pflicht: true },
      { name: 'lizenz', label: 'Lizenz', typ: 'auswahl', wert: 'CC0', optionen: LIZENZ_WAHL },
      { name: 'quelle', label: 'Quelle (URL)', typ: 'text', wert: 'https://poly.pizza/m/', hilfe: 'Seite des Modells' },
    ];
    const w = await dialog({ titel: '📂 Modell mit Lizenzangaben', html: `<p class="leise">Nur CC0/CC-BY. Danach die Datei wählen.</p>${felder.map(feldHtml).join('')}`, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Datei wählen …', art: 'akzent', wert: (b) => liesFelder(b, felder) }] });
    if (!w?.name || !w.urheber) return;
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: DATEI_ANNAHME });
    input.addEventListener('change', async () => {
      const datei = input.files?.[0];
      if (!datei) return;
      try {
        const m = await leseModellDatei(datei);
        const { meta } = await bibliothek.fuegeHinzu(m.bytes, { name: w.name, ordner, kategorie: 'Eigene', lizenz: w.lizenz, urheber: w.urheber, quelle: w.quelle, masse: m.masse, dreiecke: m.info.dreiecke, animationen: m.info.animationen, vorschau: m.vorschau, tags: [] });
        layout.zeigeReiter('links', REITER);
        zustand.meldung(`📦 „${meta.name}“ (${meta.lizenz}, ${meta.urheber}) in der Bibliothek`, 'ok');
      } catch (e) {
        zustand.meldung(`${datei.name}: ${e.message}`, 'fehler');
      }
    });
    input.click();
  }
  /** Für Entwurf-Datei/Backup: Modelle, die Karten benutzen */
  aktionen.benutzteModelle = (karten) => [...new Set(karten.flatMap((k) => benutzteModelle(k)))];
}
