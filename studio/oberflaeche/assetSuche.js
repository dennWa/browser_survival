import * as THREE from 'three';
import { GLTFLoader, GLTFExporter } from '../../client/vendor/three/addons.js';
import { dialog, formular, esc } from './dialoge.js';
import { icon } from './icons.js';

/**
 * Asset-Suche im Internet (Studio Phase 4.11) – Oberfläche + Import. Suche/Download laufen im Hauptprozess
 * (studio/main/assetSuche.mjs; Vorschaubilder/Hörproben über IPC asset.holen, weil die CSP des Fensters nur eigene Quellen erlaubt).
 *   Modelle  → Modell-Werkstatt als NEUES Modell (glTF von Poly Haven wird zu .glb, Texturen max. 512 px, nur Farbtextur)
 *   Texturen → client/assets/eigene/texturen/ (auf 512 px verkleinert) – Werkstatt: Material → „Aus Bibliothek …“
 *   Klänge   → Audio-Zentrale (Schnitt-Editor) für ein Ereignis oder einen Musik-Ordner
 * importiereAsset(studio, …) ist derselbe Weg für die KI (kern/kiAssets.js).
 */
const ARTEN = [['modell', 'Modelle'], ['textur', 'Texturen'], ['klang', 'Klänge']];

const ausB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** glTF mit Nebendateien → kompakte .glb (nur Farbtextur, max. 512 px) */
export async function gltfZuGlb(dateien, haupt) {
  const urls = new Map(Object.entries(dateien).map(([n, b]) => [n, URL.createObjectURL(new Blob([b]))]));
  try {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => {
      const name = decodeURIComponent(u).replace(/^\.?\//, '');
      return urls.get(name) ?? [...urls].find(([n]) => name.endsWith(n))?.[1] ?? u;
    });
    const gltf = await new GLTFLoader(manager).parseAsync(new TextDecoder().decode(dateien[haupt]), '');
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) for (const k of ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) m[k] = null;
    });
    return new Uint8Array(await new GLTFExporter().parseAsync(gltf.scene, { binary: true, maxTextureSize: 512, animations: gltf.animations }));
  } finally {
    for (const u of urls.values()) URL.revokeObjectURL(u);
  }
}

/** Bild auf max. 512 px verkleinern → JPG-Bytes */
async function verkleinere(bytes) {
  const bild = await createImageBitmap(new Blob([bytes]));
  const s = Math.min(1, 512 / Math.max(bild.width, bild.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bild.width * s);
  c.height = Math.round(bild.height * s);
  c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
  return new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86))).arrayBuffer());
}

/**
 * Import (UI + KI). modell: speichern = true speichert sofort (KI), sonst offen in der Werkstatt.
 * klang: ziel = { art: 'ereignis', ereignis } | { art: 'musik', ordner } – ohne Ziel landet er im Schnitt-Editor.
 * @returns Text
 */
export async function importiereAsset(studio, { art, quelle, id, name = null, hoehe = null, speichern = false, ziel = null }) {
  const r = await studio.nativ.aufruf('asset.lade', { art, quelle, id });
  const titel = name || r.credits.titel || id;
  if (art === 'modell') {
    const bytes = r.art === 'gltf' ? await gltfZuGlb(r.dateien, r.haupt) : r.bytes;
    await studio.werkstatt.importiere(bytes, { name: titel, urheber: r.credits.urheber, lizenz: r.credits.lizenz, url: r.credits.url, hoehe, ohneFrage: speichern });
    if (!speichern) return `„${titel}“ ist in der Werkstatt offen – Höhe/Kollision prüfen und speichern.`;
    const text = await studio.werkstatt.speichere();
    return `${text} → modell:${studio.werkstatt.stem}`;
  }
  if (art === 'textur') {
    const pfad = await studio.nativ.aufruf('textur.speichern', { name: titel, bytes: await verkleinere(r.bytes), endung: 'jpg', credits: r.credits });
    return `Textur gespeichert: ${pfad} (Werkstatt → Material → Aus Bibliothek)`;
  }
  if (art === 'klang') {
    const a = studio.audio;
    await a.oeffne(ziel?.art === 'ereignis' ? `ereignis:${ziel.ereignis}` : ziel?.art === 'musik' ? `musikOrdner:${ziel.ordner}` : null);
    await a.bearbeite({ name: `${titel.replace(/[^\w äöüÄÖÜß-]+/g, '').slice(0, 40) || 'klang'}.${r.endung}`, bytes: r.bytes, credits: r.credits });
    if (!ziel) return 'Klang liegt im Schnitt-Editor der Audio-Zentrale – Ereignis/Musik-Ordner wählen und speichern.';
    const pfad = await a.speichereSchnitt(ziel.art === 'ereignis' ? { art: 'ereignis', ereignis: ziel.ereignis, ersetzen: !!ziel.ersetzen } : { art: 'musik', ordner: ziel.ordner, name: titel });
    return `Klang gespeichert: ${pfad}`;
  }
  throw new Error('art: modell, textur, klang');
}

