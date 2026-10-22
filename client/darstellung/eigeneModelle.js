import * as THREE from 'three';
import { GLTFLoader, SkeletonUtils } from '../vendor/three/addons.js';

/**
 * Eigene 3D-Modelle (.glb) aus dem Map-Editor. Ein Objekttyp hat entweder
 *   • `glb`       – eingebettet als Data-URL (Editor, Testlauf im Editor), oder
 *   • `glbDatei`  – Pfad unter client/ (z. B. assets/eigene/<karte>_<typ>.glb, angelegt von karte:editor).
 * Die Einpassung ist identisch für Editor und Spiel: Mitte auf den Fußabdruck, Unterkante auf den Boden,
 * Größe in den Kasten b × h × hoehe (Kacheln bzw. Einheiten × `einheit`).
 * Animationen (Map-Editor 5.3): die Clips hängen an `szene.animations` (Kopien behalten sie); `leerlaufMischer` spielt den
 * Leerlauf-Clip eines Typs (`typ.animation`) als Schleife. Modelle mit Skelett werden per SkeletonUtils.clone kopiert.
 * (Änderung durch die Editor-Linie mit Nutzer-Freigabe, vermerkt in KI_INDEX.md §10.)
 */
const lader = new GLTFLoader();
const cache = new Map(); // URL → Promise<Szene>; jede Ansicht klont daraus

/** URL des Modells eines Typs oder null (kein eigenes Modell). */
export function eigenesModellUrl(typ) {
  if (typ?.glb) return typ.glb;
  if (typ?.glbDatei) return new URL(`../${typ.glbDatei}`, import.meta.url).href;
  return null;
}

/** Lädt das Modell (einmal je URL). Liefert die Szene – vor Gebrauch mit `eigenesModellInhalt` klonen. */
export function ladeEigenesModell(url) {
  if (!cache.has(url)) {
    const versprechen = new Promise((ok, fehler) =>
      lader.load(
        url,
        (gltf) => {
          gltf.scene.animations = gltf.animations ?? [];
          ok(gltf.scene);
        },
        undefined,
        fehler,
      ),
    );
    // Fehlschlag nicht dauerhaft merken, sonst hilft ein erneuter Aufbau nicht
    versprechen.catch(() => cache.delete(url));
    cache.set(url, versprechen);
  }
  return cache.get(url);
}

/**
 * Kopie der Szene, eingepasst in den Kasten. Materialien je Kopie (Farbe ändern wirkt nur auf dieses Objekt).
 * @param {object} o { b, h, hoehe, einheit = 1, drehung?, farbe?, id? } – id setzt userData für die Auswahl im Editor
 */
export function eigenesModellInhalt(szene, { b, h, hoehe, einheit = 1, farbe = null, id = null }) {
  let skelett = false;
  szene.traverse((t) => (skelett ||= !!t.isSkinnedMesh));
  const modell = skelett ? SkeletonUtils.clone(szene) : szene.clone(true);
  modell.animations = szene.animations ?? [];
  modell.traverse((t) => {
    if (!t.isMesh) return;
    const kopie = (m) => {
      const c = m.clone();
      if (farbe && c.color) c.color.set(farbe);
      return c;
    };
    t.material = Array.isArray(t.material) ? t.material.map(kopie) : kopie(t.material);
    if (id !== null) t.userData = { s: 'objekte', k: id };
  });
  // Skelett-Modelle: erst alle Knochen-Matrizen berechnen und die (gecachte) Skinning-Box verwerfen, sonst wird in Ruhepose
  // mit veralteten Knochen gemessen (Modell erscheint 100× zu klein/unsichtbar). Skinning-Meshes nie wegschneiden (Box stimmt nicht).
  modell.updateMatrixWorld(true);
  modell.traverse((t) => {
    if (!t.isSkinnedMesh) return;
    t.boundingBox = null;
    t.boundingSphere = null;
    t.skeleton.update();
    t.frustumCulled = false;
  });
  const box = new THREE.Box3().setFromObject(modell, skelett);
  const groesse = box.getSize(new THREE.Vector3());
  const mitte = box.getCenter(new THREE.Vector3());
  const s = Math.min((b * 0.96 * einheit) / (groesse.x || 1), (h * 0.96 * einheit) / (groesse.z || 1), (hoehe * einheit) / (groesse.y || 1));
  modell.scale.setScalar(s);
  modell.position.set(-mitte.x * s, -box.min.y * s, -mitte.z * s);
  return modell;
}

/**
 * Leerlauf-Animation eines eingepassten Modells starten (Clip `name`, Schleife, zufälliger Startpunkt – nicht alle im Gleichtakt).
 * @returns THREE.AnimationMixer (jedes Bild `update(dt)`) oder null, wenn es den Clip nicht gibt
 */
export function leerlaufMischer(modell, name) {
  const clip = name && modell.animations?.find((c) => c.name === name);
  if (!clip) return null;
  const mischer = new THREE.AnimationMixer(modell);
  const aktion = mischer.clipAction(clip);
  aktion.play();
  mischer.setTime(Math.random() * clip.duration);
  return mischer;
}
