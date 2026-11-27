import * as THREE from 'three';
import {
  AppearanceMode,
  RenderMode,
  VFXParticles,
  vfxStore,
  type EmitCallbackSettings,
} from 'wawa-vfx-vanilla';

/**
 * Spark particles for impacts and sliding tyres.
 *
 * `wawa-vfx-vanilla` supplies the instanced billboard renderer and the fixed
 * particle pool. This adapter keeps the game's small vocabulary (a burst at a
 * contact point, a spray from a tyre) and maps both onto the library's emitter
 * callback. Particles are stretched along their velocity, which reads as a
 * spark streak rather than a round dot.
 */

/** Hard cap on live sparks. A long drift at full slide peaks well below this. */
const MAX_SPARKS = 420;
const GRAVITY = -5.2;

/** Hot core through orange to a dull ember, with a matching tail colour. */
const IMPACT_COLORS = [
  { start: '#fff4d6', end: '#ffb347' },
  { start: '#ffd27a', end: '#ff7a1a' },
  { start: '#ff9a3c', end: '#ff3b0a' },
] as const;
const DRIFT_COLORS = [
  { start: '#ffe2a8', end: '#ff8a1e' },
  { start: '#ffb15c', end: '#ff5a0a' },
] as const;

const random = Math.random;
const IMPACT_SPEED: readonly [number, number] = [1.6, 5];
const DRIFT_SPEED: readonly [number, number] = [0.7, 2.5];

let systemCount = 0;

/** A soft round point sprite, stretched into a streak by the renderer. */
function glowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const distance = Math.min(1, Math.hypot(dx, dy) * 2);
      const alpha = Math.round((1 - distance) ** 2 * 255);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export interface SparkSystem {
  /** Throw `count` sparks from an impact, biased away from `normal`. */
  burst: (position: THREE.Vector3, normal: THREE.Vector3, count: number) => void;
  /** Spray a few sparks from a tyre sliding along the deck. */
  spray: (position: THREE.Vector3, direction: THREE.Vector3, count: number) => void;
  /** Advance every live particle. */
  update: (delta: number) => void;
  /** Forget every particle, for a restart or a circuit swap. */
  clear: () => void;
  dispose: () => void;
  /** Live particle count, used by tests. */
  readonly live: number;
}

export function createSparkSystem(scene: THREE.Scene): SparkSystem {
  const name = `sparks-${(systemCount += 1)}`;
  const texture = glowTexture();
  const particles = new VFXParticles(
    name,
    {
      nbParticles: MAX_SPARKS,
      gravity: [0, GRAVITY, 0],
      renderMode: RenderMode.StretchBillboard,
      stretchScale: 0.1,
      intensity: 1.8,
      appearance: AppearanceMode.Circular,
      easeFunction: 'easeLinear',
      fadeAlpha: [0.01, 0.78],
      fadeSize: [0.01, 0.9],
      blendingMode: THREE.AdditiveBlending,
      depthTest: true,
      frustumCulled: false,
      side: THREE.DoubleSide,
    },
    undefined,
    texture,
  );
  const mesh = particles.getMesh();
  mesh.name = 'sparks';
  scene.add(mesh);

  let elapsed = 0;
  const lifetimes = mesh.geometry.getAttribute(
    'instanceLifetime',
  ) as THREE.InstancedBufferAttribute;
  const lifetimeValues = lifetimes.array as Float32Array;
  const store = vfxStore.getState();

  const emit = (
    count: number,
    make: () => EmitCallbackSettings,
  ): void => {
    if (count <= 0) {
      return;
    }
    store.emit(name, count, make);
  };

  const burst = (
    position: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
  ): void => {
    emit(count, () => {
      // A random direction in the hemisphere the surface throws sparks into.
      let dx = normal.x + (random() - 0.5) * 1.8;
      let dy = normal.y + (random() - 0.5) * 1.4 + 0.6;
      let dz = normal.z + (random() - 0.5) * 1.8;
      const length = Math.hypot(dx, dy, dz) || 1;
      dx /= length;
      dy /= length;
      dz /= length;
      const speed =
        IMPACT_SPEED[0] + random() * (IMPACT_SPEED[1] - IMPACT_SPEED[0]);
      const size = 0.26 + random() * 0.26;
      const color = IMPACT_COLORS[Math.floor(random() * IMPACT_COLORS.length)]!;
      return {
        position: [
          position.x + (random() - 0.5) * 0.12,
          position.y + (random() - 0.5) * 0.12,
          position.z + (random() - 0.5) * 0.12,
        ],
        direction: [dx, dy, dz],
        scale: [size, size, size],
        rotation: [0, 0, 0],
        rotationSpeed: [0, 0, 0],
        lifetime: [elapsed, 0.22 + random() * 0.36],
        colorStart: color.start,
        colorEnd: color.end,
        speed: [speed],
      };
    });
  };

  const spray = (
    position: THREE.Vector3,
    direction: THREE.Vector3,
    count: number,
  ): void => {
    emit(count, () => {
      const dx = direction.x + (random() - 0.5) * 1.2;
      const dy = direction.y + random() * 1.1 + 0.2;
      const dz = direction.z + (random() - 0.5) * 1.2;
      const length = Math.hypot(dx, dy, dz) || 1;
      const speed =
        DRIFT_SPEED[0] + random() * (DRIFT_SPEED[1] - DRIFT_SPEED[0]);
      const size = 0.16 + random() * 0.16;
      const color = DRIFT_COLORS[Math.floor(random() * DRIFT_COLORS.length)]!;
      return {
        position: [
          position.x + (random() - 0.5) * 0.08,
          position.y + 0.02 + random() * 0.04,
          position.z + (random() - 0.5) * 0.08,
        ],
        direction: [dx / length, dy / length, dz / length],
        scale: [size, size, size],
        rotation: [0, 0, 0],
        rotationSpeed: [0, 0, 0],
        lifetime: [elapsed, 0.14 + random() * 0.22],
        colorStart: color.start,
        colorEnd: color.end,
        speed: [speed],
      };
    });
  };

  const update = (delta: number): void => {
    if (delta <= 0) {
      return;
    }
    elapsed += delta;
    particles.update(elapsed);
  };

  const clear = (): void => {
    // Retire every slot beyond the current clock, so the shader discards it.
    for (let index = 0; index < MAX_SPARKS; index += 1) {
      lifetimeValues[index * 2] = elapsed + 1000;
      lifetimeValues[index * 2 + 1] = 0;
    }
    lifetimes.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    particles.dispose();
    texture.dispose();
  };

  return {
    burst,
    spray,
    update,
    clear,
    dispose,
    get live() {
      let alive = 0;
      for (let index = 0; index < MAX_SPARKS; index += 1) {
        const start = lifetimeValues[index * 2]!;
        const duration = lifetimeValues[index * 2 + 1]!;
        if (duration > 1e-6 && start + duration > elapsed) {
          alive += 1;
        }
      }
      return alive;
    },
  };
}
