/**
 * Generates the PWA icons from code so the repository never depends on a
 * binary asset being edited by hand.
 *
 *   npm run icons
 *
 * Output: public/icons/*.png and public/apple-touch-icon.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const SS = 4;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'public/icons');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'latin1');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour + alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (stride + 1);
    raw[offset] = 0; // no filter
    for (let x = 0; x < stride; x += 1) {
      raw[offset + 1 + x] = rgba[y * stride + x];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

class Raster {
  constructor(size) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 4);
  }

  setPixel(x, y, r, g, b, a) {
    const index = (y * this.size + x) * 4;
    this.data[index] = r;
    this.data[index + 1] = g;
    this.data[index + 2] = b;
    this.data[index + 3] = a;
  }

  /** Add light on top of the existing pixel (used for the glow). */
  addPixel(x, y, r, g, b, alpha) {
    const index = (y * this.size + x) * 4;
    const a = clamp01(alpha);
    this.data[index] = mix(this.data[index], 255, a * (r / 255));
    this.data[index + 1] = mix(this.data[index + 1], 255, a * (g / 255));
    this.data[index + 2] = mix(this.data[index + 2], 255, a * (b / 255));
  }

  fillRoundRect(x0, y0, x1, y1, radius, colorAt) {
    const startX = Math.max(0, Math.floor(x0));
    const endX = Math.min(this.size - 1, Math.ceil(x1));
    const startY = Math.max(0, Math.floor(y0));
    const endY = Math.min(this.size - 1, Math.ceil(y1));
    const innerX0 = x0 + radius;
    const innerX1 = x1 - radius;
    const innerY0 = y0 + radius;
    const innerY1 = y1 - radius;

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const nearestX = Math.min(innerX1, Math.max(innerX0, x));
        const nearestY = Math.min(innerY1, Math.max(innerY0, y));
        const dx = x - nearestX;
        const dy = y - nearestY;
        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          continue;
        }
        const color = colorAt(
          clamp01((x - x0) / Math.max(1, x1 - x0)),
          clamp01((y - y0) / Math.max(1, y1 - y0)),
        );
        this.setPixel(x, y, color[0], color[1], color[2], color[3] ?? 255);
      }
    }
  }

  downsample(factor) {
    const target = this.size / factor;
    const out = new Uint8ClampedArray(target * target * 4);
    for (let y = 0; y < target; y += 1) {
      for (let x = 0; x < target; x += 1) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < factor; sy += 1) {
          for (let sx = 0; sx < factor; sx += 1) {
            const index =
              ((y * factor + sy) * this.size + (x * factor + sx)) * 4;
            r += this.data[index];
            g += this.data[index + 1];
            b += this.data[index + 2];
            a += this.data[index + 3];
          }
        }
        const count = factor * factor;
        const outIndex = (y * target + x) * 4;
        out[outIndex] = r / count;
        out[outIndex + 1] = g / count;
        out[outIndex + 2] = b / count;
        out[outIndex + 3] = a / count;
      }
    }
    return out;
  }
}

function renderIcon(logicalSize, { maskable = false } = {}) {
  const size = logicalSize * SS;
  const raster = new Raster(size);
  const scale = maskable ? 0.76 : 0.92;
  const mapX = (value) => (0.5 + (value - 0.5) * scale) * size;
  const mapY = (value) => (0.5 + (value - 0.5) * scale) * size;
  const mapLength = (value) => value * scale * size;

  // Background: deep navy with a cyan bloom behind the car.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = y / size;
      let r = mix(5, 12, v);
      let g = mix(12, 30, v);
      let b = mix(22, 46, v);
      const dx = (x / size - 0.5) * 1.7;
      const dy = (y / size - 0.44) * 1.7;
      const glow = Math.exp(-(dx * dx + dy * dy) * 5.5);
      r += glow * 4;
      g += glow * 44;
      b += glow * 54;
      raster.setPixel(x, y, r, g, b, 255);
    }
  }

  // Road edge accents.
  const accent = (x) => [34, 211, 238, 40];
  raster.fillRoundRect(
    mapX(0.075),
    mapY(0.1),
    mapX(0.105),
    mapY(0.9),
    mapLength(0.015),
    accent,
  );
  raster.fillRoundRect(
    mapX(0.895),
    mapY(0.1),
    mapX(0.925),
    mapY(0.9),
    mapLength(0.015),
    accent,
  );

  // Wheels.
  const wheel = () => [9, 14, 21, 255];
  for (const [x0, y0, x1, y1] of [
    [0.17, 0.29, 0.3, 0.43],
    [0.7, 0.29, 0.83, 0.43],
    [0.17, 0.57, 0.3, 0.71],
    [0.7, 0.57, 0.83, 0.71],
  ]) {
    raster.fillRoundRect(
      mapX(x0),
      mapY(y0),
      mapX(x1),
      mapY(y1),
      mapLength(0.028),
      wheel,
    );
  }

  // Body with a vertical cyan gradient.
  raster.fillRoundRect(
    mapX(0.27),
    mapY(0.15),
    mapX(0.73),
    mapY(0.85),
    mapLength(0.11),
    (_u, v) => [
      Math.round(mix(120, 14, v)),
      Math.round(mix(240, 165, v)),
      Math.round(mix(255, 199, v)),
      255,
    ],
  );

  // Windshield and rear window.
  const glass = () => [6, 20, 32, 255];
  raster.fillRoundRect(
    mapX(0.345),
    mapY(0.28),
    mapX(0.655),
    mapY(0.44),
    mapLength(0.035),
    glass,
  );
  raster.fillRoundRect(
    mapX(0.355),
    mapY(0.6),
    mapX(0.645),
    mapY(0.69),
    mapLength(0.028),
    glass,
  );

  // Roof strip.
  raster.fillRoundRect(
    mapX(0.465),
    mapY(0.47),
    mapX(0.535),
    mapY(0.57),
    mapLength(0.014),
    () => [220, 252, 255, 210],
  );

  // Headlights and tail lights.
  raster.fillRoundRect(
    mapX(0.315),
    mapY(0.17),
    mapX(0.44),
    mapY(0.205),
    mapLength(0.012),
    () => [255, 249, 219, 255],
  );
  raster.fillRoundRect(
    mapX(0.56),
    mapY(0.17),
    mapX(0.685),
    mapY(0.205),
    mapLength(0.012),
    () => [255, 249, 219, 255],
  );
  raster.fillRoundRect(
    mapX(0.32),
    mapY(0.795),
    mapX(0.44),
    mapY(0.828),
    mapLength(0.01),
    () => [255, 66, 96, 255],
  );
  raster.fillRoundRect(
    mapX(0.56),
    mapY(0.795),
    mapX(0.68),
    mapY(0.828),
    mapLength(0.01),
    () => [255, 66, 96, 255],
  );

  return raster.downsample(SS);
}

const outputs = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const output of outputs) {
  const rgba = renderIcon(output.size, { maskable: output.maskable });
  const png = encodePng(output.size, output.size, rgba);
  writeFileSync(resolve(OUT_DIR, output.file), png);
  console.log(`wrote public/icons/${output.file} (${png.length} bytes)`);
}

const touch = renderIcon(180, { maskable: true });
const touchPng = encodePng(180, 180, touch);
writeFileSync(resolve(ROOT, 'public/apple-touch-icon.png'), touchPng);
console.log(`wrote public/apple-touch-icon.png (${touchPng.length} bytes)`);
