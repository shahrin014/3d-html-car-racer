import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_BODY_COLOR } from './car-spec.mjs';

/**
 * Runtime car construction, shared by the game and the asset catalog.
 *
 * Cars are addressed by id: `<id>.glb`, `<id>-livery.png`, and
 * `<id>-paint-mask.png` under the given folder. Adding a car means publishing
 * another set of files and passing its id - this module does not grow a branch
 * per model, and both the game and the renderer go through it, so their
 * orientation and materials cannot drift.
 */

/** Rear pair first: the game steers every wheel at index 2 and above. */
const WHEEL_NAMES = [
  'wheel-rear-left',
  'wheel-rear-right',
  'wheel-front-left',
  'wheel-front-right',
];

const sets = new Map();
const resolvedById = new Map();

/** A livery material that swaps the white bodywork for the chosen paint. */
function paintedMaterial(source, color, map, mask, baseLuma) {
  const material = source.clone();
  material.userData.paint = color;
  if ('map' in material && map) {
    material.map = map;
    material.needsUpdate = true;
  }
  // Stock livery: keep the baked colours, no repaint shader.
  if (color === null || color === undefined || !map || !mask) {
    return material;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaintColor = { value: new THREE.Color(color) };
    shader.uniforms.uPaintMask = { value: mask };
    shader.uniforms.uPaintBaseLuma = { value: baseLuma };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uPaintColor;
uniform sampler2D uPaintMask;
uniform float uPaintBaseLuma;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 livery = texture2D( map, vMapUv );
float paintMask = texture2D( uPaintMask, vMapUv ).r;
float luma = dot( livery.rgb, vec3( 0.299, 0.587, 0.114 ) );
// Light bodies keep the livery's painted shading; dark bodies have almost no
// shading in the texture, so the paint is applied flat and lit by the scene.
float detail = mix( 1.0, 0.45 + 0.9 * luma, step( 0.2, uPaintBaseLuma ) );
vec3 painted = uPaintColor * detail;
diffuseColor *= vec4( mix( livery.rgb, painted, paintMask ), livery.a );`,
      );
  };
  // Three caches programs by material; a fresh key per colour is required.
  material.customProgramCacheKey = () => `livery-${color}-${baseLuma}`;
  material.needsUpdate = true;
  return material;
}

function loadSet(base, id) {
  return Promise.all([
    new GLTFLoader().loadAsync(`${base}${id}.glb`),
    new THREE.TextureLoader().loadAsync(`${base}${id}-livery.png`),
    new THREE.TextureLoader().loadAsync(`${base}${id}-paint-mask.png`),
  ]).then(([gltf, liveryTexture, mask]) => {
    liveryTexture.colorSpace = THREE.SRGBColorSpace;
    liveryTexture.flipY = false;
    liveryTexture.anisotropy = 4;
    mask.colorSpace = THREE.NoColorSpace;
    mask.flipY = false;
    mask.needsUpdate = true;

    const root = gltf.scene;
    root.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = false;
      }
    });
    return { template: root, livery: liveryTexture, mask };
  });
}

/**
 * Load one car's assets from `base` (ending in a slash). Resolves once the
 * set is ready; later calls for the same car reuse it.
 */
export function preloadCarModel(base, id = 'mach') {
  const key = `${base}${id}`;
  if (!sets.has(key)) {
    sets.set(key, loadSet(base, id));
  }
  const pending = sets.get(key);
  return pending.then((value) => {
    resolvedById.set(id, value);
    return value.template;
  });
}

/** Build one car from an already-loaded model root. */
export function buildCar(
  root,
  color = DEFAULT_BODY_COLOR,
  { livery = null, mask = null, baseLuma = 0.7 } = {},
) {
  const group = root.clone(true);
  group.name = 'car';

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
      const painted = paintedMaterial(material, color, livery, mask, baseLuma);
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

/** Build one car from the preloaded set for `id`. */
export function createCar(color = DEFAULT_BODY_COLOR, id = 'mach', baseLuma = 0.7) {
  const set = resolvedById.get(id);
  if (!set) {
    throw new Error(
      `car ${id} is not loaded; await preloadCarModel(base, '${id}')`,
    );
  }
  return buildCar(set.template, color, {
    livery: set.livery,
    mask: set.mask,
    baseLuma,
  });
}
