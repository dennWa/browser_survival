import * as THREE from 'three';
import { knochenEnde, knotenName, spurNachUmbenennen, knochenForm, standardLaenge, KNOCHEN_MIN } from '../kern/knochen.js';
import { dialog, esc, feldHtml } from './dialoge.js';

/**
 * Knochenwerk der Modell-Werkstatt (Feedback 6.7, „Gelenke wie in Blender“) – hängt an einer Werkstatt (`w.knochenwerk`).
 * Vorher gab es nur „⊕ Gelenk…“ (unsichtbarer Drehpunkt, nur mit gewähltem Teil, keine Kette, kein Umbenennen/Löschen,
 * nicht in der Bühne anklickbar, nur als Knopfliste) – deshalb „geht noch nicht“. Jetzt:
 *   • 🦴 Knochen anlegen: am gewählten Teil (Kopf unten mittig, zeigt nach oben, Länge = Teilhöhe, das Teil hängt dann daran),
 *     am Modell (Wurzel-Knochen) oder – ist ein Knochen gewählt – ⤴ Extrude: Kind-Knochen am Ende (Kette).
 *   • 🔗 Teile binden (starr: Teil hängt am Knochen, Lage bleibt – `attach`), ✎ Umbenennen (alle Knoten, Spuren der Clips
 *     ziehen mit), 🗑 Löschen (Kinder wandern zum Eltern-Knoten), Länge als Zahlenfeld, Gizmo dreht/verschiebt den Knochen.
 *   • Anzeige: Oktaeder-Knochen (Blender-Look, kern/knochen.knochenForm) + Kopf-Kugel als Overlay in der Szene (NICHT im
 *     Modell → wird nicht exportiert), gewählter Knochen gelb; Klick in der Bühne wählt Knochen bzw. Teil.
 *   • Baumliste (`baum()`): ganze Hierarchie eingerückt (🧊 Modell · 🦴 Knochen · ⊕ Gelenk · ▲ Teil · ▢ Knoten).
 * Daten: Knochen = Object3D mit userData.knochen = { laenge } (→ glTF extras, kommt beim Laden zurück); importierte
 * THREE.Bone (Skelette) werden genauso angezeigt/gewählt (Länge = Abstand zum ersten Kind-Knochen). Undo: Werkstatt-Stand
 * (Knoten-Lage/Eltern/sichtbar + `meta` = [Name, Länge] je Knoten). Gelöschte Knochen sind unsichtbar (onlyVisible-Export).
 */
