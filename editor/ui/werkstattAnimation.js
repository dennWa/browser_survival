import * as THREE from 'three';
import { GLTFLoader } from '../../client/vendor/three/addons.js';
import { dataUrlZuBytes } from '../kern/bibliothek.js';
import { baueAnimation, ANIMATIONS_ARTEN, ACHSEN } from '../kern/animation.js';
import { dialog, esc, feldHtml, liesFelder } from './dialoge.js';

/**
 * Animationswerk der Modell-Werkstatt (Editor 2.0, Schritt 5.3) – hängt an einer Werkstatt (ui/werkstatt.js, `w`).
 *   • Clips (`w.clips`): ▶ Vorschau als Schleife (■ stoppt und stellt die Pose wieder her), ✎ umbenennen, 🗑 löschen,
 *     ⭐ Leerlauf = läuft im Spiel als Schleife (Meta `leerlauf` → Typ `animation`, client/darstellung/eigeneModelle.js).
 *   • ➕ Animation: Drehen/Wippen/Pendeln/Pulsieren/Flackern für das Modell, ein Teil oder ein Gelenk (kern/animation.js);
 *     als neuer Clip oder in einen vorhandenen Clip gemischt (z. B. Tür pendelt + Lampe flackert).
 *   • ⊕ Gelenk: leerer Knoten als Drehpunkt (Mitte oder Kante des gewählten Teils), das Teil hängt daran → Tür/Klappe/Fahne
 *     pendelt um die Kante. „Hängt an“: gewähltes Teil an Modell, Gelenk, Knochen oder anderes Teil hängen (Lage bleibt).
 *   • 🦴 Skelett anzeigen (SkeletonHelper), ⇄ Clips von einem anderen Bibliotheks-Modell übernehmen, wenn die Knochen-/Teilnamen
 *     passen (gleiches Skelett, z. B. gleiche Figur-Familie) – Spuren ohne passenden Knoten fallen weg.
 * Undo: Stand { clips: [[uuid, name]], leerlauf } – Clip-Objekte liegen in this.alle (uuid → Clip).
 * Nicht drin (Browser-Umfang, siehe ROADMAP 5.3): automatisches Rigging/Gewichte malen, Knochenketten, die ein Netz biegen.
 */
export class Animationswerk {
  constructor(w) {
    this.w = w;
    this.alle = new Map(w.clips.map((c) => [c.uuid, c]));
    this.leerlauf = w.alt.leerlauf ?? '';
    this.vorschau = null;
    this.skelett = null;
    // Knoten ohne Namen bekommen einen (Spuren adressieren Knoten über den Namen)
    let n = 0;
    if (!w.modell.name) w.modell.name = 'Modell';
    w.modell.traverse((o) => {
      if (!o.name && o !== w.modell) o.name = `${o.isMesh ? 'Teil' : 'Knoten'}_${++n}`;
    });
    this.box = w.el.querySelector('.werkstatt-animation');
    this.box.addEventListener('click', (e) => this.#klick(e));
    this.box.addEventListener('change', (e) => this.#aenderung(e));
  }

  // ------------------------------------------------------------------ Undo-Stand
  stand() {
    return { clips: this.w.clips.map((c) => [c.uuid, c.name]), leerlauf: this.leerlauf };
  }

  setzeStand(s) {
    if (!s) return; // Vorschau ist hier schon aus (Werkstatt stoppt vor Undo/Redo)
    this.w.clips = s.clips.map(([uuid, name]) => Object.assign(this.alle.get(uuid), { name }));
    this.leerlauf = s.leerlauf;
  }

  #neuerClip(clip) {
    this.alle.set(clip.uuid, clip);
    return clip;
  }

  // ------------------------------------------------------------------ Anzeige
  get #gelenke() {
    return this.w.objekte.filter((o) => o.userData.gelenk && o.visible);
  }

