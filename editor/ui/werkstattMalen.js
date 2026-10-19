import * as THREE from 'three';
import { DecalGeometry } from '../../client/vendor/three/addons.js';
import { malGroesse, pinselSchritte, aufkleberGroesse, MAL_MAX } from '../kern/malen.js';
import { esc } from './dialoge.js';

/**
 * Texturwerk der Modell-Werkstatt (Editor 2.0, Schritt 5.2) – hängt an einer Werkstatt (ui/werkstatt.js, `w`).
 *   • Material bearbeiten: Farbe, Rauheit, Metall (live; je Bedienung 1 Undo-Schritt), Textur ersetzen (Bild → Leinwand,
 *     glTF-Konvention flipY = false, Farbe wird weiß damit das Bild nicht eingefärbt wird), Textur entfernen.
 *   • 🖌 Malen: Strich auf dem Modell (Raycast → UV) oder in der UV-Ansicht (Bild + UV-Netz der Teile). Jeder Strich malt auf
 *     eine KOPIE der Textur (neue Textur-Nr.) → Undo tauscht nur die Textur zurück. Ohne Textur entsteht eine Leinwand in der
 *     Materialfarbe. Teile ohne UV-Koordinaten lassen sich nicht bemalen (Meldung).
 *   • 🏷 Aufkleber: Bild wählen, Breite (m), Drehung (°) → Klick aufs Modell projiziert es (DecalGeometry), leicht entlang der
 *     Normalen versetzt (kein Flimmern im Spiel) und ins Modell eingebaut (eigenes Teil „Aufkleber n“, ausblendbar).
 * Stand fürs Undo: { uuid: [[r,g,b] linear, rauheit, metall, texturNr] } (Texturen liegen in this.texturen, Nr. → Textur).
 * Zeiger: eigener pointerdown in der Capture-Phase der Bühne – trifft der Strahl das Modell, wird die Orbit-Kamera für diesen
 * Zug abgeschaltet (sonst dreht sie wie gewohnt). Touch: ein Finger malt bzw. klebt.
 */
export class Texturwerk {
  constructor(w) {
    this.w = w;
    this.material = null;
    this.texturen = new Map([[0, null]]);
    this.texturNr = new WeakMap();
    this.naechste = 1;
    this.pinsel = { farbe: '#c0392b', groesse: 12, deckkraft: 1 };
    this.aufkleber = { bild: null, name: '', breite: 0.3, drehung: 0 };
    this.zug = null;
    this.strahl = new THREE.Raycaster();
    this.#zeiger();
  }