export class Knochenwerk {
  constructor(w) {
    this.w = w;
    this.anzeige = new THREE.Group();
    this.anzeige.name = '__knochenAnzeige';
    this.zeigen = true;
    w.szene.add(this.anzeige);
    this.material = new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.85, depthTest: false });
    this.materialAktiv = new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.95, depthTest: false });
    this.kopfGeo = new THREE.SphereGeometry(1, 10, 8);
    this.#baueAnzeige();
    // Klick in der Bühne (nur Gizmo-Modus, nicht beim Gizmo-Ziehen): Knochen vor Teilen wählen
    let start = null;
    w.buehne.addEventListener('pointerdown', (e) => {
      start = w.werkzeug === 'gizmo' && !w.gizmo.dragging && !w.gizmo.axis ? { x: e.clientX, y: e.clientY } : null;
    });
    w.buehne.addEventListener('pointerup', (e) => {
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5 || w.gizmo.dragging) return;
      start = null;
      const ziel = this.treffer(e.clientX, e.clientY);
      if (ziel) w.waehle(ziel);
    });
  }

  // ------------------------------------------------------------------ Abfragen
  istKnochen(o) {
    return !!o && (o.isBone || !!o.userData?.knochen || !!o.userData?.gelenk);
  }

  /** Alle (nicht gelöschten) Knochen/Gelenke im Modell */
  get alle() {
    const liste = [];
    this.w.modell.traverse((o) => {
      if (o !== this.w.modell && this.istKnochen(o) && o.visible) liste.push(o);
    });
    return liste;
  }

  /** Länge eines Knochens (Gelenke → kurzer Stummel, importierte Bones: Abstand zum ersten Kind-Knochen) */
  laenge(o) {
    if (o.userData?.knochen) return Math.max(KNOCHEN_MIN, Number(o.userData.knochen.laenge) || 0.3);
    const kind = o.children.find((c) => this.istKnochen(c));
    if (kind) return Math.max(KNOCHEN_MIN, kind.position.length());
    if (this.#stummel === null) {
      const box = this.w.huelle();
      this.#stummel = Math.max(0.05, box.isEmpty() ? 0.2 : box.getSize(new THREE.Vector3()).length() * 0.06);
    }
    return this.#stummel;
  }

  #stummel = null;

  /** Objekt unter dem Bildpunkt: Knochen-Overlay zuerst, dann sichtbare Teile */
  treffer(clientX, clientY) {
    const r = this.w.leinwand.getBoundingClientRect();
    const maus = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const strahl = new THREE.Raycaster();
    strahl.setFromCamera(maus, this.w.kamera);
    if (this.zeigen) {
      const k = strahl.intersectObjects(this.anzeige.children, false)[0];
      if (k?.object.userData.knoten) return k.object.userData.knoten;
    }
    const t = strahl.intersectObjects(this.w.teile.filter((x) => x.visible), false)[0];
    return t?.object ?? null;
  }

  // ------------------------------------------------------------------ Anzeige
  #baueAnzeige() {
    for (const k of [...this.anzeige.children]) {
      this.anzeige.remove(k);
      if (k.geometry !== this.kopfGeo) k.geometry?.dispose();
    }
    if (!this.zeigen) return;
    for (const o of this.alle) {
      const { punkte, dreiecke } = knochenForm(1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(punkte, 3));
      geo.setIndex(dreiecke);
      const m = new THREE.Mesh(geo, this.material);
      m.renderOrder = 10;
      m.userData.knoten = o;
      const kopf = new THREE.Mesh(this.kopfGeo, this.material);
      kopf.renderOrder = 10;
      kopf.userData.knoten = o;
      this.anzeige.add(m, kopf);
    }
    this.vorZeichnen();
  }

  /** vor jedem Bild: Overlay an die Welt-Lage der Knochen (auch während der Animations-Vorschau) */
  vorZeichnen() {
    if (!this.zeigen) return;
    this.#stummel = null;
    const kinder = this.anzeige.children;
    if (kinder.length !== this.alle.length * 2) return this.#baueAnzeige();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < kinder.length; i += 2) {
      const o = kinder[i].userData.knoten;
      o.updateWorldMatrix(true, false);
      o.matrixWorld.decompose(p, q, s);
      const L = this.laenge(o) * Math.abs(s.y || 1);
      const mat = o === this.w.gewaehlt ? this.materialAktiv : this.material;
      kinder[i].position.copy(p);
      kinder[i].quaternion.copy(q);
      kinder[i].scale.setScalar(L);
      kinder[i].material = mat;
      kinder[i + 1].position.copy(p);
      kinder[i + 1].scale.setScalar(Math.max(0.008, L * 0.07));
      kinder[i + 1].material = mat;
    }
  }

  /** nach Änderungen an der Hierarchie (neue/gelöschte Knochen, Undo) */
  aktualisiere() {
    this.#baueAnzeige();
  }

  // ------------------------------------------------------------------ Baumliste
  /** HTML der Hierarchie (ersetzt die alte Teile-Liste): Teile behalten data-teil (Index in w.teile), sonst data-knoten */
  baum() {
    const w = this.w;
    const zeilen = [];
    const zeile = (o, tiefe) => {
      if (o !== w.modell && this.istKnochen(o) && !o.visible) return; // gelöscht
      const teilNr = w.teile.indexOf(o);
      const knotenNr = w.objekte.indexOf(o);
      const art = o === w.modell ? '🧊' : this.istKnochen(o) ? (o.userData?.gelenk ? '⊕' : '🦴') : o.isMesh ? '▲' : '▢';
      const name = o === w.modell ? 'Ganzes Modell' : o.name || (o.isMesh ? `Teil ${teilNr + 1}` : 'Knoten');
      const daten = o === w.modell ? 'data-teil="-1"' : teilNr >= 0 ? `data-teil="${teilNr}"` : `data-knoten="${knotenNr}"`;
      const dreiecke = o.isMesh ? `<span class="leise klein">${Math.round((o.geometry?.index?.count ?? o.geometry?.attributes.position?.count ?? 0) / 3)} ▲</span>` : '';
      const auge = teilNr >= 0 ? `<button type="button" data-auge title="ein-/ausblenden">${o.visible ? '👁' : '🚫'}</button>` : '';
      zeilen.push(`<div class="werkstatt-zeile${w.gewaehlt === o ? ' aktiv' : ''}" ${daten} style="padding-left:${Math.min(8, tiefe) * 12}px"><button type="button" class="name" title="${esc(name)}">${art} ${esc(name)}</button>${dreiecke}${auge}</div>`);
      for (const kind of o.children) if (kind.isObject3D && kind.name !== '__knochenAnzeige') zeile(kind, tiefe + 1);
    };
    zeile(w.modell, 0);
    return zeilen.join('');
  }

  // ------------------------------------------------------------------ Bedienfeld
  /** Knöpfe/Felder für Knochen (unter „Animation & Gelenke“) */
  feld() {
    const w = this.w;
    const sel = w.gewaehlt;
    const knochen = this.istKnochen(sel) && sel !== w.modell;
    const teil = sel?.isMesh;
    const neuText = knochen ? '⤴ Knochen anhängen (Extrude)' : teil ? `🦴 Knochen für „${esc(sel.name)}“` : '🦴 Wurzel-Knochen';
    const neuTitel = knochen ? 'Kind-Knochen am Ende des gewählten Knochens (Kette, wie Blender E)' : teil ? 'Knochen unten mittig am Teil, das Teil hängt danach daran' : 'Knochen am Modell-Fuß (Wurzel einer Kette)';
    return `<div class="werkstatt-knochen">
      <div class="knopfreihe"><button type="button" data-k="neu" title="${esc(neuTitel)}">${neuText}</button>${knochen ? '<button type="button" data-k="binden" title="Teile starr an diesen Knochen hängen">🔗 Teile binden…</button>' : ''}${sel !== w.modell ? '<button type="button" data-k="umbenennen" title="Name des gewählten Knotens (Animationen ziehen mit)">✎ Umbenennen</button>' : ''}${knochen ? '<button type="button" data-k="loeschen" class="gefahr" title="Kinder hängen danach am Eltern-Knoten">🗑 Knochen</button>' : ''}</div>
      ${knochen && sel.userData?.knochen ? `<label class="klein">Länge (m) <input type="number" data-k="laenge" min="${KNOCHEN_MIN}" step="0.05" value="${Math.round(this.laenge(sel) * 1000) / 1000}" style="width:80px"></label>` : ''}
      <label class="klein"><input type="checkbox" data-k="zeigen"${this.zeigen ? ' checked' : ''}> 🦴 Knochen zeigen (${this.alle.length})</label>
      ${knochen ? '<p class="leise klein">Gizmo: ⟳ Drehen (E) dreht den Knochen mit allem, was daran hängt · ✥ Schieben (W) versetzt ihn.</p>' : ''}
    </div>`;
  }

  async klick(b) {
    const a = b.dataset.k;
    if (a === 'neu') return this.neu();
    if (a === 'binden') return this.binden();
    if (a === 'umbenennen') return this.umbenennen();
    if (a === 'loeschen') return this.loesche();
  }

  aenderung(el) {
    const w = this.w;
    if (el.dataset.k === 'zeigen') {
      this.zeigen = el.checked;
      this.#baueAnzeige();
      return w.anfordern();
    }
    if (el.dataset.k === 'laenge') {
      const v = Number(el.value);
      if (!(v >= KNOCHEN_MIN) || !w.gewaehlt?.userData?.knochen) return;
      w.merke();
      w.gewaehlt.userData.knochen = { ...w.gewaehlt.userData.knochen, laenge: Math.round(v * 1000) / 1000 };
      this.vorZeichnen();
      w.anfordern();
    }
  }

  // ------------------------------------------------------------------ Aktionen (je 1 Undo-Schritt)
  #namen() {
    const n = [];
    this.w.modell.traverse((o) => n.push(o.name));
    return n;
  }

  /** neuen Knochen anlegen: Extrude am gewählten Knochen, am gewählten Teil (Teil hängt dann daran) oder Wurzel am Modell */
  neu() {
    const w = this.w;
    w.animwerk.stoppe();
    const sel = w.gewaehlt;
    w.modell.updateMatrixWorld(true);
    const g = new THREE.Object3D();
    let eltern = w.modell;
    let laenge;
    let teil = null;
    if (this.istKnochen(sel) && sel !== w.modell) {
      // Extrude: Kind am Ende, gleiche Richtung und Länge
      eltern = sel;
      laenge = this.laenge(sel);
      g.position.set(...knochenEnde([0, 0, 0], [0, 0, 0, 1], laenge));
    } else {
      const box = sel !== w.modell && sel?.isMesh ? new THREE.Box3().setFromObject(sel) : w.huelle();
      const groesse = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
      const kopf = box.isEmpty() ? new THREE.Vector3() : new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
      laenge = standardLaenge(sel !== w.modell && sel?.isMesh ? groesse.y : groesse.y / 2);
      if (sel !== w.modell && sel?.isMesh) teil = sel;
      g.position.copy(w.modell.worldToLocal(kopf.clone()));
    }
    w.merke(); // vorher: älterer Stand kennt den Knochen nicht → Undo blendet ihn aus, hängt Teile zurück
    g.name = knotenName(eltern === w.modell ? (teil ? `Knochen_${teil.name}` : 'Wurzel') : `${eltern.name}_Kind`, this.#namen());
    g.userData.knochen = { laenge };
    eltern.add(g);
    if (teil) g.attach(teil); // Teil hängt starr am Knochen, Lage bleibt
    w.objekte.push(g);
    this.#baueAnzeige();
    w.waehle(g);
    w.setzeModus('rotate');
    w.zustand.meldung(`🦴 ${g.name} – ⟳ Gizmo dreht ihn${teil ? ` (mit „${teil.name}“)` : ''} · ⤴ hängt den nächsten an · ➕ Animation bewegt ihn`, 'ok');
  }

  async binden() {
    const w = this.w;
    const k = w.gewaehlt;
    if (!this.istKnochen(k)) return;
    const frei = w.teile.filter((t) => t.visible && !istUnter(k, t) && t.parent !== k);
    if (!frei.length) return w.zustand.meldung('Keine weiteren sichtbaren Teile zum Binden', 'fehler');
    const html = `<p class="leise">Gewählte Teile hängen danach starr an „${esc(k.name)}“ (Lage bleibt). Drehen/Animieren des Knochens bewegt sie mit.</p>${frei.map((t, i) => feldHtml({ name: `t${i}`, label: t.name, typ: 'haken', wert: false })).join('')}`;
    const wahl = await dialog({ titel: `🔗 An „${k.name}“ binden`, html, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Binden', art: 'akzent', wert: (b) => frei.filter((_, i) => b.querySelector(`[name=t${i}]`)?.checked) }] });
    if (!wahl?.length) return;
    w.animwerk.stoppe();
    w.merke();
    for (const t of wahl) k.attach(t);
    w.aktualisiere();
    w.zeigeListen();
    w.zustand.meldung(`🔗 ${wahl.length} Teil(e) an ${k.name}`, 'ok');
  }

  async umbenennen() {
    const w = this.w;
    const o = w.gewaehlt;
    if (!o || o === w.modell) return;
    const roh = await dialog({ titel: '✎ Umbenennen', html: feldHtml({ name: 'name', label: 'Name', typ: 'text', wert: o.name, hilfe: 'Animationen finden Knoten über den Namen – Spuren werden mit umbenannt' }), knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'OK', art: 'akzent', wert: (b) => b.querySelector('[name=name]').value }] });
    if (roh === null || roh === undefined) return;
    const alt = o.name;
    const neu = knotenName(roh, this.#namen().filter((n) => n !== alt));
    if (neu === alt) return;
    w.animwerk.stoppe();
    w.merke();
    o.name = neu;
    w.animwerk.benenneSpurenUm(alt, neu);
    w.zeigeListen();
    w.aktualisiere();
    w.zustand.meldung(`✎ „${alt}“ heißt jetzt „${neu}“`, 'ok');
  }

  loesche() {
    const w = this.w;
    const k = w.gewaehlt;
    if (!this.istKnochen(k) || k === w.modell) return;
    w.animwerk.stoppe();
    w.merke();
    const eltern = k.parent ?? w.modell;
    for (const kind of [...k.children]) eltern.attach(kind); // Kinder (Teile, Knochen) behalten ihre Lage
    k.visible = false; // gelöscht = unsichtbar (nicht exportiert, Undo holt ihn zurück)
    this.#baueAnzeige();
    w.waehle(eltern === w.modell || !eltern.visible ? w.modell : eltern);
    w.zustand.meldung(`🗑 Knochen „${k.name}“ entfernt – Strg+Z holt ihn zurück`, 'ok');
  }

  ende() {
    for (const k of [...this.anzeige.children]) k.geometry !== this.kopfGeo && k.geometry?.dispose();
    this.kopfGeo.dispose();
    this.material.dispose();
    this.materialAktiv.dispose();
    this.w.szene.remove(this.anzeige);
  }
}

/** Ist a ein Nachfahre von b? */
function istUnter(a, b) {
  for (let x = a.parent; x; x = x.parent) if (x === b) return true;
  return false;
}

export { spurNachUmbenennen };
