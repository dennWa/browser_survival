import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BlockInstanzen, boxZweiGruppen, kulEintrag, kulleNachWeite } from '../client/darstellung/bloecke.js';

/** Runde 18 (4.1): Render-Culling – Blöcke statt eines Meshes über die ganze Karte, Sichtweiten-Culling. */
const an = (x, z) => new THREE.Matrix4().makeTranslation(x, 0, z);

test('BlockInstanzen: Instanzen landen im richtigen Block, globale Nummern bleiben gültig', () => {
  const matrizen = [an(10, 10), an(900, 10), an(20, 30), an(10, 900)];
  const bi = new BlockInstanzen(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), matrizen, { blockPx: 512 });
  assert.equal(bi.meshes.length, 3, 'drei Blöcke');
  assert.equal(bi.count, 4);
  assert.equal(bi.meshes[bi.blockNr[0]], bi.meshes[bi.blockNr[2]], '0 und 2 im selben Block');
  // setMatrixAt/getMatrixAt über die globale Nummer
  bi.setMatrixAt(1, an(901, 11));
  const m = new THREE.Matrix4();
  bi.getMatrixAt(1, m);
  assert.equal(m.elements[12], 901);
  // Ausgangsmatrizen (WandDurchsicht stellt damit zurück) und needsUpdate nur für geänderte Blöcke
  assert.equal(bi.instanceMatrix.array[1 * 16 + 12], 900);
  const block = bi.meshes[bi.blockNr[1]];
  const vorher = block.instanceMatrix.version;
  bi.instanceMatrix.needsUpdate = true;
  assert.ok(block.instanceMatrix.version > vorher);
});

test('BlockInstanzen: ohne Blöcke (blockPx Infinity) genau ein Mesh; Material/visible wie ein Mesh', () => {
  const mat = new THREE.MeshBasicMaterial();
  const bi = new BlockInstanzen(new THREE.BoxGeometry(1, 1, 1), mat, [an(0, 0), an(5000, 5000)], { blockPx: Infinity });
  assert.equal(bi.meshes.length, 1);
  assert.equal(bi.material, mat);
  bi.visible = false;
  assert.equal(bi.visible, false);
  const leer = new BlockInstanzen(new THREE.BoxGeometry(1, 1, 1), mat, [], { blockPx: 512 });
  assert.equal(leer.meshes.length, 0);
  leer.instanceMatrix.needsUpdate = true; // darf nicht werfen
});

test('boxZweiGruppen: zwei Materialgruppen, alle Dreiecke erhalten', () => {
  const box = boxZweiGruppen(32, 1, 32);
  assert.equal(box.groups.length, 2);
  assert.equal(box.groups[0].count + box.groups[1].count, new THREE.BoxGeometry(32, 1, 32).index.count);
  assert.equal(box.groups[1].count, 12, 'Deckel + Boden = 4 Dreiecke');
});

test('Sichtweiten-Culling: nur Blöcke innerhalb Weite (+ Radius) bleiben sichtbar, setzt nur bei Änderung', () => {
  const nah = new THREE.Object3D();
  const fern = new THREE.Object3D();
  const eintraege = [kulEintrag(nah, new THREE.Sphere(new THREE.Vector3(100, 0, 0), 50)), kulEintrag(fern, new THREE.Sphere(new THREE.Vector3(5000, 0, 0), 50))];
  assert.equal(kulleNachWeite(eintraege, 0, 0, 0, 1000), 1);
  assert.equal(nah.visible, true);
  assert.equal(fern.visible, false);
  assert.equal(kulleNachWeite(eintraege, 0, 0, 0, Infinity), 2);
  assert.equal(fern.visible, true);
});