  // ------------------------------------------------------------------ Undo-Stand
  #nr(tex) {
    if (!tex) return 0;
    if (!this.texturNr.has(tex)) {
      this.texturNr.set(tex, this.naechste);
      this.texturen.set(this.naechste++, tex);
    }
    return this.texturNr.get(tex);
  }

  stand() {
    const s = {};
    for (const m of this.w.materialien()) s[m.uuid] = [m.color ? m.color.toArray() : null, m.roughness ?? null, m.metalness ?? null, this.#nr(m.map)];
    return s;
  }

  setzeStand(s = {}) {
    for (const m of this.w.materialien()) {
      const x = s[m.uuid];
      if (!x) continue;
      if (x[0] !== null && m.color) m.color.fromArray(x[0]);
      if (x[1] !== null && 'roughness' in m) m.roughness = x[1];
      if (x[2] !== null && 'metalness' in m) m.metalness = x[2];
      const map = this.texturen.get(x[3]) ?? null;
      if (m.map !== map) {
        m.map = map;
        m.needsUpdate = true;
      }
    }
    this.zeichneMaterial();
  }

  // ------------------------------------------------------------------ Material-Feld (Seitenleiste)
  waehleMaterial(m) {
    this.material = m ?? null;
    this.w.zeigeListen();
  }

  zeichneMaterial() {
    const box = this.w.el.querySelector('.werkstatt-material');
    const m = this.material;
    if (!m || !this.w.materialien().includes(m)) {
      box.innerHTML = '<p class="leise klein">Material anklicken = Farbe, Rauheit, Metall, Textur, Malen.</p>';
      return;
    }
    const hat = (f) => f in m && typeof m[f] === 'number';
    box.innerHTML = `<div class="werkstatt-matfeld">
        <b>${esc(m.name || 'Material')}</b>
        ${m.color ? `<label>Farbe <input type="color" data-f="farbe" value="#${m.color.getHexString()}"></label>` : ''}
        ${hat('roughness') ? `<label>Rauheit <input type="range" data-f="roughness" min="0" max="1" step="0.01" value="${m.roughness}"></label>` : ''}
        ${hat('metalness') ? `<label>Metall <input type="range" data-f="metalness" min="0" max="1" step="0.01" value="${m.metalness}"></label>` : ''}
        <div class="knopfreihe"><button type="button" data-t="bild">🖼 Textur ersetzen…</button>${m.map ? '<button type="button" data-t="weg">✖ Textur weg</button>' : ''}<button type="button" data-t="malen">🖌 Malen</button></div>
        ${m.map ? '<p class="leise klein">UV-Ansicht – hier malen geht auch:</p><canvas class="uv-ansicht"></canvas>' : ''}
      </div>`;
    let gemerkt = false;
    for (const eingabe of box.querySelectorAll('[data-f]')) {
      eingabe.addEventListener('input', () => {
        if (!gemerkt) (this.w.merke(), (gemerkt = true));
        if (eingabe.dataset.f === 'farbe') m.color.set(eingabe.value);
        else m[eingabe.dataset.f] = Number(eingabe.value);
        this.w.anfordern();
      });
      eingabe.addEventListener('change', () => {
        gemerkt = false;
        this.w.zeigeListen();
      });
    }
    box.querySelector('[data-t=bild]').addEventListener('click', () => this.#texturWaehlen(m));
    box.querySelector('[data-t=weg]')?.addEventListener('click', () => {
      this.w.merke();
      m.map = null;
      m.needsUpdate = true;
      this.w.zeigeListen();
      this.w.anfordern();
    });
    box.querySelector('[data-t=malen]').addEventListener('click', () => this.w.setzeModus('malen'));
    const uv = box.querySelector('canvas.uv-ansicht');
    if (uv) this.#uvAnsicht(uv, m);
  }

  #bildWaehlen() {
    return new Promise((ok) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
      input.addEventListener('change', async () => {
        const datei = input.files?.[0];
        if (!datei) return ok(null);
        try {
          const bild = await createImageBitmap(datei);
          ok({ bild, name: datei.name });
        } catch {
          this.w.zustand.meldung(`${datei.name}: kein lesbares Bild (PNG, JPG, WebP)`, 'fehler');
          ok(null);
        }
      });
      input.click();
    });
  }

  /** Bild → Leinwand (höchstens MAL_MAX) */
  #leinwand(bild, max = MAL_MAX) {
    const { b, h } = malGroesse(bild?.width, bild?.height, max);
    const c = document.createElement('canvas');
    c.width = b;
    c.height = h;
    if (bild) c.getContext('2d').drawImage(bild, 0, 0, b, h);
    return c;
  }

  #neueTextur(c, vorlage = null) {
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    if (vorlage) {
      t.wrapS = vorlage.wrapS;
      t.wrapT = vorlage.wrapT;
      t.repeat.copy(vorlage.repeat);
      t.offset.copy(vorlage.offset);
    }
    t.userData.malbar = true;
    return t;
  }

  async #texturWaehlen(m) {
    const gewaehlt = await this.#bildWaehlen();
    if (!gewaehlt) return;
    this.w.merke();
    m.map = this.#neueTextur(this.#leinwand(gewaehlt.bild), m.map);
    m.color?.set(0xffffff);
    m.needsUpdate = true;
    this.w.zustand.meldung(`🖼 Textur „${gewaehlt.name}“ gesetzt${this.#hatUv(m) ? '' : ' – ⚠ Teile ohne UV-Koordinaten zeigen sie nicht'}`, 'ok');
    this.w.zeigeListen();
    this.w.anfordern();
  }

  #teileMit(m) {
    return this.w.teile.filter((t) => [t.material].flat().includes(m));
  }

  #hatUv(m) {
    return this.#teileMit(m).some((t) => t.geometry?.attributes.uv);
  }

  // ------------------------------------------------------------------ Optionsleiste (Malen / Aufkleber)
  zeigeOptionen() {
    const leiste = this.w.el.querySelector('.werkstatt-optionen');
    const art = this.w.werkzeug;
    leiste.hidden = art === 'gizmo';
    if (art === 'malen') {
      leiste.innerHTML = `<b>🖌 Malen</b><label>Farbe <input type="color" data-p="farbe" value="${this.pinsel.farbe}"></label>
        <label>Größe <input type="range" data-p="groesse" min="1" max="64" value="${this.pinsel.groesse}"></label>
        <label>Deckkraft <input type="range" data-p="deckkraft" min="0.05" max="1" step="0.05" value="${this.pinsel.deckkraft}"></label>
        <span class="leise klein">auf dem Modell ziehen (daneben = Kamera drehen) · Alt+Klick = Farbe aufnehmen</span>`;
      for (const e of leiste.querySelectorAll('[data-p]')) e.addEventListener('input', () => (this.pinsel[e.dataset.p] = e.dataset.p === 'farbe' ? e.value : Number(e.value)));
    } else if (art === 'aufkleber') {
      const a = this.aufkleber;
      leiste.innerHTML = `<b>🏷 Aufkleber</b><button type="button" data-bild>🖼 Bild wählen…</button><span class="leise klein">${a.bild ? esc(a.name) : 'noch kein Bild (PNG mit Transparenz)'}</span>
        <label>Breite (m) <input type="number" data-a="breite" min="0.02" step="0.05" value="${a.breite}"></label>
        <label>Drehung ° <input type="number" data-a="drehung" step="15" value="${a.drehung}"></label>
        <span class="leise klein">Klick/Tippen aufs Modell klebt</span>`;
      leiste.querySelector('[data-bild]').addEventListener('click', async () => {
        const g = await this.#bildWaehlen();
        if (!g) return;
        a.bild = this.#leinwand(g.bild, 512);
        a.name = g.name;
        this.zeigeOptionen();
      });
      for (const e of leiste.querySelectorAll('[data-a]')) e.addEventListener('change', () => Number.isFinite(Number(e.value)) && (a[e.dataset.a] = Number(e.value)));
    } else leiste.innerHTML = '';
  }

  // ------------------------------------------------------------------ Zeiger auf der Bühne
  #zeiger() {
    const buehne = this.w.buehne;
    const runter = (e) => {
      if (this.w.werkzeug === 'gizmo' || e.button > 0) return;
      const treffer = this.#treffer(e, this.w.werkzeug === 'aufkleber');
      if (!treffer) return; // daneben → Orbit-Kamera wie immer
      this.w.orbit.enabled = false;
      buehne.setPointerCapture?.(e.pointerId);
      if (this.w.werkzeug === 'aufkleber') this.zug = { art: 'aufkleber', treffer, x: e.clientX, y: e.clientY };
      else if (e.altKey) this.#farbeAufnehmen(treffer);
      else this.#strichAnfang(treffer);
    };
    const bewegen = (e) => {
      if (this.zug?.art !== 'malen') return;
      const t = this.#treffer(e, false);
      if (t && this.#materialVon(t) === this.zug.m) this.#strich(t.uv);
      else this.zug.letzter = null;
    };
    const hoch = (e) => {
      const zug = this.zug;
      this.zug = null;
      this.w.orbit.enabled = true;
      if (zug?.art === 'aufkleber' && Math.hypot(e.clientX - zug.x, e.clientY - zug.y) < 8) this.#klebe(zug.treffer);
      if (zug?.art === 'malen') this.w.zeigeListen();
    };
    buehne.addEventListener('pointerdown', runter, true);
    buehne.addEventListener('pointermove', bewegen);
    buehne.addEventListener('pointerup', hoch);
    buehne.addEventListener('pointercancel', hoch);
  }

  /** Strahl unter dem Zeiger → erster sichtbarer Teil (Aufkleber selbst zählen beim Kleben nicht) */
  #treffer(e, ohneAufkleber) {
    const r = this.w.leinwand.getBoundingClientRect();
    const maus = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.strahl.setFromCamera(maus, this.w.kamera);
    const ziele = this.w.teile.filter((t) => t.visible && (!ohneAufkleber || !t.userData.aufkleber));
    return this.strahl.intersectObjects(ziele, false).find((t) => t.object.visible && this.#sichtbarBisOben(t.object)) ?? null;
  }

  #sichtbarBisOben(o) {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  }

  #materialVon(t) {
    const mats = [t.object.material].flat();
    return mats[t.face?.materialIndex ?? 0] ?? mats[0];
  }

  // ------------------------------------------------------------------ Malen
  #strichAnfang(t) {
    const m = t.materialFest ?? this.#materialVon(t);
    if (!t.uv) return this.w.zustand.meldung('Dieses Teil hat keine UV-Koordinaten – Malen geht hier nicht (Farbe im Material ändern)', 'fehler');
    this.w.merke();
    // Kopie der Textur (oder neue Leinwand in Materialfarbe) → Undo tauscht nur die Textur
    const alt = m.map;
    const c = this.#leinwand(alt?.image ?? null);
    if (!alt?.image) {
      const ctx = c.getContext('2d');
      ctx.fillStyle = m.color ? `#${m.color.getHexString()}` : '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      m.color?.set(0xffffff);
    }
    m.map = this.#neueTextur(c, alt);
    m.needsUpdate = true;
    this.material = m;
    this.zug = { art: 'malen', m, ctx: c.getContext('2d'), c, letzter: null };
    this.#strich(t.uv);
  }

  /** Strich bis uv (UV-Koordinaten, Wiederholung → 0..1) */
  #strich(uv) {
    const z = this.zug;
    const p = { u: ((uv.x % 1) + 1) % 1, v: ((uv.y % 1) + 1) % 1 };
    const radius = this.pinsel.groesse / 2;
    const schritt = Math.max(0.5, radius / 2) / Math.max(z.c.width, z.c.height);
    z.ctx.fillStyle = this.pinsel.farbe;
    z.ctx.globalAlpha = this.pinsel.deckkraft;
    for (const q of pinselSchritte(z.letzter, p, schritt)) {
      z.ctx.beginPath();
      z.ctx.arc(q.u * z.c.width, q.v * z.c.height, radius, 0, Math.PI * 2);
      z.ctx.fill();
    }
    z.ctx.globalAlpha = 1;
    z.letzter = p;
    z.m.map.needsUpdate = true;
    this.#uvNeu?.();
    this.w.anfordern();
  }

  #farbeAufnehmen(t) {
    const m = this.#materialVon(t);
    let farbe = m.color ? `#${m.color.getHexString()}` : '#ffffff';
    const bild = m.map?.image;
    if (bild && t.uv) {
      const c = this.#leinwand(bild);
      const d = c.getContext('2d').getImageData(Math.floor((((t.uv.x % 1) + 1) % 1) * c.width), Math.floor((((t.uv.y % 1) + 1) % 1) * c.height), 1, 1).data;
      farbe = `#${[d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    }
    this.pinsel.farbe = farbe;
    this.zeigeOptionen();
    this.w.zustand.meldung(`🖌 Farbe ${farbe} aufgenommen`);
  }

  /** UV-Ansicht: Textur + UV-Netz der Teile mit diesem Material; Malen mit Maus/Finger direkt in UV */
  #uvAnsicht(leinwand, m) {
    const bild = m.map.image;
    const breite = leinwand.parentElement.clientWidth || 260;
    const verh = bild?.height && bild?.width ? bild.height / bild.width : 1;
    leinwand.width = breite;
    leinwand.height = Math.round(breite * verh);
    const zeichne = () => {
      const ctx = leinwand.getContext('2d');
      ctx.clearRect(0, 0, leinwand.width, leinwand.height);
      if (m.map?.image) ctx.drawImage(m.map.image, 0, 0, leinwand.width, leinwand.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      let n = 0;
      for (const t of this.#teileMit(m)) {
        const uv = t.geometry?.attributes.uv;
        if (!uv) continue;
        const idx = t.geometry.index;
        const anzahl = idx ? idx.count : uv.count;
        for (let i = 0; i + 2 < anzahl && n < 20000; i += 3, n++) {
          const ecken = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
          ecken.forEach((e, k) => {
            const x = (((uv.getX(e) % 1) + 1) % 1) * leinwand.width;
            const y = (((uv.getY(e) % 1) + 1) % 1) * leinwand.height;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
      }
      ctx.stroke();
    };
    let wartet = false;
    this.#uvNeu = () => {
      if (wartet || !leinwand.isConnected) return;
      wartet = true;
      requestAnimationFrame(() => ((wartet = false), zeichne()));
    };
    zeichne();
    const uvBei = (e) => {
      const r = leinwand.getBoundingClientRect();
      return new THREE.Vector2((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    leinwand.addEventListener('pointerdown', (e) => {
      leinwand.setPointerCapture(e.pointerId);
      this.#strichAnfang({ object: this.#teileMit(m)[0], uv: uvBei(e), face: null, materialFest: m });
    });
    leinwand.addEventListener('pointermove', (e) => this.zug?.art === 'malen' && this.zug.m === m && this.#strich(uvBei(e)));
    const ende = () => {
      if (this.zug?.art !== 'malen') return;
      this.zug = null;
      this.w.zeigeListen();
    };
    leinwand.addEventListener('pointerup', ende);
    leinwand.addEventListener('pointercancel', ende);
  }

  #uvNeu = null;

  // ------------------------------------------------------------------ Aufkleber
  #klebe(t) {
    const a = this.aufkleber;
    if (!a.bild) return this.w.zustand.meldung('Erst ein Bild für den Aufkleber wählen (🖼 in der Leiste oben)', 'fehler');
    const ziel = t.object;
    const normale = t.face.normal.clone().transformDirection(ziel.matrixWorld);
    const helfer = new THREE.Object3D();
    helfer.position.copy(t.point);
    helfer.lookAt(t.point.clone().add(normale));
    helfer.rotateZ(THREE.MathUtils.degToRad(a.drehung));
    const g = aufkleberGroesse(a.breite, a.bild.width, a.bild.height);
    this.w.modell.updateMatrixWorld(true);
    const geo = new DecalGeometry(ziel, t.point, helfer.rotation, new THREE.Vector3(g.x, g.y, g.z));
    const pos = geo.attributes.position;
    if (!pos?.count) return this.w.zustand.meldung('Der Aufkleber trifft hier keine Fläche', 'fehler');
    // leicht nach außen (gegen Flimmern), dann in Modell-Koordinaten einbauen
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.002, pos.getY(i) + nor.getY(i) * 0.002, pos.getZ(i) + nor.getZ(i) * 0.002);
    geo.applyMatrix4(this.w.modell.matrixWorld.clone().invert());
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(a.bild);
    tex.colorSpace = THREE.SRGBColorSpace;
    const n = this.w.teile.filter((x) => x.userData.aufkleber).length + 1;
    const mat = new THREE.MeshStandardMaterial({ name: `Aufkleber ${n}`, map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.8 });
    mat.wireframe = !!this.w.el.querySelector('[data-schalter=draht]')?.checked;
    const netz = new THREE.Mesh(geo, mat);
    netz.name = `Aufkleber ${n}`;
    netz.userData.aufkleber = true;
    this.w.merke(); // vor dem Einbauen: älterer Stand kennt den Aufkleber nicht → Undo blendet ihn aus
    this.w.modell.add(netz);
    this.w.objekte.push(netz);
    this.w.teile.push(netz);
    this.w.aktualisiere();
    this.w.zeigeListen();
    this.w.zustand.meldung(`🏷 ${netz.name} aufgeklebt (Teile-Liste: ausblenden = weg)`, 'ok');
  }

  ende() {
    this.#uvNeu = null;
    for (const t of this.texturen.values()) t?.dispose?.();
  }
}