export async function oeffneAssetSuche(studio, { art = 'modell' } = {}) {
  let quellen = await studio.nativ.aufruf('quellen.info');
  let zustand = { art, quelle: Object.keys(quellen[art])[0], text: '', seite: 0, liste: [], mehr: false };
  const el = document.createElement('div');
  el.style.cssText = 'display:grid;gap:10px;min-height:60vh';
  const bildCache = new Map();
  let hoeren = null;
  const zeichne = () => {
    const q = quellen[zustand.art][zustand.quelle];
    el.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="segment">${ARTEN.map(([a, t]) => `<button data-art="${a}" class="${a === zustand.art ? 'aktiv' : ''}">${t}</button>`).join('')}</div>
        <select class="feld" data-quelle style="width:auto">${Object.entries(quellen[zustand.art]).map(([id, x]) => `<option value="${id}" ${id === zustand.quelle ? 'selected' : ''}>${esc(x.name)}${x.schluessel ? (x.hatSchluessel ? ' ✓' : ' (Schlüssel)') : ''}</option>`).join('')}</select>
        <input class="feld" data-text placeholder="Suchbegriff (englisch klappt am besten: chair, zombie, moss, wind …)" value="${esc(zustand.text)}" style="flex:1;min-width:220px" />
        <button class="knopf primaer" data-suche>${icon('suche', 14)} Suchen</button>
        ${q.schluessel ? `<button class="knopf flach" data-schluessel>${icon('schloss', 14)} Schlüssel</button>` : ''}
      </div>
      <div class="hinweis-kasten">Nur CC0 / CC-BY. Urheber, Lizenz und Quelle landen automatisch in <code>client/assets/eigene/credits.json</code> (Credits im Spiel).${q.schluessel && !q.hatSchluessel ? ` ${esc(q.name)} braucht einen kostenlosen API-Schlüssel: <a href="#" data-link="${esc(q.seite)}">${esc(q.seite)}</a>` : ''}</div>
      <div class="as-raster">${zustand.liste.map((e, i) => `<div class="as-karte"><div class="as-bild" data-bild="${i}">${bildCache.get(e.vorschau) ? `<img src="${bildCache.get(e.vorschau)}" alt="" />` : icon(zustand.art === 'klang' ? 'audio' : 'modell', 24)}</div><div class="as-titel" title="${esc(e.titel)}">${esc(e.titel)}</div><div class="neben">${esc(e.urheber)} · <b>${esc(e.lizenz)}</b>${e.info ? ` · ${esc(e.info)}` : ''}</div><div class="insp-knoepfe">${e.hoeren ? `<button class="knopf flach ws-mini" data-hoeren="${i}">${icon('abspielen', 12)}</button>` : ''}<button class="knopf flach ws-mini" data-link="${esc(e.url)}" title="Seite öffnen">${icon('link', 12)}</button><button class="knopf" data-import="${i}">${icon('hochladen', 12)} Importieren</button></div></div>`).join('') || '<div class="insp-leer">Suchbegriff eingeben und suchen.</div>'}</div>
      ${zustand.mehr ? '<div><button class="knopf" data-mehr>Mehr laden</button></div>' : ''}`;
    // Vorschaubilder nachladen (über den Hauptprozess)
    zustand.liste.forEach((e, i) => {
      if (!e.vorschau || bildCache.has(e.vorschau)) return;
      bildCache.set(e.vorschau, null);
      studio.nativ.aufruf('asset.holen', { url: e.vorschau }).then((b) => {
        bildCache.set(e.vorschau, `data:${b.typ};base64,${b.base64}`);
        const z = el.querySelector(`[data-bild="${i}"]`);
        if (z) z.innerHTML = `<img src="${bildCache.get(e.vorschau)}" alt="" />`;
      }).catch(() => {});
    });
  };
  const suche = async (mehr = false) => {
    try {
      studio.hinweis('Suche …');
      const r = await studio.nativ.aufruf('asset.suche', { art: zustand.art, quelle: zustand.quelle, text: zustand.text, seite: mehr ? zustand.seite + 1 : 0 });
      zustand = { ...zustand, seite: mehr ? zustand.seite + 1 : 0, liste: mehr ? [...zustand.liste, ...r.liste] : r.liste, mehr: r.mehr };
      studio.hinweis(`${zustand.liste.length} Treffer`, 'erfolg');
      zeichne();
    } catch (f) {
      studio.hinweis(String(f.message).replace(/^Error invoking remote method 'studio': (Error: )?/, ''), 'fehler');
    }
  };
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-art],[data-suche],[data-mehr],[data-schluessel],[data-import],[data-link],[data-hoeren]');
    if (!t) return;
    e.preventDefault();
    const d = t.dataset;
    if (d.art) {
      zustand = { ...zustand, art: d.art, quelle: Object.keys(quellen[d.art])[0], liste: [], mehr: false };
      return zeichne();
    }
    if (d.suche !== undefined) return suche();
    if (d.mehr !== undefined) return suche(true);
    if (d.link) return studio.nativ.aufruf('link.oeffnen', { url: d.link });
    if (d.hoeren) {
      hoeren?.pause();
      const b = await studio.nativ.aufruf('asset.holen', { url: zustand.liste[Number(d.hoeren)].hoeren });
      hoeren = new Audio(`data:${b.typ};base64,${b.base64}`);
      return hoeren.play();
    }
    if (d.schluessel !== undefined) {
      const q = quellen[zustand.art][zustand.quelle];
      const f = formular([{ name: 's', titel: `${q.name}-Schlüssel`, art: 'passwort', wert: '' }, { art: 'hinweis', html: `Kostenlos unter ${esc(q.seite)}. Wird verschlüsselt auf diesem Rechner gespeichert (nie im Repo). Leer = löschen.` }]);
      const w = await dialog({ titel: 'API-Schlüssel', icon: 'schloss', inhalt: f.element, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Speichern', art: 'primaer', wert: () => f.werte() }] });
      if (!w) return;
      await studio.nativ.aufruf('quellen.einstellen', { quelle: zustand.quelle, schluessel: w.s });
      quellen = await studio.nativ.aufruf('quellen.info');
      return zeichne();
    }
    if (d.import) {
      const eintrag = zustand.liste[Number(d.import)];
      try {
        studio.hinweis(`„${eintrag.titel}“ wird geladen …`);
        t.disabled = true;
        const text = await importiereAsset(studio, { art: zustand.art, quelle: zustand.quelle, id: eintrag.id, name: eintrag.titel });
        studio.hinweis(text, 'erfolg');
        if (zustand.art !== 'textur') document.querySelector('#dialog-ebene .dialog [data-x]')?.click(); // Werkstatt/Audio ist jetzt dran
      } catch (f) {
        t.disabled = false;
        studio.hinweis(String(f.message).replace(/^Error invoking remote method 'studio': (Error: )?/, ''), 'fehler');
      }
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.dataset.quelle !== undefined) {
      zustand = { ...zustand, quelle: e.target.value, liste: [], mehr: false };
      zeichne();
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.target.dataset.text !== undefined) {
      zustand.text = e.target.value;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        suche();
      }
    }
  }, true);
  el.addEventListener('input', (e) => {
    if (e.target.dataset.text !== undefined) zustand.text = e.target.value;
  });
  zeichne();
  await dialog({ titel: 'Im Internet suchen (CC0 / CC-BY)', icon: 'suche', klasse: 'sehr-breit', inhalt: el, ohneEnter: true, knoepfe: [{ text: 'Schließen', wert: null }] });
  hoeren?.pause();
}
