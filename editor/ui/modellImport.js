import * as THREE from 'three';
import { GLTFLoader, OBJLoader, FBXLoader, GLTFExporter, SkeletonUtils } from '../../client/vendor/three/addons.js';
import { istGlb, glbInfo, gltfZuGlb, modellFormat, masseAusGroesse, MODELL_MAX_MB } from '../kern/bibliothek.js';

/**
 * 3D-Datei → geprüfte .glb + Kennzahlen + Vorschaubild (Editor 2.0, Schritt 3.2/3.4; Browser, Three.js).
 *   .glb  → unverändert (Signatur + Probe-Laden)
 *   .gltf → nur eingebettet (Puffer/Texturen als data:-URI) → kern/bibliothek.gltfZuGlb (verlustfrei)
 *   .obj / .fbx → laden (OBJLoader/FBXLoader) → GLTFExporter (binär, mit Animationen) – externe Texturen fehlen dann
 * Ergebnis: { bytes, info { dreiecke, animationen, … }, masse { b, h, hoehe }, vorschau (PNG-Data-URL | null), warnungen[] }
 * Fehler → Exception mit deutschem Text.
 */
export const DATEI_ANNAHME = '.glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json';
const VORSCHAU_PX = 96;

/** Größe eines geladenen Modells (Ruhepose). Skelett-Modelle: Knochen-Matrizen erst berechnen, sonst falsche (100× kleine) Maße. */
export function messeModell(szene) {
  szene.updateMatrixWorld(true);
  let skelett = false;
  szene.traverse((t) => {
    if (!t.isSkinnedMesh) return;
    skelett = true;
    t.boundingBox = null;
    t.skeleton.update();
  });
  return new THREE.Box3().setFromObject(szene, skelett).getSize(new THREE.Vector3());
}

export async function leseModellDatei(datei) {
  const format = modellFormat(datei.name);
  if (!format) throw new Error('Nur 3D-Dateien: .glb, .gltf (eingebettet), .obj oder .fbx');
  if (datei.size > MODELL_MAX_MB * 1024 * 1024 * (format === 'gltf' ? 1.4 : 1)) throw new Error(`Datei zu groß (max. ${MODELL_MAX_MB} MB)`);
  const roh = new Uint8Array(await datei.arrayBuffer());
  const warnungen = [];
  let bytes;
  if (format === 'glb') {
    if (!istGlb(roh)) throw new Error('Datei-Signatur passt nicht – keine echte .glb (glTF 2.0 binär)');
    bytes = roh;
  } else if (format === 'gltf') {
    let json;
    try {
      json = JSON.parse(new TextDecoder().decode(roh));
    } catch {
      throw new Error('.gltf ist kein gültiges JSON');
    }
    bytes = gltfZuGlb(json);
  } else {
    const gruppe = format === 'obj' ? new OBJLoader().parse(new TextDecoder().decode(roh)) : new FBXLoader().parse(roh.buffer, '');
    bytes = new Uint8Array(await new GLTFExporter().parseAsync(gruppe, { binary: true, animations: gruppe.animations ?? [] }));
    warnungen.push(`${format.toUpperCase()} wurde in .glb umgewandelt – externe Texturen fehlen, Farben ggf. im Inspektor setzen`);
  }
  if (bytes.length > MODELL_MAX_MB * 1024 * 1024) throw new Error(`Modell zu groß (max. ${MODELL_MAX_MB} MB)`);
  const info = glbInfo(bytes);
  if (info.fehler.length) throw new Error(info.fehler.join('; '));
  warnungen.push(...info.warnungen);
  // Probe-Laden: was der GLTFLoader nicht liest, kann auch das Spiel nicht zeigen
  let szene;
  try {
    szene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  } catch (e) {
    throw new Error(`Modell lässt sich nicht laden: ${e.message ?? e}`);
  }
  const groesse = messeModell(szene);
  if (!(groesse.x > 0 || groesse.y > 0 || groesse.z > 0)) throw new Error('Modell hat keine sichtbare Größe');
  const masse = masseAusGroesse(groesse);
  if (Math.max(groesse.x, groesse.y, groesse.z) > 60) warnungen.push(`Sehr groß (${groesse.x.toFixed(0)} × ${groesse.z.toFixed(0)} m) – vielleicht in cm exportiert? Maße im Dialog anpassen`);
  return { bytes, info, masse, vorschau: vorschauBild(szene), warnungen };
}

/** Alpha-Rand einer Leinwand abschneiden und den Inhalt quadratisch (6 % Rand) auf px × px zentrieren → PNG-Data-URL */
function zugeschnitten(quelle, px) {
  const n = quelle.width;
  const kopie = document.createElement('canvas');
  kopie.width = kopie.height = n;
  const k = kopie.getContext('2d', { willReadFrequently: true });
  k.drawImage(quelle, 0, 0);
  const daten = k.getImageData(0, 0, n, n).data;
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (daten[(y * n + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const ziel = document.createElement('canvas');
  ziel.width = ziel.height = px;
  const z = ziel.getContext('2d');
  z.imageSmoothingQuality = 'high';
  if (x1 < 0) z.drawImage(quelle, 0, 0, px, px);
  else {
    const seite = Math.max(x1 - x0 + 1, y1 - y0 + 1) * 1.12;
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    z.drawImage(quelle, cx - seite / 2, cy - seite / 2, seite, seite, 0, 0, px, px);
  }
  return ziel.toDataURL('image/png');
}

/**
 * Kleines Vorschaubild (Schrägansicht, transparent). Ohne WebGL → null.
 * Runde 19: doppelt groß rendern, leeren Rand abschneiden (Alpha) und das Modell mittig auf `px` einpassen – die
 * Hüllkugel-Kamera allein ließ schmale Modelle winzig und außermittig erscheinen.
 */
export function vorschauBild(szene, px = VORSCHAU_PX) {
  let renderer;
  try {
    const leinwand = document.createElement('canvas');
    const roh = px * 2;
    leinwand.width = leinwand.height = roh;
    renderer = new THREE.WebGLRenderer({ canvas: leinwand, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(roh, roh, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const welt = new THREE.Scene();
    welt.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
    const sonne = new THREE.DirectionalLight(0xffffff, 1.6);
    sonne.position.set(3, 5, 4);
    welt.add(sonne);
    let skelett = false;
    szene.traverse((t) => (skelett ||= !!t.isSkinnedMesh));
    const modell = skelett ? SkeletonUtils.clone(szene) : szene.clone(true);
    welt.add(modell);
    const groesse = messeModell(modell);
    const box = new THREE.Box3().setFromObject(modell, skelett);
    const mitte = box.getCenter(new THREE.Vector3());
    const radius = groesse.length() / 2 || 1;
    modell.traverse((t) => t.isSkinnedMesh && (t.frustumCulled = false));
    const kamera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
    const abstand = radius / Math.sin((35 / 2) * (Math.PI / 180)) * 1.05;
    kamera.position.copy(mitte).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(abstand));
    kamera.lookAt(mitte);
    renderer.render(welt, kamera);
    return zugeschnitten(leinwand, px);
  } catch {
    return null;
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss?.();
  }
}
