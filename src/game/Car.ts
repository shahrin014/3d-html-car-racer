import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  CAR,
  CAR_MATERIALS,
  DEFAULT_BODY_COLOR,
  liveryFor,
  type CarModel,
  type Livery,
} from './car-spec.mjs';

/**
 * The car the player drives: the Mach Speeder built as a binary glTF and
 * loaded once per session.
 *
 * The file is authored offline (see `tools/model/`) from the same spec in
 * `car-spec.mjs` that sizes the chassis collider, so the visual body and the
 * physics envelope cannot drift. Each car is a clone of the loaded scene; only
 * the three paint channels are cloned per car, so ten rivals still share one
 * set of tyres, glass, and lights.
 */
export type Car = CarModel;

/** Paint of the reference casting: white body, blue stripe, orange accents. */
export const PLAYER_PAINT = DEFAULT_BODY_COLOR;

const MODEL_URL = `${import.meta.env.BASE_URL}models/car.glb`;

/** Rear pair first: the game steers every wheel at index 2 and above. */
const WHEEL_NAMES = [
  'wheel-rear-left',
  'wheel-rear-right',
  'wheel-front-left',
  'wheel-front-right',
] as const;

let template: THREE.Object3D | null = null;
let loading: Promise<THREE.Object3D> | null = null;

function loadTemplate(): Promise<THREE.Object3D> {
  loading ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
    const root = gltf.scene;
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
      }
    });
    template = root;
    return root;
  });
  return loading;
}

/**
 * Fetch the car model ahead of the first race. The menu's 3D view is the car,
 * so the shell waits for it; a cold load without network fails here rather than
 * later, mid-race.
 */
export async function preloadCarModel(): Promise<void> {
  await loadTemplate();
}

/** Recolour one paint channel, dropping any baked map that would mask it. */
function paintChannel(
  source: THREE.Material,
  color: number,
  clearcoat: number,
): THREE.Material {
  const material = source.clone() as THREE.MeshPhysicalMaterial;
  material.name = source.name;
  material.color.setHex(color);
  if ('map' in material) {
    material.map = null;
  }
  if ('emissive' in material) {
    material.emissive.setHex(0x000000);
  }
  if ('clearcoat' in material) {
    material.clearcoat = clearcoat;
  }
  return material;
}

function materialFor(
  source: THREE.Material,
  livery: Livery,
  cache: Map<THREE.Material, THREE.Material>,
): THREE.Material {
  const cached = cache.get(source);
  if (cached) {
    return cached;
  }
  let next = source;
  switch (source.name) {
    case CAR_MATERIALS.paint:
      next = paintChannel(source, livery.body, 0.55);
      break;
    case CAR_MATERIALS.paintDeep:
      next = paintChannel(source, livery.deep, 0.2);
      break;
    case CAR_MATERIALS.stripe:
      next = paintChannel(source, livery.stripe, 0.45);
      break;
    default:
      break;
  }
  cache.set(source, next);
  return next;
}

/**
 * Build one car from an already-loaded model root. Exported separately so the
 * geometry contract (named wheel nodes, four wheels, front pair last) can be
 * tested against the shipped GLB without a browser.
 */
export function buildCar(root: THREE.Object3D, color = PLAYER_PAINT): Car {
  const livery = liveryFor(color);
  const group = root.clone(true) as THREE.Group;
  group.name = 'car';

  const cache = new Map<THREE.Material, THREE.Material>();
  group.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) {
      return;
    }
    const mesh = node as THREE.Mesh;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => materialFor(material, livery, cache))
      : materialFor(mesh.material, livery, cache);
  });

  const wheels: THREE.Group[] = [];
  for (const name of WHEEL_NAMES) {
    const wheel = group.getObjectByName(name) as THREE.Group | undefined;
    if (wheel) {
      // Steer about Y outside the spin about X; the default XYZ order would
      // precess the axle and make the fronts wobble at speed.
      wheel.rotation.order = 'YXZ';
      wheels.push(wheel);
    }
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

/**
 * Build one car. Throws if the model has not finished loading, which the boot
 * path prevents by awaiting `preloadCarModel()` first.
 */
export function createCar(color = PLAYER_PAINT): Car {
  const scene = template;
  if (!scene) {
    throw new Error('car model is not loaded; await preloadCarModel()');
  }
  return buildCar(scene, color);
}

/** Visual envelope in metres, kept in step with the physics chassis. */
export const CAR_DIMENSIONS = {
  length: CAR.length,
  width: CAR.width,
  height: CAR.height,
};

/** Driven-wheel radius: the game rolls the wheels by this, not by eye. */
export const WHEEL_RADIUS = CAR.rearWheelRadius;