  #knochen() {
    const k = [];
    this.w.modell.traverse((o) => o.isBone && k.push(o));
    return k;
  }

  zeichne() {
    const w = this.w;
    const sel = w.gewaehlt;
    const spielt = this.vorschau?.clip;
    const ziele = sel === w.modell ? [] : [w.modell, ...this.#gelenke, ...this.#knochen(), ...w.teile.filter((t) => t.visible)].filter((z) => z !== sel && !istUnter(z, sel));
    const knochenZahl = this.#knochen().length;
    this.box.innerHTML = `${
      w.clips.length
        ? w.clips
            .map(
              (c, i) => `<div class="werkstatt-zeile${spielt === c ? ' aktiv' : ''}" data-clip="${i}">
          <button type="button" data-c="spielen" title="${spielt === c ? 'Stopp' : 'Vorschau (Schleife)'}">${spielt === c ? '■' : '▶'}</button>
          <span class="name" title="${esc(c.name)}">${esc(c.name)}</span><span class="leise klein">${c.duration.toFixed(1)} s</span>
          <button type="button" data-c="leerlauf" title="Leerlauf im Spiel (läuft als Schleife)">${this.leerlauf === c.name ? '⭐' : '☆'}</button>
          <button type="button" data-c="umbenennen" title="Umbenennen">✎</button><button type="button" data-c="loeschen" title="Löschen">🗑</button></div>`,
            )
            .join('')
        : '<p class="leise klein">Keine Animationen. ➕ erzeugt einfache Bewegungen (Mühle dreht, Lampe flackert, Tür pendelt).</p>'
    }
      <div class="knopfreihe"><button type="button" data-c="neu">➕ Animation…</button><button type="button" data-c="gelenk" title="Drehpunkt für das gewählte Teil (Tür, Klappe)">⊕ Gelenk…</button><button type="button" data-c="uebernehmen" title="Clips eines anderen Modells mit gleichen Knochen-/Teilnamen">⇄ Übernehmen…</button></div>
      ${this.#gelenke.length ? `<div class="werkstatt-gelenke">${this.#gelenke.map((g) => `<button type="button" class="klang-eintrag${sel === g ? ' aktiv' : ''}" data-gelenk="${w.objekte.indexOf(g)}">⊕ ${esc(g.name)}</button>`).join('')}</div>` : ''}
      ${sel !== w.modell ? `<label class="werkstatt-haengt">Hängt an <select data-c="eltern">${ziele.map((z) => `<option value="${w.objekte.indexOf(z)}"${sel.parent === z ? ' selected' : ''}>${z === w.modell ? '🧊 Modell' : z.isBone ? `🦴 ${esc(z.name)}` : z.userData.gelenk ? `⊕ ${esc(z.name)}` : esc(z.name)}</option>`).join('')}${ziele.includes(sel.parent) ? '' : `<option selected disabled>${esc(sel.parent?.name ?? '–')}</option>`}</select></label>` : ''}
      ${knochenZahl ? `<label><input type="checkbox" data-c="skelett"${this.skelett?.visible ? ' checked' : ''}> 🦴 Skelett zeigen (${knochenZahl} Knochen)</label>` : ''}`;
  }

  #klick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const w = this.w;
    if (b.dataset.gelenk) return w.waehle(w.objekte[Number(b.dataset.gelenk)]);
    const c = b.dataset.c;
    const clip = w.clips[Number(b.closest('[data-clip]')?.dataset.clip)];
    if (c === 'spielen') return this.vorschau?.clip === clip ? this.stoppe() : this.spiele(clip);
    if (c === 'leerlauf') {
      w.merke();
      this.leerlauf = this.leerlauf === clip.name ? '' : clip.name;
      return w.zeigeListen();
    }
    if (c === 'umbenennen') return this.#umbenennen(clip);
    if (c === 'loeschen') {
      w.merke();
      w.clips = w.clips.filter((x) => x !== clip);
      if (this.leerlauf === clip.name) this.leerlauf = '';
      w.aktualisiere();
      return w.zeigeListen();
    }
    if (c === 'neu') return this.#neueAnimation();
    if (c === 'gelenk') return this.#gelenk();
    if (c === 'uebernehmen') return this.#uebernehmen();
  }

  #aenderung(e) {
    const w = this.w;
    if (e.target.dataset.c === 'eltern') {
      const ziel = w.objekte[Number(e.target.value)];
      if (!ziel) return;
      w.merke();
      ziel.attach(w.gewaehlt); // Lage in der Welt bleibt
      w.aktualisiere();
      w.zeigeListen();
    } else if (e.target.dataset.c === 'skelett') {
      if (!this.skelett) {
        this.skelett = new THREE.SkeletonHelper(w.modell);
        w.szene.add(this.skelett);
      }
      this.skelett.visible = e.target.checked;
      w.anfordern();
    }
  }

  // ------------------------------------------------------------------ Vorschau
  spiele(clip) {
    this.stoppe();
    const w = this.w;
    const vorher = w.knotenStand();
    const mischer = new THREE.AnimationMixer(w.modell);
    mischer.clipAction(clip).play();
    w.gizmo.detach();
    let zuletzt = performance.now();
    const bild = (jetzt) => {
      if (this.vorschau?.bild !== nr) return;
      mischer.update(Math.min(0.1, (jetzt - zuletzt) / 1000));
      zuletzt = jetzt;
      w.anfordern();
      nr = requestAnimationFrame(bild);
      this.vorschau.bild = nr;
    };
    let nr = requestAnimationFrame(bild);
    this.vorschau = { clip, mischer, vorher, bild: nr };
    w.zeigeListen();
  }

  /** Vorschau beenden: Pose von vorher (die Animation ändert sonst die Lage der Knoten) */
  stoppe() {
    const v = this.vorschau;
    if (!v) return;
    this.vorschau = null;
    cancelAnimationFrame(v.bild);
    v.mischer.stopAllAction();
    v.mischer.uncacheRoot(this.w.modell);
    this.w.setzeKnoten(v.vorher);
    if (this.w.werkzeug === 'gizmo') this.w.gizmo.attach(this.w.gewaehlt);
    this.w.aktualisiere();
    this.w.zeigeListen();
  }

  // ------------------------------------------------------------------ Dialoge
  #eindeutig(name) {
    const namen = new Set(this.w.clips.map((c) => c.name));
    if (!namen.has(name)) return name;
    let i = 2;
    while (namen.has(`${name} ${i}`)) i++;
    return `${name} ${i}`;
  }

  async #umbenennen(clip) {
    const w = await dialog({ titel: '✎ Animation umbenennen', html: feldHtml({ name: 'name', label: 'Name', typ: 'text', wert: clip.name }), knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'OK', art: 'akzent', wert: (b) => b.querySelector('[name=name]').value.trim() }] });
    if (!w || w === clip.name) return;
    const name = this.#eindeutig(w.slice(0, 60).replace(/[<>"\\]/g, ''));
    this.w.merke();
    if (this.leerlauf === clip.name) this.leerlauf = name;
    clip.name = name;
    this.w.zeigeListen();
  }

  async #neueAnimation() {
    const w = this.w;
    const knoten = [w.modell, ...this.#gelenke, ...w.teile.filter((t) => t.visible), ...this.#knochen()];
    const felder = [
      { name: 'art', label: 'Bewegung', typ: 'auswahl', wert: 'drehen', optionen: Object.entries(ANIMATIONS_ARTEN).map(([k, a]) => [k, a.name]) },
      { name: 'ziel', label: 'Was bewegt sich', typ: 'auswahl', wert: String(w.objekte.indexOf(w.gewaehlt)), optionen: knoten.map((k) => [String(w.objekte.indexOf(k)), k === w.modell ? '🧊 ganzes Modell' : k.userData.gelenk ? `⊕ ${k.name}` : k.isBone ? `🦴 ${k.name}` : k.name]) },
      { name: 'achse', label: 'Achse', typ: 'auswahl', wert: 'y', optionen: ACHSEN.map((a) => [a, { x: 'x (links/rechts)', y: 'y (hoch)', z: 'z (vor/zurück)' }[a]]) },
      { name: 'dauer', label: 'Dauer einer Runde (s)', typ: 'zahl', wert: 2, min: 0.1, schritt: 0.1 },
      { name: 'staerke', label: 'Stärke', typ: 'zahl', wert: '', schritt: 0.05, hilfe: 'leer = Standard (Drehen 360°, Wippen 0,1 m, Pendeln 20°, Pulsieren/Flackern 0,1–0,15×)' },
      { name: 'clip', label: 'In Clip', typ: 'auswahl', wert: '', optionen: [['', '➕ neuer Clip'], ...w.clips.map((c, i) => [String(i), `mischen in „${c.name}“`])] },
    ];
    const e = await dialog({ titel: '➕ Animation erzeugen', html: `<p class="leise">Geht vom aktuellen Stand aus und läuft als Schleife. Drehpunkt = Ursprung des Teils – für Türen erst ⊕ Gelenk an die Kante setzen.</p>${felder.map(feldHtml).join('')}`, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Erzeugen', art: 'akzent', wert: (b) => liesFelder(b, felder) }] });
    if (!e) return;
    const ziel = w.objekte[Number(e.ziel)];
    if (!ziel) return;
    // Spuren finden Knoten über den Namen → eindeutig machen, falls ein anderer Knoten vorher so heißt
    if (w.modell.getObjectByName(ziel.name) !== ziel) ziel.name = THREE.PropertyBinding.sanitizeNodeName(`${ziel.name}_${w.objekte.indexOf(ziel)}`);
    this.stoppe();
    const b = baueAnimation(e.art, { knoten: ziel.name, dauer: e.dauer, staerke: e.staerke === null || e.staerke === '' ? undefined : e.staerke, achse: e.achse, basis: { position: ziel.position.toArray(), quaternion: ziel.quaternion.toArray(), scale: ziel.scale.toArray() } });
    const spuren = b.spuren.map((s) => (s.name.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(s.name, s.zeiten, s.werte) : new THREE.VectorKeyframeTrack(s.name, s.zeiten, s.werte)));
    w.merke();
    let clip;
    const alt = e.clip !== '' && e.clip !== null ? w.clips[Number(e.clip)] : null;
    if (alt) {
      // gemischt: neuer Clip (alte Spuren desselben Ziels/Merkmals ersetzt) – das alte Objekt bleibt fürs Undo
      const namen = new Set(spuren.map((s) => s.name));
      clip = this.#neuerClip(new THREE.AnimationClip(alt.name, Math.max(alt.duration, b.dauer), [...alt.tracks.filter((t) => !namen.has(t.name)), ...spuren]));
      w.clips = w.clips.map((c) => (c === alt ? clip : c));
    } else {
      clip = this.#neuerClip(new THREE.AnimationClip(this.#eindeutig(b.name), b.dauer, spuren));
      w.clips = [...w.clips, clip];
      if (!this.leerlauf) this.leerlauf = clip.name; // erste eigene Animation läuft im Spiel
    }
    w.aktualisiere();
    this.spiele(clip);
    w.zustand.meldung(`➕ „${clip.name}“ – ⭐ = läuft im Spiel`, 'ok');
  }

  async #gelenk() {
    const w = this.w;
    const teil = w.gewaehlt;
    if (teil === w.modell) return w.zustand.meldung('Erst ein Teil wählen (Teile-Liste), das sich um das Gelenk bewegen soll', 'fehler');
    const ort = await dialog({
      titel: '⊕ Gelenk (Drehpunkt)',
      html: `<p class="leise">„${esc(teil.name)}“ hängt danach am Gelenk. Drehen/Pendeln des Gelenks bewegt das Teil um diesen Punkt.</p>${feldHtml({ name: 'ort', label: 'Drehpunkt', typ: 'auswahl', wert: 'links', optionen: [['mitte', 'Mitte'], ['links', 'linke Kante (x min) – Tür'], ['rechts', 'rechte Kante (x max)'], ['unten', 'unten (y min) – Fahne, Pflanze'], ['oben', 'oben (y max) – Schild, Lampe'], ['hinten', 'hintere Kante (z min) – Klappe'], ['vorne', 'vordere Kante (z max)']] })}`,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Einfügen', art: 'akzent', wert: (b) => b.querySelector('[name=ort]').value }],
    });
    if (!ort) return;
    this.stoppe();
    w.modell.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(teil);
    const p = box.getCenter(new THREE.Vector3());
    if (ort === 'links') p.x = box.min.x;
    else if (ort === 'rechts') p.x = box.max.x;
    else if (ort === 'unten') p.y = box.min.y;
    else if (ort === 'oben') p.y = box.max.y;
    else if (ort === 'hinten') p.z = box.min.z;
    else if (ort === 'vorne') p.z = box.max.z;
    w.merke(); // vor dem Einbauen: älterer Stand kennt das Gelenk nicht → Undo blendet es aus und hängt das Teil zurück
    const g = new THREE.Object3D();
    g.name = THREE.PropertyBinding.sanitizeNodeName(`Gelenk_${this.#gelenke.length + 1}_${teil.name}`).slice(0, 60);
    g.userData.gelenk = true;
    const eltern = teil.parent ?? w.modell;
    eltern.add(g);
    g.position.copy(eltern.worldToLocal(p));
    g.attach(teil);
    w.objekte.push(g);
    w.waehle(g);
    w.zustand.meldung(`⊕ ${g.name} – jetzt ➕ Animation „Pendeln“ oder „Drehen“ fürs Gelenk`, 'ok');
  }

  async #uebernehmen() {
    const w = this.w;
    const andere = w.bibliothek.liste.filter((m) => m.id !== w.alt.id && m.animationen.length);
    if (!andere.length) return w.zustand.meldung('Kein anderes Modell mit Animationen in der Bibliothek', 'fehler');
    const id = await dialog({ titel: '⇄ Animationen übernehmen', html: `<p class="leise">Übernimmt Clips, deren Knochen-/Teilnamen es in diesem Modell auch gibt (gleiches Skelett).</p>${feldHtml({ name: 'quelle', label: 'Von Modell', typ: 'auswahl', wert: andere[0].id, optionen: andere.map((m) => [m.id, `${m.name} (${m.animationen.length})`]) })}`, knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Übernehmen', art: 'akzent', wert: (b) => b.querySelector('[name=quelle]').value }] });
    if (!id) return;
    let gltf;
    try {
      const bytes = dataUrlZuBytes(w.bibliothek.url(id));
      gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    } catch (f) {
      return w.zustand.meldung(`Modell lässt sich nicht laden: ${f.message ?? f}`, 'fehler');
    }
    const neu = [];
    let verworfen = 0;
    for (const c of gltf.animations ?? []) {
      const passend = c.tracks.filter((t) => w.modell.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
      if (!passend.length || passend.length < c.tracks.length / 2) {
        verworfen++;
        continue;
      }
      neu.push(this.#neuerClip(new THREE.AnimationClip(this.#eindeutig(c.name), c.duration, passend.map((t) => t.clone()))));
    }
    if (!neu.length) return w.zustand.meldung(`Keine passenden Clips (${verworfen} verworfen – andere Knochennamen)`, 'fehler');
    this.stoppe();
    w.merke();
    w.clips = [...w.clips, ...neu];
    w.aktualisiere();
    w.zeigeListen();
    w.zustand.meldung(`⇄ ${neu.length} Clip(s) übernommen${verworfen ? `, ${verworfen} passten nicht` : ''}`, 'ok');
  }

  ende() {
    this.stoppe();
    this.skelett?.dispose?.();
  }
}

/** Ist a ein Nachfahre von b? (Kreise beim Umhängen vermeiden) */
function istUnter(a, b) {
  for (let x = a.parent; x; x = x.parent) if (x === b) return true;
  return false;
}
