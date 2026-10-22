/**
 * Knochen in der Modell-Werkstatt (Feedback 6.7, „wie in Blender“) – umgebungsfreie Rechnungen, getestet in tests/knochen.test.js.
 * Ein Knochen ist ein leerer Knoten (Object3D) mit `userData.knochen = { laenge }`: Kopf = Ursprung des Knotens, Ende = Kopf +
 * (0, laenge, 0) in seinen eigenen Achsen (wie Blender: Knochen zeigen entlang ihrer y-Achse). Kinder (Teile oder weitere
 * Knochen) hängen starr daran (Eltern-Kind-Kette, „Extrude“ = Kind-Knochen am Ende). userData landet beim GLTFExporter in
 * `extras` und kommt beim Laden zurück → Knochen/Hierarchie/Namen überleben das Speichern; Animationen adressieren Knoten per Namen.
 *   knochenEnde(kopf, quat, laenge)   Ende in Eltern-Koordinaten (für Extrude, Anzeige)
 *   knotenName(wunsch, vorhandene)    gültiger, eindeutiger Knotenname (ohne . : / [ ] Leerzeichen – Spur-Namen-sicher)
 *   spurNachUmbenennen(spur, alt, neu)  'Alt.position' → 'Neu.position' (andere Spuren bleiben)
 *   knochenForm(laenge)               Oktaeder-Knochen (Blender-Look): { punkte: [x,y,z …], dreiecke: [i …] }
 *   standardLaenge(hoehe)             Länge eines neuen Knochens für ein Teil der Höhe h
 */
export const KNOCHEN_MIN = 0.02;

/** Vektor (0, laenge, 0) mit Quaternion [x, y, z, w] drehen und zum Kopf addieren → [x, y, z] */
export function knochenEnde(kopf, quat, laenge) {
  const [qx, qy, qz, qw] = quat;
  // v' = q · (0, L, 0) · q⁻¹ – ausgeschrieben für v = (0, L, 0)
  const x = 2 * (qx * qy - qw * qz) * laenge;
  const y = (1 - 2 * (qx * qx + qz * qz)) * laenge;
  const z = 2 * (qy * qz + qw * qx) * laenge;
  return [kopf[0] + x, kopf[1] + y, kopf[2] + z].map((v) => Math.round(v * 1e6) / 1e6);
}

/** Knotennamen säubern (wie THREE.PropertyBinding.sanitizeNodeName: Leerzeichen → _, ohne . : / [ ]) und eindeutig machen */
export function knotenName(wunsch, vorhandene = []) {
  const basis = String(wunsch ?? '').trim().replace(/\s+/g, '_').replace(/[\[\]\.:\/]/g, '').slice(0, 50) || 'Knochen';
  const belegt = new Set(vorhandene);
  if (!belegt.has(basis)) return basis;
  for (let i = 2; ; i++) if (!belegt.has(`${basis}_${i}`)) return `${basis}_${i}`;
}

/** Spur-Name nach dem Umbenennen eines Knotens */
export function spurNachUmbenennen(spur, alt, neu) {
  return spur.startsWith(`${alt}.`) ? `${neu}${spur.slice(alt.length)}` : spur;
}

/** Oktaeder-Knochen entlang +y: Kopf (0,0,0), Ring bei 15 % (Breite 10 %), Ende (0, L, 0) */
export function knochenForm(laenge) {
  const L = Math.max(KNOCHEN_MIN, laenge);
  const w = L * 0.1;
  const r = L * 0.15;
  const punkte = [0, 0, 0, w, r, 0, 0, r, w, -w, r, 0, 0, r, -w, 0, L, 0];
  const dreiecke = [];
  for (let i = 0; i < 4; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % 4);
    dreiecke.push(0, b, a, a, b, 5);
  }
  return { punkte, dreiecke };
}

/** Länge eines neuen Knochens für ein Teil der Höhe h (Meter) */
export const standardLaenge = (h) => Math.max(0.1, Math.round((Number.isFinite(h) && h > 0 ? h : 0.5) * 100) / 100);
