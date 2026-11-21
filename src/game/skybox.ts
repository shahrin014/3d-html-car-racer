import * as THREE from 'three';

/**
 * Procedural skyboxes.
 *
 * Every circuit draws one of five skies from its seed, so the same circuit
 * always keeps its sky and a fresh circuit brings a new one with it. The
 * textures are equirectangular canvases: a vertical gradient for the sky, a
 * distant mountain range for depth, and seeded stars, clouds, sun, moon, or
 * aurora depending on the time of day.
 */
export type SkyboxId = 'dawn' | 'noon' | 'sunset' | 'night' | 'aurora';

interface SkySun {
  readonly color: string;
  readonly glow: string;
  /** Degrees above the horizon. */
  readonly elevation: number;
  /** Radius as a fraction of the texture height. */
  readonly size: number;
}

export interface SkyboxStyle {
  readonly id: SkyboxId;
  readonly name: string;
  /** Fog colour that lets the far skyline dissolve into the horizon. */
  readonly fog: number;
  readonly zenith: string;
  readonly upper: string;
  readonly horizon: string;
  readonly haze: string;
  readonly ground: string;
  readonly star: string;
  readonly starDensity: number;
  readonly cloud: readonly [string, string];
  readonly cloudCount: number;
  /** Far, middle, and near mountain silhouettes. */
  readonly mountains: readonly [string, string, string];
  readonly sun?: SkySun;
  readonly moon: boolean;
  readonly aurora: boolean;
  readonly milkyWay: boolean;
  readonly birds: number;
  /** Warm glow of a distant city, above the horizon. */
  readonly cityGlow?: string;
}

export const SKYBOX_STYLES: readonly SkyboxStyle[] = [
  {
    id: 'dawn',
    name: 'Dawn haze',
    fog: 0x8d7f95,
    zenith: '#303b78',
    upper: '#8b6ca6',
    horizon: '#ffb27a',
    haze: '#ffd8b4',
    ground: '#2a2036',
    star: '#f2ecff',
    starDensity: 0.06,
    cloud: ['#ffe2cc', '#a88da8'],
    cloudCount: 11,
    mountains: ['#786384', '#4d3d60', '#2b233c'],
    sun: { color: '#fff1cd', glow: '#ff9f65', elevation: 9, size: 0.042 },
    moon: false,
    aurora: false,
    milkyWay: false,
    birds: 3,
  },
  {
    id: 'noon',
    name: 'High noon',
    fog: 0xa8c9e5,
    zenith: '#1769c7',
    upper: '#4a9de8',
    horizon: '#d2ebff',
    haze: '#edf8ff',
    ground: '#29443b',
    star: '#ffffff',
    starDensity: 0,
    cloud: ['#ffffff', '#b8c8d8'],
    cloudCount: 13,
    mountains: ['#86a8b1', '#5b807d', '#36564c'],
    sun: { color: '#fffbe0', glow: '#fff2b8', elevation: 48, size: 0.03 },
    moon: false,
    aurora: false,
    milkyWay: false,
    birds: 5,
  },
  {
    id: 'sunset',
    name: 'Ember sunset',
    fog: 0xa6605d,
    zenith: '#2a1a4f',
    upper: '#8a3d68',
    horizon: '#ff8b4c',
    haze: '#ffb775',
    ground: '#2c1622',
    star: '#ffe8ff',
    starDensity: 0.14,
    cloud: ['#ffb17c', '#6f3652'],
    cloudCount: 12,
    mountains: ['#8c4863', '#5b2c45', '#2f1728'],
    sun: { color: '#fff2bc', glow: '#ff6338', elevation: 5, size: 0.07 },
    moon: false,
    aurora: false,
    milkyWay: false,
    birds: 2,
  },
  {
    id: 'night',
    name: 'City night',
    fog: 0x172135,
    zenith: '#040611',
    upper: '#0b132b',
    horizon: '#273450',
    haze: '#3a4b6b',
    ground: '#070a13',
    star: '#dde9ff',
    starDensity: 1,
    cloud: ['#4c5b76', '#1b2335'],
    cloudCount: 5,
    mountains: ['#1b2639', '#121a29', '#090e18'],
    moon: true,
    aurora: false,
    milkyWay: true,
    birds: 0,
    cityGlow: '#ffb46b',
  },
  {
    id: 'aurora',
    name: 'Aurora night',
    fog: 0x18323b,
    zenith: '#050a18',
    upper: '#0b1a2d',
    horizon: '#1d3d46',
    haze: '#2e5c62',
    ground: '#070c12',
    star: '#d8ecff',
    starDensity: 0.72,
    cloud: ['#5b7085', '#1a2635'],
    cloudCount: 4,
    mountains: ['#2d4a55', '#1b313a', '#0c171d'],
    moon: false,
    aurora: true,
    milkyWay: false,
    birds: 0,
  },
];

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;
const HORIZON = TEXTURE_HEIGHT / 2;

