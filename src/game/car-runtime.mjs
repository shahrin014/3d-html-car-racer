import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_BODY_COLOR } from './car-spec.mjs';

/**
 * Runtime car construction, shared by the game and the asset catalog.
 *
 * Both the game (src/game/Car.ts) and the preview renderer
 * (tools/preview/car-model.mjs) call this module with the folder that holds
 * car.glb, car-livery.png, and car-paint-mask.png. Having one path means the
 * catalog cannot show a differently transformed car than the one driven.
 */

/** Rear pair first: the game steers every wheel at index 2 and above. */
const WHEEL_NAMES = [
  'wheel-rear-left',
  'wheel-rear-right',
  'wheel-front-left',
  'wheel-front-right',
];

let template = null;
let livery = null;
let paintMask = null;
let loading = null;

/** A livery material that swaps the white bodywork for the chosen paint. */
function paintedMaterial(source, color, map, mask) {
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
 * Load the model, livery, and mask from `base` (which must end with a slash).
 */
export function preloadCarModel(base) {
  loading ??= Promise.all([
    new GLTFLoader().loadAsync(`${base}car.glb`),
    new THREE.TextureLoader().loadAsync(`${base}car-livery.png`),
    new THREE.TextureLoader().loadAsync(`${base}car-paint-mask.png`),
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
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = false;
      }
    });
    template = root;
    return root;
  });
  return loading;
}

/** Build one car from an already-loaded model root. */
export function buildCar(root, color = DEFAULT_BODY_COLOR) {
  const group = root.clone(true);
  group.name = 'car';

  const map = livery;
  const mask = paintMask;
  const cache = new Map();
  group.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    const swap = (material) => {
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
    node.material = Array.isArray(node.material)
      ? node.material.map(swap)
      : swap(node.material);
  });

  const wheels = [];
  for (const name of WHEEL_NAMES) {
    const wheel = group.getObjectByName(name);
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
    setSteer: (value) => {
      for (const wheel of wheels.slice(2)) {
        wheel.rotation.y = value * 0.35;
      }
    },
  };
}

/** Build one car from the preloaded model. */
export function createCar(color = DEFAULT_BODY_COLOR) {
  if (!template) {
    throw new Error('car model is not loaded; await preloadCarModel()');
  }
  return buildCar(template, color);
}
