/**
 * Geometry gate for the car model: run it after any change to
 * src/game/car-model.mjs.
 *
 * It checks the properties that are easy to break by eye and hard to see in a
 * render: that the shell is a closed, outward-wound surface with no degenerate
 * or non-finite geometry, that no bodywork passes through a tyre, and that the
 * envelope still matches the declared CAR dimensions.
 *
 *   npm run model:check
 */
import * as THREE from 'three';
import { CAR, createCar } from '../src/game/car-model.mjs';

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const model = createCar();
const group = model.group;

// --- Envelope -------------------------------------------------------------
const box = new THREE.Box3().setFromObject(group);
const size = box.getSize(new THREE.Vector3());
check(Math.abs(size.x - CAR.width) <= 0.04, `width ${size.x.toFixed(3)} vs ${CAR.width}`);
check(size.z <= CAR.length + 0.02, `length ${size.z.toFixed(3)} exceeds ${CAR.length}`);
check(size.y <= 1, `height ${size.y.toFixed(3)} above 1.0`);

// --- Mesh integrity -------------------------------------------------------
let triangles = 0;
let nonFinite = 0;
let zeroArea = 0;
const meshes = [];
group.traverse((node) => {
  if (node.isMesh && node.geometry?.getAttribute('position')) meshes.push(node);
});

for (const mesh of meshes) {
  const position = mesh.geometry.getAttribute('position');
  for (const value of position.array) {
    if (!Number.isFinite(value)) nonFinite += 1;
  }
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : position.count;
  triangles += count / 3;
  for (let t = 0; t < count; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    const pa = new THREE.Vector3().fromBufferAttribute(position, a);
    const pb = new THREE.Vector3().fromBufferAttribute(position, b);
    const pc = new THREE.Vector3().fromBufferAttribute(position, c);
    if (pb.clone().sub(pa).cross(pc.clone().sub(pa)).lengthSq() < 1e-16) zeroArea += 1;
  }
}
check(nonFinite === 0, `${nonFinite} non-finite coordinates`);
check(zeroArea === 0, `${zeroArea} zero-area faces`);

// --- Winding: signed volume of the closed shell must be positive ----------
const shell = group.children.slice(0, 3);
let volume = 0;
for (const mesh of shell) {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const count = index ? index.count : position.count;
  for (let t = 0; t < count; t += 3) {
    const A = index ? index.getX(t) : t;
    const B = index ? index.getX(t + 1) : t + 1;
    const C = index ? index.getX(t + 2) : t + 2;
    const ax = position.getX(A), ay = position.getY(A), az = position.getZ(A);
    const bx = position.getX(B), by = position.getY(B), bz = position.getZ(B);
    const cx = position.getX(C), cy = position.getY(C), cz = position.getZ(C);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
}
check(volume > 0, `shell winding looks inward (signed volume ${volume.toFixed(3)})`);

// --- Tyre clearance -------------------------------------------------------
// The arch line is meant to clear every tyre; a body vertex inside a tyre
// means the wheel arches are too shallow and the car clips its own wheels.
const wheels = [
  { x: -0.41, z: CAR.rearAxle, r: CAR.rearWheelRadius, w: CAR.rearTyreWidth },
  { x: 0.41, z: CAR.rearAxle, r: CAR.rearWheelRadius, w: CAR.rearTyreWidth },
  { x: -0.415, z: CAR.frontAxle, r: CAR.frontWheelRadius, w: CAR.frontTyreWidth },
  { x: 0.415, z: CAR.frontAxle, r: CAR.frontWheelRadius, w: CAR.frontTyreWidth },
];
const position = shell[0].geometry.getAttribute('position');
let clashes = 0;
let closest = Infinity;
for (let i = 0; i < position.count; i += 1) {
  const x = position.getX(i);
  const y = position.getY(i);
  const z = position.getZ(i);
  for (const wheel of wheels) {
    if (Math.abs(x - wheel.x) > wheel.w / 2) continue;
    const margin = Math.hypot(y - wheel.r, z - wheel.z) - wheel.r;
    if (margin < 0) clashes += 1;
    closest = Math.min(closest, margin);
  }
}
check(clashes === 0, `${clashes} body vertices inside a tyre`);

const summary =
  `car model: ${Math.round(triangles)} triangles · envelope ` +
  `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m · ` +
  `arch clearance ${Number.isFinite(closest) ? (closest * 1000).toFixed(0) : 'n/a'} mm`;
console.log(summary);

if (failures.length > 0) {
  console.error(`car model check failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('car model check passed');
