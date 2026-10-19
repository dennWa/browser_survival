import * as THREE from 'three';
import { GLTFLoader, GLTFExporter, OrbitControls, TransformControls } from '../../client/vendor/three/addons.js';
import { glbInfo, verwendungen, dataUrlZuBytes, MODELL_MAX_MB } from '../kern/bibliothek.js';
import { WerkstattVerlauf, neueVersionMeta, bodenVersatz, drehpunktVersatz, versionOps } from '../kern/werkstatt.js';
import { vorschauBild } from './modellImport.js';
import { Texturwerk } from './werkstattMalen.js';
import { dialog, bestaetigen, esc, feldHtml, istDialogOffen } from './dialoge.js';

/**
 * Modell-Werkstatt (Editor 2.0, Schritt 5.1): großes Fenster über dem Editor für ein Modell der Bibliothek.
 *   • Bühne: Orbit-Kamera (ziehen = drehen, rechts/2 Finger = schieben, Rad/Pinch = Zoom), Raster 1 m = 1 Kachel,
 *     Licht, Drahtgitter, Fußabdruck (Rechteck am Boden) + Kollisionsbox (Hülle der sichtbaren Teile).
 *   • Gizmo (TransformControls) für das ganze Modell oder ein Teil: ✥ verschieben (W) · ⟳ drehen (E) · ⤢ skalieren (R);
 *     Umschalt = Raster (0,1 m / 15° / 0,1). Zahlenfelder für Position/Drehung/Größe (genau + Touch).
 *   • ⬇ Auf den Boden (Unterkante y = 0) · ⊙ Drehpunkt unten mittig. Teile-Liste (wählen, 👁 aus-/einblenden – ausgeblendete
 *     Teile fehlen in der neuen Version), Material-Liste.
 *   • Schritt 5.2 (ui/werkstattMalen.js, Texturwerk): Material bearbeiten (Farbe, Rauheit, Metall), Textur ersetzen/entfernen,
 *     🖌 Malen (B) direkt aufs Modell oder in der UV-Ansicht, 🏷 Aufkleber (K) projizieren (DecalGeometry, wird ein Teil).
 *   • Eigenes Undo (Strg+Z / Strg+Y, kern/werkstatt.WerkstattVerlauf, 60 Schritte), unabhängig vom Karten-Verlauf.
 *     Stand = alle Knoten (Lage, sichtbar) + alle Materialien (Farbe, Rauheit, Metall, Textur-Nr.).
 *   • 💾 Speichern = NEUE Bibliotheks-Version (GLTFExporter, Animationen bleiben; `basis` = Original, Name „… v2“).
 *     Das Original bleibt. Benutzen Zonen das Original, fragt die Werkstatt, ob deren Typen umgestellt werden (je Zone
 *     1 Undo-Schritt, optional mit neuer Größe).
 * Tastatur: solange offen, gehen Tasten nicht an den Editor (Capture auf window). Esc = schließen (fragt bei Änderungen).
 * Aufruf: `oeffneWerkstatt({ id, bibliothek, zustand })` → Promise<neue Meta | null>. Konsole: `window.mapEditor.aktionen.werkstatt(id)`.
 */
const RASTER = { verschieben: 0.1, drehen: THREE.MathUtils.degToRad(15), skalieren: 0.1 };
const MODI = [
  ['translate', '✥ Schieben', 'W'],
  ['rotate', '⟳ Drehen', 'E'],
  ['scale', '⤢ Größe', 'R'],
];

let offen = null;
export const werkstattOffen = () => offen !== null;
/** Offene Werkstatt (für Rauchtest/Konsole) */
export const aktiveWerkstatt = () => offen;

export async function oeffneWerkstatt({ id, bibliothek, zustand }) {
  const alt = bibliothek.meta(id);
  const url = bibliothek.url(id);
  if (!alt || !url) return zustand.meldung('Modell fehlt in der Bibliothek', 'fehler'), null;
  if (offen) return null;
  let gltf;
  try {
    const bytes = dataUrlZuBytes(url);
    gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  } catch (e) {
    zustand.meldung(`Modell lässt sich nicht laden: ${e.message ?? e}`, 'fehler');
    return null;
  }
  return new Promise((fertig) => {
    offen = new Werkstatt({ alt, gltf, bibliothek, zustand, fertig });
  });
}

