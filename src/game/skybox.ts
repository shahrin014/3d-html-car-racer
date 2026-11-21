import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import dawnUrl from '../../assets/skyboxes/dawn-hdr.hdr?url';
import mistUrl from '../../assets/skyboxes/mist-hdr.hdr?url';
import nightUrl from '../../assets/skyboxes/night-hdr.hdr?url';
import noonUrl from '../../assets/skyboxes/noon-hdr.hdr?url';
import scythianUrl from '../../assets/skyboxes/scythian-hdr.hdr?url';
import sunsetUrl from '../../assets/skyboxes/sunset-hdr.hdr?url';

/**
 * Skyboxes from the CC0 Poly Haven collection, stored in `assets/skyboxes`.
 *
 * Every circuit draws one sky from its seed, so the same circuit keeps its sky
 * and a fresh circuit brings a new one with it. Textures load lazily and are
 * cached for the session; the source pages and licence are listed in
 * `assets/skyboxes/README.md`.
 */
export type SkyboxId =
  | 'dawn'
  | 'noon'
  | 'sunset'
  | 'scythian'
  | 'night'
  | 'mist';

export interface SkyboxStyle {
  readonly id: SkyboxId;
  readonly name: string;
  /** Flat colour used for fog and while the HDR texture is loading. */
  readonly fog: number;
  readonly url: string;
}

export const SKYBOX_STYLES: readonly SkyboxStyle[] = [
  {
    id: 'dawn',
    name: 'Dawn over the valley',
    fog: 0x96a5ba,
    url: dawnUrl,
  },
  {
    id: 'noon',
    name: 'Cloudscape at noon',
    fog: 0xa2c3e2,
    url: noonUrl,
  },
  {
    id: 'sunset',
    name: 'Sunset haze',
    fog: 0xb0bbc8,
    url: sunsetUrl,
  },
  {
    id: 'scythian',
    name: 'Scythian sunset',
    fog: 0xb2bdc6,
    url: scythianUrl,
  },
  {
    id: 'night',
    name: 'Starlit night',
    fog: 0x273545,
    url: nightUrl,
  },
  {
    id: 'mist',
    name: 'Mountain mist',
    fog: 0xb6c0ca,
    url: mistUrl,
  },
];

const loader = new HDRLoader();
const textures = new Map<SkyboxId, Promise<THREE.Texture>>();

export interface Skybox {
  readonly style: SkyboxStyle;
  readonly texture: Promise<THREE.Texture>;
}

function loadTexture(style: SkyboxStyle): Promise<THREE.Texture> {
  const cached = textures.get(style.id);
  if (cached) {
    return cached;
  }
  const pending = loader
    .loadAsync(style.url)
    .then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    })
    .catch((error: unknown) => {
      textures.delete(style.id);
      throw error;
    });
  textures.set(style.id, pending);
  return pending;
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sky belonging to a circuit seed; pure enough to unit test. */
export function skyboxStyleForSeed(seed: string): SkyboxStyle {
  const random = seededRandom(`${seed}:skybox`);
  return SKYBOX_STYLES[Math.floor(random() * SKYBOX_STYLES.length)]!;
}

/** Start loading the sky for `seed`. Repeated skies share one texture. */
export function buildSkybox(seed: string): Skybox {
  const style = skyboxStyleForSeed(seed);
  return { style, texture: loadTexture(style) };
}

/** Drop cached HDR textures when the game is torn down. */
export function disposeSkyboxes(): void {
  for (const pending of textures.values()) {
    void pending.then((texture) => texture.dispose()).catch(() => undefined);
  }
  textures.clear();
}
