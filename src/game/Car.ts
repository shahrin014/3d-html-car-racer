import * as THREE from 'three';
import { PLAYER_HALF_LENGTH } from './constants';

const bodyGeometry = new THREE.BoxGeometry(1.6, 0.6, 3.55);
const cabinGeometry = new THREE.BoxGeometry(1.34, 0.52, 1.7);
const windshieldGeometry = new THREE.BoxGeometry(1.16, 0.3, 0.08);
const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 14);
const lightGeometry = new THREE.BoxGeometry(0.34, 0.14, 0.08);
const shadowGeometry = new THREE.CircleGeometry(1, 20);

const darkTrim = new THREE.MeshStandardMaterial({
  color: 0x161b26,
  roughness: 0.85,
  metalness: 0.1,
});
const glass = new THREE.MeshStandardMaterial({
  color: 0x0a1622,
  roughness: 0.18,
  metalness: 0.75,
});
const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});
const headlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xfff6d6,
  emissive: 0xffe9a8,
  emissiveIntensity: 1.6,
  roughness: 0.4,
});
const taillightMaterial = new THREE.MeshStandardMaterial({
  color: 0xff3b52,
  emissive: 0xff1233,
  emissiveIntensity: 1.5,
  roughness: 0.4,
});

/** Colours used for oncoming traffic. The player is always cyan. */
export const TRAFFIC_COLORS = [
  0xf97316,
  0xe11d48,
  0xa855f7,
  0xfacc15,
  0x38bdf8,
  0x84cc16,
] as const;

const paintCache = new Map<number, THREE.MeshStandardMaterial>();

function paintFor(color: number): THREE.MeshStandardMaterial {
  const cached = paintCache.get(color);
  if (cached) {
    return cached;
  }
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0.45,
  });
  paintCache.set(color, material);
  return material;
}

/**
 * Build a low-poly car out of primitives. No external models or textures are
 * loaded, which keeps the first paint fast on mobile networks.
 */
export function createCar(color: number): THREE.Group {
  const car = new THREE.Group();
  car.name = 'car';

  const paint = paintFor(color);

  const body = new THREE.Mesh(bodyGeometry, paint);
  body.position.y = 0.63;
  car.add(body);

  const cabin = new THREE.Mesh(cabinGeometry, paint);
  cabin.position.set(0, 1.14, -0.05);
  car.add(cabin);

  const windshield = new THREE.Mesh(windshieldGeometry, glass);
  windshield.position.set(0, 1.14, -0.92);
  car.add(windshield);

  const rearWindow = new THREE.Mesh(windshieldGeometry, glass);
  rearWindow.position.set(0, 1.14, 0.82);
  car.add(rearWindow);

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, darkTrim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.92, 0.35, end * 1.16);
      car.add(wheel);
    }

    const headlight = new THREE.Mesh(lightGeometry, headlightMaterial);
    headlight.position.set(side * 0.55, 0.72, -1.79);
    car.add(headlight);

    const taillight = new THREE.Mesh(lightGeometry, taillightMaterial);
    taillight.position.set(side * 0.55, 0.75, 1.79);
    car.add(taillight);
  }

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.scale.set(1.05, PLAYER_HALF_LENGTH, 1);
  car.add(shadow);

  return car;
}

/** Release module-level geometry and materials. Only used on full teardown. */
export function disposeCarAssets(): void {
  for (const geometry of [
    bodyGeometry,
    cabinGeometry,
    windshieldGeometry,
    wheelGeometry,
    lightGeometry,
    shadowGeometry,
  ]) {
    geometry.dispose();
  }
  for (const material of [darkTrim, glass, shadowMaterial, headlightMaterial, taillightMaterial]) {
    material.dispose();
  }
  for (const material of paintCache.values()) {
    material.dispose();
  }
  paintCache.clear();
}
