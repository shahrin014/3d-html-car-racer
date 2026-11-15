import * as THREE from 'three';
import { CAR_HEIGHT, CAR_LENGTH, CAR_WIDTH } from '../game/constants';

const paint = new THREE.MeshPhysicalMaterial({
  color: 0xa30f1d,
  metalness: 0.55,
  roughness: 0.28,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  side: THREE.DoubleSide,
});
const trim = new THREE.MeshStandardMaterial({
  color: 0x090b0f,
  metalness: 0.35,
  roughness: 0.6,
  side: THREE.DoubleSide,
});
const glass = new THREE.MeshPhysicalMaterial({
  color: 0x05070b,
  metalness: 0.5,
  roughness: 0.05,
  clearcoat: 1,
});
const gold = new THREE.MeshStandardMaterial({
  color: 0xd9a52b,
  metalness: 1,
  roughness: 0.22,
});
const tyre = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.92 });

const STATIONS = [
  { z: -1.26, halfWidth: 0.32, top: 0.42, floor: 0.18 },
  { z: -1.12, halfWidth: 0.46, top: 0.5, floor: 0.12 },
  { z: -0.9, halfWidth: 0.54, top: 0.56, floor: 0.1 },
  { z: -0.68, halfWidth: 0.55, top: 0.58, floor: 0.1 },
  { z: -0.45, halfWidth: 0.5, top: 0.58, floor: 0.1 },
  { z: -0.15, halfWidth: 0.46, top: 0.57, floor: 0.1 },
  { z: 0.2, halfWidth: 0.45, top: 0.52, floor: 0.1 },
  { z: 0.6, halfWidth: 0.48, top: 0.45, floor: 0.1 },
  { z: 0.82, halfWidth: 0.47, top: 0.4, floor: 0.1 },
  { z: 1.02, halfWidth: 0.39, top: 0.35, floor: 0.11 },
  { z: 1.2, halfWidth: 0.3, top: 0.3, floor: 0.13 },
];

function curveOf(key: 'halfWidth' | 'top' | 'floor') {
  return new THREE.CatmullRomCurve3(
    STATIONS.map((station) => new THREE.Vector3(station.z, station[key], 0)),
    false,
    'centripetal',
  );
}
const widthCurve = curveOf('halfWidth');
const topCurve = curveOf('top');
const floorCurve = curveOf('floor');
const zMin = STATIONS[0]?.z ?? -1.26;
const zMax = STATIONS[STATIONS.length - 1]?.z ?? 1.2;

function sectionAt(z: number) {
  const t = THREE.MathUtils.clamp((z - zMin) / (zMax - zMin), 0, 1);
  return {
    halfWidth: widthCurve.getPoint(t).y,
    top: topCurve.getPoint(t).y,
    floor: floorCurve.getPoint(t).y,
  };
}

function sectionPoint(
  section: { halfWidth: number; top: number; floor: number },
  angle: number,
): THREE.Vector3 {
  const centreY = (section.top + section.floor) / 2;
  const radius = Math.sin(angle) >= 0 ? section.top - centreY : centreY - section.floor;
  const exponent = 2 / 2.7;
  return new THREE.Vector3(
    section.halfWidth * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** exponent,
    centreY + radius * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** exponent,
    0,
  );
}

function buildBody(): THREE.Mesh {
  const segments = 32;
  const steps = 60;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const z = THREE.MathUtils.lerp(zMin, zMax, step / steps);
    const section = sectionAt(z);
    for (let index = 0; index < segments; index += 1) {
      const point = sectionPoint(section, (index / segments) * Math.PI * 2);
      positions.push(point.x, point.y, z);
    }
  }
  for (let step = 0; step < steps; step += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const a = step * segments + index;
      const b = step * segments + next;
      const c = (step + 1) * segments + index;
      const d = (step + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, paint);
}

function buildWheel(radius: number, width: number): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 28),
    tyre,
  );
  tire.rotation.z = Math.PI / 2;
  wheel.add(tire);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width + 0.012, 24),
    gold,
  );
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);
  for (let index = 0; index < 10; index += 1) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.2, radius * 1.2, 0.025),
      gold,
    );
    spoke.rotation.x = (index / 10) * Math.PI;
    wheel.add(spoke);
  }
  return wheel;
}

export interface Car {
  group: THREE.Group;
  wheels: THREE.Group[];
  setSteer: (value: number) => void;
}

export function createCar(): Car {
  const group = new THREE.Group();
  group.name = 'car';
  group.add(buildBody());

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass);
  canopy.scale.set(0.34, 0.19, 0.62);
  canopy.position.set(0, 0.57, 0.1);
  group.add(canopy);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.28), trim);
  wing.position.set(0, 0.8, -1.12);
  group.add(wing);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.03, 0.34), trim);
  splitter.position.set(0, 0.07, 1.06);
  group.add(splitter);

  const wheels: THREE.Group[] = [];
  const piers: [number, number, number][] = [
    [-0.45, 0.34, -0.7],
    [0.45, 0.34, -0.7],
    [-0.44, 0.31, 0.7],
    [0.44, 0.31, 0.7],
  ];
  for (const [x, radius, z] of piers) {
    const wheel = buildWheel(radius, x < 0 ? 0.3 : 0.26);
    wheel.position.set(x, radius, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  return {
    group,
    wheels,
    setSteer: (value: number) => {
      for (const wheel of wheels.slice(2)) {
        wheel.rotation.y = value * 0.35;
      }
    },
  };
}

export const CAR_DIMENSIONS = {
  length: CAR_LENGTH,
  width: CAR_WIDTH,
  height: CAR_HEIGHT,
};