export interface Skybox {
  readonly id: SkyboxId;
  readonly name: string;
  /** Colour for `scene.fog` so the horizon and the distance agree. */
  readonly fog: number;
  readonly texture: THREE.CanvasTexture;
  dispose: () => void;
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

function rgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((part) => part + part)
          .join('')
      : raw;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Paint the sky gradient and the darker ground half of the panorama. */
function paintGradient(ctx: CanvasRenderingContext2D, style: SkyboxStyle): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, style.zenith);
  sky.addColorStop(0.55, style.upper);
  sky.addColorStop(0.9, style.horizon);
  sky.addColorStop(1, style.haze);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, TEXTURE_WIDTH, HORIZON + 1);

  const ground = ctx.createLinearGradient(0, HORIZON, 0, TEXTURE_HEIGHT);
  ground.addColorStop(0, style.ground);
  ground.addColorStop(1, '#02040a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, TEXTURE_WIDTH, TEXTURE_HEIGHT - HORIZON);
}

/** A faint dust lane across the night sky. */
function paintMilkyWay(
  ctx: CanvasRenderingContext2D,
  random: () => number,
): void {
  ctx.save();
  ctx.translate(TEXTURE_WIDTH * 0.52, HORIZON * 0.34);
  ctx.rotate(-0.38);
  const band = HORIZON * 0.16;
  const glow = ctx.createLinearGradient(0, -band, 0, band);
  glow.addColorStop(0, 'rgba(196, 213, 255, 0)');
  glow.addColorStop(0.5, 'rgba(196, 213, 255, 0.1)');
  glow.addColorStop(1, 'rgba(196, 213, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-TEXTURE_WIDTH * 0.6, -band, TEXTURE_WIDTH * 1.2, band * 2);
  for (let star = 0; star < 220; star += 1) {
    const x = (random() - 0.5) * TEXTURE_WIDTH * 1.2;
    const y = (random() - 0.5) * band * 1.4;
    ctx.fillStyle = rgba('#e7efff', 0.12 + random() * 0.3);
    ctx.beginPath();
    ctx.arc(x, y, 0.4 + random() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Stars are repeated across the seam so the panorama wraps cleanly. */
function paintStars(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  style: SkyboxStyle,
): void {
  const count = Math.round(style.starDensity * 700);
  for (let index = 0; index < count; index += 1) {
    const x = random() * TEXTURE_WIDTH;
    const y = random() * HORIZON * 0.9;
    const big = random() < 0.08;
    const radius = big ? 1.5 + random() * 1.4 : 0.5 + random() * 1.1;
    const alpha = 0.3 + random() * 0.7;
    for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
      if (big) {
        ctx.fillStyle = rgba(style.star, alpha * 0.2);
        ctx.beginPath();
        ctx.arc(x + offset, y, radius * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(style.star, alpha);
      ctx.beginPath();
      ctx.arc(x + offset, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Wavy, translucent curtains for the polar night. */
function paintAurora(
  ctx: CanvasRenderingContext2D,
  random: () => number,
): void {
  const bands = [
    { height: 0.24, amplitude: 0.035, thickness: 0.1, color: '#3dffb4' },
    { height: 0.4, amplitude: 0.045, thickness: 0.075, color: '#42d9ff' },
    { height: 0.56, amplitude: 0.04, thickness: 0.055, color: '#b46bff' },
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  bands.forEach((band, bandIndex) => {
    const center = HORIZON * band.height;
    const amplitude = HORIZON * band.amplitude;
    const thickness = HORIZON * band.thickness;
    const phase = random() * Math.PI * 2;
    const gradient = ctx.createLinearGradient(
      0,
      center - thickness * 1.6,
      0,
      center + thickness * 1.6,
    );
    gradient.addColorStop(0, rgba(band.color, 0));
    gradient.addColorStop(0.5, rgba(band.color, 1));
    gradient.addColorStop(1, rgba(band.color, 0));
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    for (const pass of [
      { alpha: 0.16, width: 1.9, drift: 0 },
      { alpha: 0.3, width: 1, drift: 0.2 },
    ]) {
      ctx.globalAlpha = pass.alpha;
      ctx.lineWidth = thickness * pass.width;
      ctx.beginPath();
      for (let x = 0; x <= TEXTURE_WIDTH; x += 8) {
        const t = (x / TEXTURE_WIDTH) * Math.PI * 2;
        const y =
          center +
          Math.sin(t * (2 + bandIndex) + phase) * amplitude +
          Math.sin(t * (5 + bandIndex) + phase * 1.7) * amplitude * 0.35 +
          Math.cos(t * 3 + phase * 0.6) * amplitude * pass.drift;
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  });
  // Fine vertical rays give the curtains their streaky texture.
  const rays = Array.from({ length: 34 }, () => ({
    x: random() * TEXTURE_WIDTH,
    top: HORIZON * (0.14 + random() * 0.34),
    length: HORIZON * (0.04 + random() * 0.11),
    tint: bands[Math.floor(random() * bands.length)]!.color,
    width: 0.6 + random() * 1.6,
    bend: (random() - 0.5) * 8,
  }));
  for (const ray of rays) {
    const gradient = ctx.createLinearGradient(
      0,
      ray.top,
      0,
      ray.top + ray.length,
    );
    gradient.addColorStop(0, rgba(ray.tint, 0));
    gradient.addColorStop(0.45, rgba(ray.tint, 0.22));
    gradient.addColorStop(1, rgba(ray.tint, 0));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = ray.width;
    for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
      ctx.beginPath();
      ctx.moveTo(ray.x + offset, ray.top);
      ctx.lineTo(ray.x + offset + ray.bend, ray.top + ray.length);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Warm light pollution along the horizon, under the city silhouette. */
function paintCityGlow(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  color: string,
): void {
  const glow = ctx.createLinearGradient(0, HORIZON - HORIZON * 0.24, 0, HORIZON);
  glow.addColorStop(0, rgba(color, 0));
  glow.addColorStop(1, rgba(color, 0.3));
  ctx.fillStyle = glow;
  ctx.fillRect(0, HORIZON - HORIZON * 0.24, TEXTURE_WIDTH, HORIZON * 0.24);

  const lights = Array.from({ length: 150 }, () => ({
    x: random() * TEXTURE_WIDTH,
    y: HORIZON - random() * HORIZON * 0.045,
    width: 1 + random() * 2,
    height: 0.6 + random() * 1.4,
    alpha: 0.18 + random() * 0.5,
  }));
  for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
    for (const light of lights) {
      ctx.fillStyle = rgba(color, light.alpha);
      ctx.fillRect(
        light.x + offset,
        light.y,
        light.width,
        light.height,
      );
    }
  }
}

function paintSun(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  sun: SkySun,
): void {
  const x = random() * TEXTURE_WIDTH;
  const y = HORIZON - Math.sin(THREE.MathUtils.degToRad(sun.elevation)) * HORIZON * 0.92;
  const radius = TEXTURE_HEIGHT * sun.size;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TEXTURE_WIDTH, HORIZON);
  ctx.clip();
  for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
    const glow = ctx.createRadialGradient(
      x + offset,
      y,
      radius * 0.2,
      x + offset,
      y,
      radius * 8,
    );
    glow.addColorStop(0, rgba(sun.glow, 0.55));
    glow.addColorStop(0.2, rgba(sun.glow, 0.28));
    glow.addColorStop(0.55, rgba(sun.glow, 0.08));
    glow.addColorStop(1, rgba(sun.glow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + offset, y, radius * 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = sun.color;
    ctx.beginPath();
    ctx.arc(x + offset, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x + offset, y, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintMoon(ctx: CanvasRenderingContext2D, random: () => number): void {
  const x = random() * TEXTURE_WIDTH;
  const y = HORIZON * (0.16 + random() * 0.2);
  const radius = TEXTURE_HEIGHT * 0.032;
  const craters = Array.from({ length: 4 }, () => ({
    x: (random() - 0.5) * radius * 1.2,
    y: (random() - 0.5) * radius * 1.2,
    radius: radius * (0.14 + random() * 0.14),
  }));
  for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
    const glow = ctx.createRadialGradient(
      x + offset,
      y,
      radius * 0.6,
      x + offset,
      y,
      radius * 6,
    );
    glow.addColorStop(0, 'rgba(205, 226, 255, 0.28)');
    glow.addColorStop(1, 'rgba(205, 226, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + offset, y, radius * 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgb(232, 241, 255)';
    ctx.beginPath();
    ctx.arc(x + offset, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150, 174, 210, 0.28)';
    for (const crater of craters) {
      ctx.beginPath();
      ctx.arc(
        x + offset + crater.x,
        y + crater.y,
        crater.radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function paintCloud(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  style: SkyboxStyle,
  random: () => number,
): void {
  const blobs = Array.from({ length: 3 + Math.floor(random() * 4) }, () => ({
    x: (random() - 0.5) * scale * 4,
    y: (random() - 0.5) * scale * 0.7,
    radius: scale * (0.7 + random() * 0.9),
  }));
  // Shadow first, lit tops second: the overlap reads as a cumulus body.
  for (const layer of [
    { color: style.cloud[1], offset: scale * 0.45, alpha: 0.3 },
    { color: style.cloud[0], offset: -scale * 0.12, alpha: 0.42 },
  ]) {
    for (const blob of blobs) {
      const bx = x + blob.x;
      const by = y + layer.offset + blob.y;
      const gradient = ctx.createRadialGradient(
        bx,
        by,
        0,
        bx,
        by,
        blob.radius,
      );
      gradient.addColorStop(0, rgba(layer.color, layer.alpha));
      gradient.addColorStop(0.6, rgba(layer.color, layer.alpha * 0.4));
      gradient.addColorStop(1, rgba(layer.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bx, by, blob.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintClouds(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  style: SkyboxStyle,
): void {
  for (let cloud = 0; cloud < style.cloudCount; cloud += 1) {
    const x = random() * TEXTURE_WIDTH;
    const y = TEXTURE_HEIGHT * (0.06 + random() * 0.33);
    const scale = TEXTURE_HEIGHT * (0.018 + random() * 0.03);
    for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
      paintCloud(ctx, x + offset, y, scale, style, random);
    }
  }
}

function paintBirds(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  groups: number,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(20, 34, 48, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let group = 0; group < groups; group += 1) {
    const x = random() * TEXTURE_WIDTH;
    const y = TEXTURE_HEIGHT * (0.13 + random() * 0.2);
    const size = 5 + random() * 6;
    const flock = Array.from({ length: 4 }, (_, bird) => ({
      x: (bird - 1.5) * size * 1.7,
      y: (random() - 0.5) * size,
    }));
    for (const offset of [0, -TEXTURE_WIDTH, TEXTURE_WIDTH]) {
      for (const bird of flock) {
        const bx = x + offset + bird.x;
        const by = y + bird.y;
        ctx.beginPath();
        ctx.moveTo(bx - size, by);
        ctx.quadraticCurveTo(bx - size * 0.35, by - size * 0.7, bx, by);
        ctx.quadraticCurveTo(bx + size * 0.35, by - size * 0.7, bx + size, by);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** One seamless ridge line, filled to the bottom of the panorama. */
function paintRidge(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  color: string,
  rim: string,
  base: number,
  amplitude: number,
): void {
  const phases = Array.from({ length: 5 }, () => random() * Math.PI * 2);
  const weights = [1, 0.55, 0.32, 0.2, 0.12];
  const normalizer = weights.reduce((total, weight) => total + weight, 0);
  const ridgeAt = (x: number): number => {
    const t = (x / TEXTURE_WIDTH) * Math.PI * 2;
    let noise = 0;
    for (let harmonic = 0; harmonic < weights.length; harmonic += 1) {
      noise +=
        Math.sin(t * (harmonic + 1) + phases[harmonic]!) * weights[harmonic]!;
    }
    const normalized = 0.5 + 0.5 * (noise / normalizer);
    return base - amplitude * (0.25 + 0.75 * normalized);
  };

  ctx.beginPath();
  ctx.moveTo(0, TEXTURE_HEIGHT);
  for (let x = 0; x <= TEXTURE_WIDTH; x += 6) {
    ctx.lineTo(x, ridgeAt(x));
  }
  ctx.lineTo(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // A thin atmospheric rim on the ridge, as if lit by the sky behind it.
  ctx.beginPath();
  for (let x = 0; x <= TEXTURE_WIDTH; x += 6) {
    const y = ridgeAt(x);
    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function paintMountains(
  ctx: CanvasRenderingContext2D,
  random: () => number,
  style: SkyboxStyle,
): void {
  const layers = [
    { color: style.mountains[0], amplitude: HORIZON * 0.075, base: HORIZON * 1.01 },
    { color: style.mountains[1], amplitude: HORIZON * 0.11, base: HORIZON * 1.03 },
    { color: style.mountains[2], amplitude: HORIZON * 0.16, base: HORIZON * 1.05 },
  ];
  layers.forEach((layer, index) => {
    paintRidge(
      ctx,
      random,
      layer.color,
      rgba(style.haze, 0.22 - index * 0.05),
      layer.base,
      layer.amplitude,
    );
    // A band of haze in front of each farther range.
    if (index < layers.length - 1) {
      const haze = ctx.createLinearGradient(
        0,
        HORIZON - HORIZON * 0.08,
        0,
        HORIZON + HORIZON * 0.02,
      );
      haze.addColorStop(0, rgba(style.haze, 0));
      haze.addColorStop(0.75, rgba(style.haze, 0.14));
      haze.addColorStop(1, rgba(style.haze, 0));
      ctx.fillStyle = haze;
      ctx.fillRect(0, HORIZON - HORIZON * 0.08, TEXTURE_WIDTH, HORIZON * 0.1);
    }
  });
}

function paintHorizonHaze(
  ctx: CanvasRenderingContext2D,
  style: SkyboxStyle,
): void {
  const haze = ctx.createLinearGradient(
    0,
    HORIZON - HORIZON * 0.06,
    0,
    HORIZON + HORIZON * 0.03,
  );
  haze.addColorStop(0, rgba(style.haze, 0));
  haze.addColorStop(0.7, rgba(style.haze, 0.2));
  haze.addColorStop(1, rgba(style.haze, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, HORIZON - HORIZON * 0.06, TEXTURE_WIDTH, HORIZON * 0.09);
}

/** Build the equirectangular sky texture for `seed`. */
export function buildSkybox(seed: string): Skybox {
  const style = skyboxStyleForSeed(seed);
  const random = seededRandom(`${seed}:skybox-paint`);
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }

  paintGradient(ctx, style);
  if (style.milkyWay) {
    paintMilkyWay(ctx, random);
  }
  if (style.starDensity > 0) {
    paintStars(ctx, random, style);
  }
  if (style.aurora) {
    paintAurora(ctx, random);
  }
  if (style.cityGlow) {
    paintCityGlow(ctx, random, style.cityGlow);
  }
  if (style.sun) {
    paintSun(ctx, random, style.sun);
  }
  if (style.moon) {
    paintMoon(ctx, random);
  }
  paintClouds(ctx, random, style);
  if (style.birds > 0) {
    paintBirds(ctx, random, style.birds);
  }
  paintMountains(ctx, random, style);
  paintHorizonHaze(ctx, style);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;

  return {
    id: style.id,
    name: style.name,
    fog: style.fog,
    texture,
    dispose: () => texture.dispose(),
  };
}
