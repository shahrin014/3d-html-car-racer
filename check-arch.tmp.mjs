
const ARCH_GAP = 0.03;
const smoothstep = (t) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;
const STATIONS = [
  { z: -1.225, halfWidth: 0.4, floor: 0.3, shoulder: 0.4, fenderX: 0.26, fender: 0.46, centre: 0.44 },
  { z: -1.16, halfWidth: 0.44, floor: 0.26, shoulder: 0.44, fenderX: 0.3, fender: 0.51, centre: 0.48 },
  { z: -1.05, halfWidth: 0.47, floor: 0.2, shoulder: 0.49, fenderX: 0.34, fender: 0.57, centre: 0.52 },
  { z: -0.92, halfWidth: 0.49, floor: 0.14, shoulder: 0.53, fenderX: 0.37, fender: 0.6, centre: 0.54 },
  { z: -0.8, halfWidth: 0.5, floor: 0.11, shoulder: 0.56, fenderX: 0.39, fender: 0.63, centre: 0.55 },
  { z: -0.7, halfWidth: 0.5, floor: 0.1, shoulder: 0.58, fenderX: 0.41, fender: 0.64, centre: 0.55 },
  { z: -0.58, halfWidth: 0.5, floor: 0.1, shoulder: 0.57, fenderX: 0.41, fender: 0.62, centre: 0.54 },
  { z: -0.45, halfWidth: 0.5, floor: 0.1, shoulder: 0.55, fenderX: 0.42, fender: 0.59, centre: 0.53 },
  { z: -0.3, halfWidth: 0.5, floor: 0.1, shoulder: 0.53, fenderX: 0.44, fender: 0.56, centre: 0.51 },
  { z: -0.1, halfWidth: 0.5, floor: 0.1, shoulder: 0.51, fenderX: 0.46, fender: 0.53, centre: 0.5 },
  { z: 0.1, halfWidth: 0.5, floor: 0.1, shoulder: 0.5, fenderX: 0.47, fender: 0.52, centre: 0.49 },
  { z: 0.3, halfWidth: 0.5, floor: 0.1, shoulder: 0.51, fenderX: 0.47, fender: 0.54, centre: 0.48 },
  { z: 0.46, halfWidth: 0.5, floor: 0.1, shoulder: 0.53, fenderX: 0.46, fender: 0.57, centre: 0.47 },
  { z: 0.6, halfWidth: 0.5, floor: 0.1, shoulder: 0.55, fenderX: 0.44, fender: 0.6, centre: 0.45 },
  { z: 0.7, halfWidth: 0.5, floor: 0.1, shoulder: 0.54, fenderX: 0.42, fender: 0.59, centre: 0.43 },
  { z: 0.82, halfWidth: 0.49, floor: 0.1, shoulder: 0.51, fenderX: 0.4, fender: 0.55, centre: 0.4 },
  { z: 0.95, halfWidth: 0.47, floor: 0.11, shoulder: 0.47, fenderX: 0.36, fender: 0.49, centre: 0.37 },
  { z: 1.06, halfWidth: 0.43, floor: 0.1, shoulder: 0.38, fenderX: 0.31, fender: 0.42, centre: 0.32 },
  { z: 1.15, halfWidth: 0.38, floor: 0.11, shoulder: 0.32, fenderX: 0.26, fender: 0.34, centre: 0.27 },
  { z: 1.225, halfWidth: 0.3, floor: 0.13, shoulder: 0.27, fenderX: 0.2, fender: 0.28, centre: 0.25 },
];
function archAt(z, floor) {
  let arch = floor;
  for (const [axle, r] of [[-0.7, 0.3], [0.7, 0.28]]) {
    const reach = r + ARCH_GAP;
    const dz = z - axle;
    if (Math.abs(dz) < reach) arch = Math.max(arch, r + Math.sqrt(reach * reach - dz * dz));
  }
  return arch;
}
let worst = Infinity, worstZ = 0;
for (let z = -1.225; z <= 1.225; z += 0.005) {
  const zz = +z.toFixed(3);
  let i = 0;
  while (i < STATIONS.length - 2 && zz > STATIONS[i + 1].z) i++;
  const a = STATIONS[i], b = STATIONS[i + 1];
  const t = Math.min(1, Math.max(0, (zz - a.z) / (b.z - a.z)));
  const floor = lerp(a.floor, b.floor, t);
  const arch = archAt(zz, floor);
  for (const [axle, r] of [[-0.7, 0.3], [0.7, 0.28]]) {
    const dz = zz - axle;
    if (Math.abs(dz) >= r) continue;
    const tyreTop = r + Math.sqrt(r * r - dz * dz);
    const margin = arch - tyreTop;
    if (margin < worst) { worst = margin; worstZ = zz; }
  }
}
console.log("worst arch clearance " + (worst * 1000).toFixed(1) + " mm at z " + worstZ.toFixed(3) + (worst > 0 ? " OK" : " CLIP"));
