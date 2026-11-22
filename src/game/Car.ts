import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR, DEFAULT_BODY_COLOR, type CarModel } from './car-spec.mjs';

/**
 * The car the player drives: the Mach Speeder, loaded once from a binary glTF
 * and cloned per car.
 *
 * The model keeps its baked livery - that is what makes it read as the casting
 * - and the selected paint is mixed into the white bodywork through a paint
 * mask. Blue stripes, orange aero, glazing, and tyres are untouched, so ten
 * very different paint colours all keep the same livery layout.
 */
export type Car = CarModel;

/** Paint of the reference casting. */
export const PLAYER_PAINT = DEFAULT_BODY_COLOR;

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/car.glb`;
const LIVERY_URL = `${BASE}models/car-livery.png`;
const MASK_URL = `${BASE}models/car-paint-mask.png`;

/** Rear pair first: the game steers every wheel at index 2 and above. */
const WHEEL_NAMES = [
  'wheel-rear-left',
  'wheel-rear-right',
  'wheel-front-left',
  'wheel-front-right',
] as const;

let template: THREE.Object3D | null = null;
let livery: THREE.Texture | null = null;
let paintMask: THREE.Texture | null = null;
let loading: Promise<THREE.Object3D> | null = null;

function loadTemplate(): Promise<THREE.Object3D> {
  loading ??= Promise.all([
    new GLTFLoader().loadAsync(MODEL_URL),
    new THREE.TextureLoader().loadAsync(LIVERY_URL),
    new THREE.TextureLoader().loadAsync(MASK_URL),
  ]).then(([gltf, liveryTexture, mask]) => {
    liveryTexture.colorSpace = THREE.SRGBColorSpace;
    liveryTexture.flipY = false;
    liveryTexture.anisotropy = 4;
    livery = liveryTexture;
    mask.colorSpace = THREE.NoColorSpace;
    mask.flipY = false;
    mask.needsUpdate = true;
    paintMask = mask;

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

/** A livery material that swaps the white bodywork for the chosen paint. */
function paintedMaterial(
  source: THREE.Material,
  color: number,
  map: THREE.Texture | null,
  mask: THREE.Texture | null,
): THREE.Material {
  const material = source.clone();
  material.userData.paint = color;
  if ('map' in material && map) {
    material.map = map;
    material.needsUpdate = true;
  }
  if (!map || !mask) {
    return material;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaintColor = { value: new THREE.Color(color) };
    shader.uniforms.uPaintMask = { value: mask };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uPaintColor;
uniform sampler2D uPaintMask;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 livery = texture2D( map, vMapUv );
float paintMask = texture2D( uPaintMask, vMapUv ).r;
float shade = dot( livery.rgb, vec3( 0.299, 0.587, 0.114 ) );
vec3 painted = uPaintColor * ( 0.45 + 0.9 * shade );
diffuseColor *= vec4( mix( livery.rgb, painted, paintMask ), livery.a );`,
      );
  };
  // Three caches programs by material; a fresh key per colour is required.
  material.customProgramCacheKey = () => `livery-${color}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Build one car from an already-loaded model root. Exported separately so the
 * geometry contract (named wheel nodes, four wheels, front pair last) can be
 * tested against the shipped GLB without a browser.
 */
export function buildCar(root: THREE.Object3D, color = PLAYER_PAINT): Car {
  const group = root.clone(true) as THREE.Group;
  group.name = 'car';

  const mask = paintMask;
  const map = livery;
  const cache = new Map<THREE.Material, THREE.Material>();
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const swap = (material: THREE.Material): THREE.Material => {
      if (material.name !== 'Livery') {
        return material;
      }
      const cached = cache.get(material);
      if (cached) {
        return cached;
      }
      const painted = paintedMaterial(material, color, map, mask);
      cache.set(material, painted);
      return painted;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(swap)
      : swap(mesh.material);
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
