import * as THREE from 'three';

/**
 * Runde 32: Bodennebel (Morgen-Übergang Nacht → Tag; auch bei Wetter „nebel“ etwas): drei große, halbtransparente Ebenen dicht über
 * dem Boden, folgen der Kamera, Textur = weiche Wolkenflecken (Canvas, einmal erzeugt), ziehen langsam. Kostet 3 Draw-Calls und nur,
 * wenn sichtbar (staerke > 0). `aktualisiere(staerke 0..1, x, z, zeitSek, farbe, boden)`.
 */
const GROESSE = 2600;
const LAGEN = [
  { y: 5, deckung: 0.5, tempo: [0.004, 0.002], wdh: 3 },
  { y: 13, deckung: 0.32, tempo: [-0.003, 0.0035], wdh: 2.3 },
  { y: 24, deckung: 0.18, tempo: [0.002, -0.0025], wdh: 1.7 },
];

function wolkenTextur() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  let saat = 7;
  const zufall = () => ((saat = (saat * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = zufall() * 256, y = zufall() * 256, r = 18 + zufall() * 46;
    for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      const v = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      v.addColorStop(0, 'rgba(255,255,255,0.35)');
      v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class BodenNebel {
  constructor(szene) {
    this.gruppe = new THREE.Group();
    this.gruppe.visible = false;
    const textur = wolkenTextur();
    this.lagen = LAGEN.map((l) => {
      const map = textur.clone();
      map.repeat.set(l.wdh, l.wdh);
      map.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GROESSE, GROESSE).rotateX(-Math.PI / 2), material);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.gruppe.add(mesh);
      return { ...l, mesh, material, map };
    });
    szene.add(this.gruppe);
  }

  aktualisiere(staerke, x, z, zeit, farbe, boden = 0) {
    this.gruppe.visible = staerke > 0.01;
    if (!this.gruppe.visible) return;
    this.gruppe.position.set(x, boden, z);
    for (const l of this.lagen) {
      l.material.opacity = l.deckung * staerke;
      l.material.color.copy(farbe);
      l.mesh.position.y = l.y;
      // Textur gegen die Kamerabewegung verschieben → Nebel bleibt in der Welt liegen und driftet langsam
      l.map.offset.set((x / GROESSE) * l.wdh + zeit * l.tempo[0], (-z / GROESSE) * l.wdh + zeit * l.tempo[1]);
    }
  }
}