class Werkstatt {
  constructor({ alt, gltf, bibliothek, zustand, fertig }) {
    this.alt = alt;
    this.bibliothek = bibliothek;
    this.zustand = zustand;
    this.fertig = fertig;
    this.modell = gltf.scene;
    this.clips = gltf.animations ?? [];
    this.verlauf = new WerkstattVerlauf(60);
    this.gewaehlt = this.modell;
    this.objekte = [];
    this.modell.traverse((o) => this.objekte.push(o));
    this.teile = this.objekte.filter((o) => o.isMesh);
    this.werkzeug = 'gizmo';
    this.#baueDom();
    this.#baueSzene();
    this.texturwerk = new Texturwerk(this);
    this.#tasten = (e) => this.#taste(e);
    window.addEventListener('keydown', this.#tasten, true);
    window.addEventListener('keyup', this.#tasten, true);
    this.zeigeListen();
    this.aktualisiere();
    this.rahmen();
  }

  #tasten;

  // ------------------------------------------------------------------ DOM
  #baueDom() {
    const w = document.createElement('div');
    w.className = 'werkstatt';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-label', 'Modell-Werkstatt');
    w.innerHTML = `<header class="werkstatt-kopf">
        <b>🛠 Werkstatt</b><span class="leise werkstatt-name" title="${esc(this.alt.name)}">${esc(this.alt.name)}</span>
        <span class="trenner"></span>
        <button type="button" data-a="zurueck" title="Rückgängig (Strg+Z)">↶</button><button type="button" data-a="vor" title="Wiederholen (Strg+Y)">↷</button>
        <span class="trenner"></span>
        ${MODI.map(([m, t, k]) => `<button type="button" data-modus="${m}" title="${t} (${k}) – Umschalt = Raster">${t}</button>`).join('')}
        <button type="button" data-modus="malen" title="Auf das Modell malen (B)">🖌 Malen</button>
        <button type="button" data-modus="aufkleber" title="Aufkleber/Decal aufs Modell projizieren (K)">🏷 Aufkleber</button>
        <span class="trenner"></span>
        <button type="button" data-a="boden" title="Unterkante auf den Boden (y = 0)">⬇ Boden</button>
        <button type="button" data-a="drehpunkt" title="Drehpunkt unten in die Mitte">⊙ Drehpunkt</button>
        <button type="button" data-a="rahmen" title="Kamera aufs Modell (F)">⌖</button>
        <span class="trenner"></span>
        <label><input type="checkbox" data-schalter="raster" checked> Raster</label>
        <label title="Drahtgitter"><input type="checkbox" data-schalter="draht"> Draht</label>
        <label title="Fußabdruck + Kollisionsbox"><input type="checkbox" data-schalter="box" checked> Box</label>
        <span class="fueller"></span>
        <button type="button" data-a="abbrechen" title="Schließen (Esc)" aria-label="Schließen">✕</button>
        <button type="button" class="akzent" data-a="speichern" title="Als neue Version in die Bibliothek (Strg+S) – das Original bleibt">💾 Speichern</button>
      </header>
      <div class="werkstatt-optionen" hidden></div>
      <div class="werkstatt-koerper">
        <div class="werkstatt-buehne"><canvas></canvas><p class="werkstatt-hilfe leise">Ziehen = Kamera drehen · Rechts/2 Finger = schieben · Rad/Pinch = Zoom · Gizmo ziehen = bearbeiten · Umschalt = Raster</p></div>
        <aside class="werkstatt-seite">
          <h4>Maße</h4><p class="werkstatt-info"></p>
          <h4>Auswahl: <span data-auswahl></span></h4><div class="werkstatt-werte"></div>
          <h4>Teile</h4><div class="werkstatt-teile"></div>
          <h4>Materialien</h4><div class="werkstatt-materialien"></div><div class="werkstatt-material"></div>
        </aside>
      </div>`;
    document.body.append(w);
    this.el = w;
    this.leinwand = w.querySelector('canvas');
    this.buehne = w.querySelector('.werkstatt-buehne');
    w.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.modus) return this.setzeModus(b.dataset.modus);
      const a = b.dataset.a;
      if (a === 'zurueck') this.rueckgaengig();
      else if (a === 'vor') this.wiederholen();
      else if (a === 'boden') this.versetze(bodenVersatz(this.huelle()), 'boden');
      else if (a === 'drehpunkt') this.versetze(drehpunktVersatz(this.huelle()), 'drehpunkt');
      else if (a === 'rahmen') this.rahmen();
      else if (a === 'abbrechen') this.schliesse();
      else if (a === 'speichern') this.speichere();
    });
    w.addEventListener('change', (e) => {
      const s = e.target.dataset.schalter;
      if (s === 'raster') this.raster.visible = e.target.checked;
      else if (s === 'box') this.boxHilfe.visible = this.fuss.visible = e.target.checked;
      else if (s === 'draht') for (const m of this.materialien()) m.wireframe = e.target.checked;
      this.anfordern();
    });
    w.querySelector('.werkstatt-materialien').addEventListener('click', (e) => {
      const uuid = e.target.closest('[data-material]')?.dataset.material;
      if (uuid) this.texturwerk.waehleMaterial(this.materialien().find((m) => m.uuid === uuid));
    });
    // Teile: Name = wählen, 👁 = ein/aus
    w.querySelector('.werkstatt-teile').addEventListener('click', (e) => {
      const z = e.target.closest('[data-teil]');
      if (!z) return;
      const nr = Number(z.dataset.teil);
      const teil = nr < 0 ? this.modell : this.teile[nr];
      if (e.target.closest('[data-auge]')) {
        this.merke();
        teil.visible = !teil.visible;
        this.aktualisiere();
        this.zeigeListen();
      } else this.waehle(teil);
    });
  }

  // ------------------------------------------------------------------ Szene
  #baueSzene() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x1b2027);
    this.szene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const sonne = new THREE.DirectionalLight(0xffffff, 1.8);
    sonne.position.set(4, 8, 5);
    this.szene.add(sonne);
    this.raster = new THREE.GridHelper(20, 20, 0x5a6578, 0x343a46);
    this.szene.add(this.raster, new THREE.AxesHelper(0.6));
    this.szene.add(this.modell);
    // Fußabdruck (Rechteck am Boden) + Kollisionsbox (Hülle) + Rahmen ums gewählte Teil
    this.fuss = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([0, 1, 2, 3].map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xf5b83d }));
    this.boxHilfe = new THREE.Box3Helper(new THREE.Box3(), 0x4fc3ff);
    this.teilHilfe = new THREE.Box3Helper(new THREE.Box3(), 0xffffff);
    this.szene.add(this.fuss, this.boxHilfe, this.teilHilfe);
    this.kamera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    this.kamera.position.set(3, 2.5, 4);
    this.orbit = new OrbitControls(this.kamera, this.leinwand);
    this.orbit.addEventListener('change', () => this.anfordern());
    this.gizmo = new TransformControls(this.kamera, this.leinwand);
    if (globalThis.matchMedia?.('(pointer: coarse)').matches) this.gizmo.size = 1.4;
    this.gizmo.addEventListener('dragging-changed', (e) => (this.orbit.enabled = !e.value));
    this.gizmo.addEventListener('mouseDown', () => this.merke());
    this.gizmo.addEventListener('objectChange', () => this.aktualisiere());
    this.gizmo.addEventListener('mouseUp', () => this.#zeigeWerte());
    this.gizmo.addEventListener('change', () => this.anfordern());
    this.szene.add(this.gizmo.getHelper());
    this.gizmo.attach(this.modell);
    this.setzeModus('translate');
    this.beobachter = new ResizeObserver(() => this.#groesse());
    this.beobachter.observe(this.buehne);
    this.#groesse();
  }

  #groesse() {
    const b = this.buehne.clientWidth || 600;
    const h = this.buehne.clientHeight || 400;
    this.renderer.setSize(b, h, false);
    this.kamera.aspect = b / h;
    this.kamera.updateProjectionMatrix();
    this.anfordern();
  }

  anfordern() {
    if (this.#bild) return;
    this.#bild = requestAnimationFrame(() => {
      this.#bild = 0;
      this.renderer.render(this.szene, this.kamera);
    });
  }

  #bild = 0;

  /** Hülle der sichtbaren Teile (Weltkoordinaten) */
  huelle() {
    const box = new THREE.Box3();
    this.modell.updateMatrixWorld(true);
    this.modell.traverseVisible((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    return box;
  }

  #dreiecke() {
    let n = 0;
    this.modell.traverseVisible((o) => {
      if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position?.count ?? 0)) / 3;
    });
    return Math.round(n);
  }

  materialien() {
    const m = new Map();
    for (const t of this.teile) for (const x of [t.material].flat()) if (x) m.set(x.uuid, x);
    return [...m.values()];
  }

  // ------------------------------------------------------------------ Bearbeiten
  /** translate | rotate | scale (Gizmo) oder malen | aufkleber (Texturwerk) */
  setzeModus(modus) {
    this.werkzeug = modus === 'malen' || modus === 'aufkleber' ? modus : 'gizmo';
    if (this.werkzeug === 'gizmo') {
      this.gizmo.setMode(modus);
      this.gizmo.attach(this.gewaehlt);
    } else this.gizmo.detach();
    for (const b of this.el.querySelectorAll('[data-modus]')) b.classList.toggle('aktiv', b.dataset.modus === modus);
    this.texturwerk?.zeigeOptionen();
    this.anfordern();
  }

  waehle(obj) {
    this.gewaehlt = obj;
    if (this.werkzeug === 'gizmo') this.gizmo.attach(obj);
    this.zeigeListen();
    this.aktualisiere();
  }

  /** Ganzes Modell um v = {x,y,z} verschieben (1 Undo-Schritt) */
  versetze(v, grund) {
    if (!v.x && !v.y && !v.z) return this.zustand.meldung(grund === 'boden' ? 'Steht schon auf dem Boden' : 'Drehpunkt ist schon mittig');
    this.merke();
    this.modell.position.add(new THREE.Vector3(v.x, v.y, v.z));
    this.aktualisiere();
    this.#zeigeWerte();
  }

  /**
   * Stand aller Knoten (Position, Drehung, Größe, sichtbar – reihenfolgestabil) + Materialien. Knoten, die erst später
   * dazukamen (Aufkleber), fehlen in älteren Ständen → beim Wiederherstellen ausgeblendet (= nicht exportiert).
   */
  stand() {
    return { knoten: this.objekte.map((o) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.visible ? 1 : 0]), material: this.texturwerk.stand() };
  }

  #setzeStand(s) {
    this.objekte.forEach((o, i) => {
      const w = s.knoten[i];
      if (!w) return void (o.visible = false);
      o.position.fromArray(w, 0);
      o.quaternion.fromArray(w, 3);
      o.scale.fromArray(w, 7);
      o.visible = w[10] === 1;
    });
    this.texturwerk.setzeStand(s.material);
    this.aktualisiere();
    this.zeigeListen();
  }

  merke() {
    this.verlauf.merke(this.stand());
    this.#knoepfe();
  }

  rueckgaengig() {
    const s = this.verlauf.rueckgaengig(this.stand());
    if (s) this.#setzeStand(s);
    this.#knoepfe();
  }

  wiederholen() {
    const s = this.verlauf.wiederholen(this.stand());
    if (s) this.#setzeStand(s);
    this.#knoepfe();
  }

  #knoepfe() {
    this.el.querySelector('[data-a=zurueck]').disabled = !this.verlauf.kannZurueck;
    this.el.querySelector('[data-a=vor]').disabled = !this.verlauf.kannVor;
  }

  /** Kamera auf das Modell richten */
  rahmen() {
    const box = this.huelle();
    if (box.isEmpty()) return;
    const mitte = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const abstand = r / Math.sin(THREE.MathUtils.degToRad(this.kamera.fov / 2)) * 1.1;
    this.kamera.position.copy(mitte).add(new THREE.Vector3(0.8, 0.6, 1).normalize().multiplyScalar(abstand));
    this.kamera.near = Math.max(0.005, r / 200);
    this.kamera.far = Math.max(100, abstand * 20);
    this.kamera.updateProjectionMatrix();
    this.orbit.target.copy(mitte);
    this.orbit.update();
    this.anfordern();
  }

  /** Hilfslinien + Maße neu */
  aktualisiere() {
    const box = this.huelle();
    const leer = box.isEmpty();
    this.boxHilfe.box.copy(leer ? new THREE.Box3() : box);
    const p = this.fuss.geometry.attributes.position;
    if (!leer) {
      const y = 0.005;
      [
        [box.min.x, box.min.z],
        [box.max.x, box.min.z],
        [box.max.x, box.max.z],
        [box.min.x, box.max.z],
      ].forEach(([x, z], i) => p.setXYZ(i, x, y, z));
      p.needsUpdate = true;
      this.fuss.geometry.computeBoundingSphere();
    }
    const teilBox = this.gewaehlt !== this.modell && this.gewaehlt.isMesh ? new THREE.Box3().setFromObject(this.gewaehlt) : null;
    this.teilHilfe.visible = !!teilBox;
    if (teilBox) this.teilHilfe.box.copy(teilBox);
    const g = leer ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const z = (w, n = 2) => w.toLocaleString('de-DE', { maximumFractionDigits: n });
    this.el.querySelector('.werkstatt-info').innerHTML = `Fußabdruck <b>${z(g.x, 1)} × ${z(g.z, 1)}</b> Kacheln · Höhe <b>${z(g.y)} m</b><br>${this.#dreiecke().toLocaleString('de-DE')} Dreiecke${this.clips.length ? ` · ${this.clips.length} Animation${this.clips.length > 1 ? 'en' : ''}` : ''}${!leer && box.min.y < -0.01 ? '<br><span style="color:var(--gelb)">⚠ ragt unter den Boden</span>' : ''}${!leer && box.min.y > 0.01 ? '<br><span style="color:var(--gelb)">⚠ schwebt über dem Boden</span>' : ''}`;
    this.el.querySelector('[data-auswahl]').textContent = this.gewaehlt === this.modell ? 'ganzes Modell' : teilName(this.gewaehlt, this.teile.indexOf(this.gewaehlt));
    this.anfordern();
  }

  /** Zahlenfelder für das gewählte Objekt (Position m, Drehung °, Größe ×) */
  #zeigeWerte() {
    const o = this.gewaehlt;
    const grad = (r) => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10;
    const r3 = (w) => Math.round(w * 1000) / 1000;
    const felder = [
      ['px', 'x (m)', r3(o.position.x), 0.05],
      ['py', 'y (m)', r3(o.position.y), 0.05],
      ['pz', 'z (m)', r3(o.position.z), 0.05],
      ['rx', 'Drehung x °', grad(o.rotation.x), 15],
      ['ry', 'Drehung y °', grad(o.rotation.y), 15],
      ['rz', 'Drehung z °', grad(o.rotation.z), 15],
      ['sx', 'Größe x', r3(o.scale.x), 0.1],
      ['sy', 'Größe y', r3(o.scale.y), 0.1],
      ['sz', 'Größe z', r3(o.scale.z), 0.1],
    ];
    const box = this.el.querySelector('.werkstatt-werte');
    box.innerHTML = `<div class="werte-raster">${felder.map(([n, l, w, s]) => `<label>${l}<input type="number" name="${n}" value="${w}" step="${s}"></label>`).join('')}</div>
      <div class="knopfreihe"><button type="button" data-gleich>⤢ Größe gleichmäßig ×</button><button type="button" data-null>⟲ Zurücksetzen</button></div>`;
    box.querySelectorAll('input').forEach((i) =>
      i.addEventListener('change', () => {
        const v = Number(i.value);
        if (!Number.isFinite(v)) return;
        if (i.name[0] === 's' && v === 0) return this.zustand.meldung('Größe 0 geht nicht', 'fehler');
        this.merke();
        const achse = i.name[1];
        if (i.name[0] === 'p') o.position[achse] = v;
        else if (i.name[0] === 'r') o.rotation[achse] = THREE.MathUtils.degToRad(v);
        else o.scale[achse] = v;
        this.aktualisiere();
      }),
    );
    box.querySelector('[data-gleich]').addEventListener('click', async () => {
      const w = await dialog({ titel: '⤢ Größe gleichmäßig', html: feldHtml({ name: 'f', label: 'Faktor', typ: 'zahl', wert: 1, min: 0.01, schritt: 0.1, hilfe: 'z. B. 0.01 für Modelle in cm, 2 = doppelt so groß' }), knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Anwenden', art: 'akzent', wert: (b) => Number(b.querySelector('[name=f]').value) }] });
      if (!(w > 0) || w === 1) return;
      this.merke();
      o.scale.multiplyScalar(w);
      this.aktualisiere();
      this.#zeigeWerte();
    });
    box.querySelector('[data-null]').addEventListener('click', () => {
      this.merke();
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      this.aktualisiere();
      this.#zeigeWerte();
    });
  }

  zeigeListen() {
    const zeile = (nr, name, sichtbar, aktiv, extra = '') =>
      `<div class="werkstatt-zeile${aktiv ? ' aktiv' : ''}" data-teil="${nr}"><button type="button" class="name">${esc(name)}</button>${extra}${nr >= 0 ? `<button type="button" data-auge title="ein-/ausblenden">${sichtbar ? '👁' : '🚫'}</button>` : ''}</div>`;
    this.el.querySelector('.werkstatt-teile').innerHTML =
      zeile(-1, '🧊 Ganzes Modell', true, this.gewaehlt === this.modell) +
      this.teile.map((t, i) => zeile(i, teilName(t, i), t.visible, this.gewaehlt === t, `<span class="leise klein">${Math.round((t.geometry?.index?.count ?? t.geometry?.attributes.position?.count ?? 0) / 3)} ▲</span>`)).join('');
    const nutzung = new Map();
    for (const t of this.teile) for (const m of [t.material].flat()) if (m) nutzung.set(m.uuid, (nutzung.get(m.uuid) ?? 0) + 1);
    this.el.querySelector('.werkstatt-materialien').innerHTML =
      this.materialien()
        .map((m) => `<div class="werkstatt-zeile${this.texturwerk.material === m ? ' aktiv' : ''}" data-material="${m.uuid}"><span class="farbe" style="background:${m.color ? `#${m.color.getHexString()}` : 'transparent'}"></span><button type="button" class="name">${esc(m.name || 'Material')}</button><span class="leise klein">${nutzung.get(m.uuid)}× · ${m.map ? 'Textur' : 'Farbe'}</span></div>`)
        .join('');
    this.texturwerk.zeichneMaterial();
    this.#zeigeWerte();
    this.#knoepfe();
  }

  // ------------------------------------------------------------------ Tastatur
  #taste(e) {
    if (istDialogOffen()) return; // Rückfrage-Dialog über der Werkstatt bekommt die Tasten
    e.stopPropagation(); // nichts an den Editor
    const inEingabe = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox';
    if (e.key === 'Shift') {
      const an = e.type === 'keydown';
      this.gizmo.setTranslationSnap(an ? RASTER.verschieben : null);
      this.gizmo.setRotationSnap(an ? RASTER.drehen : null);
      this.gizmo.setScaleSnap(an ? RASTER.skalieren : null);
      return;
    }
    if (e.type !== 'keydown' || inEingabe) return;
    const strg = e.ctrlKey || e.metaKey;
    const t = e.key.toLowerCase();
    if (strg && t === 'z') (e.shiftKey ? this.wiederholen() : this.rueckgaengig(), e.preventDefault());
    else if (strg && t === 'y') (this.wiederholen(), e.preventDefault());
    else if (strg && t === 's') (this.speichere(), e.preventDefault());
    else if (strg) return;
    else if (t === 'w') this.setzeModus('translate');
    else if (t === 'e') this.setzeModus('rotate');
    else if (t === 'r') this.setzeModus('scale');
    else if (t === 'b') this.setzeModus('malen');
    else if (t === 'k') this.setzeModus('aufkleber');
    else if (t === 'f') this.rahmen();
    else if (e.key === 'Escape') this.schliesse();
  }

  // ------------------------------------------------------------------ Speichern / Schließen
  async speichere() {
    if (!this.verlauf.geaendert) return this.zustand.meldung('Noch nichts geändert – das Original bleibt wie es ist');
    const draht = this.el.querySelector('[data-schalter=draht]');
    if (draht.checked) (draht.checked = false, draht.dispatchEvent(new Event('change', { bubbles: true })));
    let bytes;
    try {
      this.zustand.meldung('⟳ neue Version wird gebaut …');
      bytes = new Uint8Array(await new GLTFExporter().parseAsync(this.modell, { binary: true, animations: this.clips, onlyVisible: true, maxTextureSize: 1024 }));
    } catch (e) {
      return this.zustand.meldung(`Speichern fehlgeschlagen: ${e.message ?? e}`, 'fehler');
    }
    if (bytes.length > MODELL_MAX_MB * 1024 * 1024) return this.zustand.meldung(`Neue Version zu groß (${(bytes.length / 1048576).toFixed(1)} MB, max. ${MODELL_MAX_MB}) – Texturen verkleinern oder Teile ausblenden`, 'fehler');
    const info = glbInfo(bytes);
    if (info.fehler.length) return this.zustand.meldung(`Speichern fehlgeschlagen: ${info.fehler.join('; ')}`, 'fehler');
    const g = this.huelle().getSize(new THREE.Vector3());
    const meta = neueVersionMeta(this.alt, { groesse: g, dreiecke: info.dreiecke, animationen: info.animationen, vorschau: vorschauBild(this.modell) }, this.bibliothek.liste.map((m) => m.name));
    const { meta: neu, neu: istNeu } = await this.bibliothek.fuegeHinzu(bytes, meta);
    if (!istNeu) this.zustand.meldung(`Diese Fassung gibt es schon („${neu.name}“)`);
    // Zonen, die das Original benutzen: Typen umstellen?
    const karten = new Map([...this.zustand.zonen].map(([zid, e]) => [zid, e.karte]));
    const v = verwendungen(karten, this.alt.id);
    if (v.typen && neu.id !== this.alt.id) {
      const w = await dialog({
        titel: `🛠 „${neu.name}“ gespeichert`,
        html: `<p>Das Original „${esc(this.alt.name)}“ wird in ${v.zonen.length} Zone(n) von ${v.objekte} Objekt(en) benutzt.</p><p>Sollen diese Zonen die neue Version zeigen? (je Zone rückgängig machbar)</p>${feldHtml({ name: 'groesse', label: `Größe der Typen anpassen (${neu.masse.b} × ${neu.masse.h} Kacheln, ${neu.masse.hoehe} m hoch)`, typ: 'haken', wert: false })}`,
        knoepfe: [{ text: 'Nein, Original lassen', wert: null }, { text: 'Umstellen', art: 'akzent', wert: (b) => ({ groesse: b.querySelector('[name=groesse]').checked }) }],
      });
      if (w)
        for (const z of v.zonen) {
          const karte = this.zustand.zonen.get(z.id).karte;
          this.zustand.ausfuehren(`Modell „${this.alt.name}“ → „${neu.name}“`, versionOps(karte, this.alt.id, neu, { mitGroesse: w.groesse }), karte, { alleEbenen: true });
        }
    }
    this.zustand.meldung(`💾 „${neu.name}“ in der Bibliothek – das Original bleibt`, 'ok');
    this.#ende(neu);
  }

  async schliesse() {
    if (this.verlauf.geaendert && !(await bestaetigen('Werkstatt schließen', 'Änderungen verwerfen? (Das Original bleibt unverändert.)', { ok: 'Verwerfen', gefahr: true }))) return;
    this.#ende(null);
  }

  #ende(ergebnis) {
    window.removeEventListener('keydown', this.#tasten, true);
    window.removeEventListener('keyup', this.#tasten, true);
    this.beobachter.disconnect();
    cancelAnimationFrame(this.#bild);
    this.texturwerk.ende();
    this.gizmo.detach();
    this.gizmo.dispose();
    this.orbit.dispose();
    this.szene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) m?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.el.remove();
    offen = null;
    this.fertig(ergebnis);
  }
}

const teilName = (t, i) => t.name || `Teil ${i + 1}`;
