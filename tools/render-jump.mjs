/**
 * Rasterize the jump obstacle render to PNG (and also write SVGs).
 * Depends only on node:zlib + three (for vectors). See render helper below.
 */
import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import zlib from 'node:zlib';

const TRACK_WIDTH = 7;
const JUMP_HEIGHT = 2.2;
const JUMP_KICKER_LENGTH = 9;
const JUMP_GAP_LENGTH = 9;
const JUMP_LANDING_LENGTH = 26;
const JUMP_LAUNCH_SLOPE = 0.04;
const JUMP_LANDING_HEIGHT = 1.1;
const JUMP_LANDING_WIDTH = TRACK_WIDTH * 2;
const RAIL_HEIGHT = 0.9;

const hermite = (t) => {
  const s2 = t * t;
  const s3 = s2 * t;
  return {
    h00: 2 * s3 - 3 * s2 + 1,
    h01: s3 - 2 * s2 + t,
    h11: s3 - s2,
    d00: 6 * s2 - 6 * t,
    d01: -6 * s2 + 6 * t,
    d11: 3 * s2 - 2 * t,
  };
};

function kickerPath() {
  return (t) => {
    const b = hermite(t);
    const len = JUMP_KICKER_LENGTH;
    const y = b.h01 * JUMP_HEIGHT + b.h11 * (len * JUMP_LAUNCH_SLOPE);
    const dy = (b.d01 * JUMP_HEIGHT + b.d11 * (len * JUMP_LAUNCH_SLOPE)) / len;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return { position: new THREE.Vector3(0, y, len * t), tangent, right,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize() };
  };
}
function gapPath() {
  return (t) => {
    const right = new THREE.Vector3(1, 0, 0);
    return { position: new THREE.Vector3(0, 0, JUMP_GAP_LENGTH * t),
      tangent: new THREE.Vector3(0, 0, 1), right, up: new THREE.Vector3(0, 1, 0) };
  };
}
function landingPath(landingLength, drop) {
  const angle = Math.atan(JUMP_LAUNCH_SLOPE);
  const cosine = Math.cos(angle);
  const slope = JUMP_LAUNCH_SLOPE;
  const lipHeight = JUMP_HEIGHT + JUMP_GAP_LENGTH * Math.sin(angle);
  const start = (JUMP_LANDING_HEIGHT - lipHeight) / cosine;
  const end = -(JUMP_HEIGHT / cosine + (JUMP_GAP_LENGTH + landingLength) * slope) - drop / cosine;
  return (t) => {
    const b = hermite(t);
    const y = b.h00 * start + b.h01 * end + b.h11 * (landingLength * -slope);
    const dy = (b.d00 * start + b.d01 * end + b.d11 * (landingLength * -slope)) / landingLength;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return { position: new THREE.Vector3(0, y, landingLength * t), tangent, right,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize() };
  };
}
function endFrame(matrix, path) {
  const s = path(1);
  const rotation = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().crossVectors(s.up, s.tangent).normalize(),
    s.up,
    s.tangent,
  );
  return matrix.clone().multiply(rotation.setPosition(s.position));
}
function place(matrix, path, halfW, gap = false) {
  const S = 220;
  const pts = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const s = path(t);
    const p = s.position.clone().applyMatrix4(matrix);
    const r = new THREE.Vector3().crossVectors(s.up, s.tangent).normalize();
    const hw = typeof halfW === 'function' ? halfW(t) : halfW;
    pts.push({ center: p, left: p.clone().addScaledVector(r, -hw),
      right: p.clone().addScaledVector(r, hw), up: s.up.clone(), gap });
  }
  return pts;
}
function landingWidthTaper() {
  const full = JUMP_LANDING_WIDTH / 2;
  const normal = TRACK_WIDTH / 2;
  const eased = (p) => p * p * (3 - 2 * p);
  return (t) => full + (normal - full) * eased(t);
}
function buildModule(drop) {
  const parts = [
    [kickerPath(), TRACK_WIDTH / 2, false],
    [gapPath(), TRACK_WIDTH / 2, true],
    [landingPath(JUMP_LANDING_LENGTH, drop), landingWidthTaper(), false],
  ];
  const ribbon = [];
  let m = new THREE.Matrix4();
  for (const [path, halfW, gap] of parts) {
    ribbon.push(...place(m, path, halfW, gap));
    m = endFrame(m, path);
  }
  return ribbon;
}

// ---------------- projection ----------------
let camPitch = 0.5;
const camYaw = 0.62;
const camDist = 90;
const fScale = 400;
const W = 640;
const H = 480;

function project(p) {
  const cyc = Math.cos(camYaw), syc = Math.sin(camYaw);
  const x1 = p.x * cyc + p.z * syc;
  const z1 = -p.x * syc + p.z * cyc;
  const cxp = Math.cos(camPitch), sxp = Math.sin(camPitch);
  const y1 = p.y * cxp - z1 * sxp;
  const z2 = p.y * sxp + z1 * cxp;
  const scale = fScale / Math.max(1, camDist - z2);
  return { x: x1 * scale, y: -y1 * scale, z: z2 };
}

function fit(polygons) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const poly of polygons) {
    for (const p of poly.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const margin = 40;
  const s = Math.min(
    (W - margin * 2) / Math.max(1, maxX - minX),
    (H - margin * 2) / Math.max(1, maxY - minY),
  );
  const ox = W / 2 - ((minX + maxX) / 2) * s;
  const oy = H / 2 - ((minY + maxY) / 2) * s;
  for (const poly of polygons) {
    for (const p of poly.pts) {
      p.x = p.x * s + ox;
      p.y = p.y * s + oy;
    }
  }
}

// ---------------- rasterizer ----------------
function raster(polygons) {
  const buf = Buffer.alloc(W * H * 4);
  const SKY = [16, 22, 34, 255];
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) {
      const o = (i * W + j) * 4;
      buf[o] = SKY[0]; buf[o + 1] = SKY[1]; buf[o + 2] = SKY[2]; buf[o + 3] = SKY[3];
    }
  }
  // far to near
  for (const poly of polygons) {
    const { pts, fill } = poly;
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const p of pts) {
      minX = Math.min(minX, Math.floor(p.x)); maxX = Math.max(maxX, Math.ceil(p.x));
      minY = Math.min(minY, Math.floor(p.y)); maxY = Math.max(maxY, Math.ceil(p.y));
    }
    minX = Math.max(0, minX); maxX = Math.min(W - 1, maxX);
    minY = Math.max(0, minY); maxY = Math.min(H - 1, maxY);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPoly(x + 0.5, y + 0.5, pts)) {
          const o = (y * W + x) * 4;
          buf[o] = fill[0]; buf[o + 1] = fill[1]; buf[o + 2] = fill[2]; buf[o + 3] = 255;
        }
      }
    }
  }
  return buf;
}
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function shade(v, base) {
  const b = Math.max(0.3, Math.min(1, v));
  return [Math.round(base[0] * b), Math.round(base[1] * b), Math.round(base[2] * b)];
}
const DECK_BASE = [255, 122, 24];    // orange
const RAIL_BASE = [198, 206, 219];   // light

function buildPolygons(ribbon) {
  const polys = [];
  const FLIGHT = [0, 190, 220]; // cyan dashed hint for the airborne arc
  for (let i = 0; i < ribbon.length - 1; i++) {
    const a = ribbon[i], b = ribbon[i + 1];
    const emptyGap = a.gap && b.gap;
    if (emptyGap) {
      // No deck, no rails across the gap: leave it as clear empty space. A thin
      // centred strip hints at the jump line so the intended arc still reads.
      const p1 = project(a.center), p2 = project(b.center);
      const w = 0.35;
      const c1 = a.center.clone(); const c2 = b.center.clone();
      const dir = c2.clone().sub(c1); const r = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const q1 = project(c1.clone().addScaledVector(r, w));
      const q2 = project(c1.clone().addScaledVector(r, -w));
      const q3 = project(c2.clone().addScaledVector(r, -w));
      const q4 = project(c2.clone().addScaledVector(r, w));
      polys.push({ pts: [q1, q2, q3, q4], z: (q1.z + q4.z) / 2, fill: FLIGHT });
      continue;
    }
    const p1 = project(a.right), p2 = project(a.left), p3 = project(b.left), p4 = project(b.right);
    polys.push({ pts: [p1, p2, p3, p4], z: (p1.z + p4.z) / 2, fill: shade(0.85, DECK_BASE) });
    for (const [ea, eb] of [[a.left, b.left], [a.right, b.right]]) {
      const tA = ea.clone().addScaledVector(a.up, RAIL_HEIGHT);
      const tB = eb.clone().addScaledVector(b.up, RAIL_HEIGHT);
      const r1 = project(tA), r2 = project(tB), r3 = project(eb), r4 = project(ea);
      polys.push({ pts: [r1, r2, r3, r4], z: (r1.z + r3.z) / 2, fill: shade(0.95, RAIL_BASE) });
    }
  }
  polys.sort((p, q) => q.z - p.z);
  return polys;
}

// ---------------- PNG encoder ----------------
function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[12] = 0; // 8-bit RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filter none
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('../renders', import.meta.url).pathname, { recursive: true });

function renderAll(name, drop, pitch, title) {
  camPitch = pitch;
  const ribbon = buildModule(drop);
  const polys = buildPolygons(ribbon);
  fit(polys);
  const png = encodePng(W, H, raster(polys));
  writeFileSync(new URL(`../renders/${name}.png`, import.meta.url), png);
  console.log(`wrote renders/${name}.png  (title: ${title})`);
}

renderAll('jump-flat', 0, 1.05, 'Long jump: kicker 9m · gap 9m · landing 26m (2x wide, tapers out)');
renderAll('jump-down', 8, 0.95, 'Downhill jump: high kicker, gap, wide landing 8m lower (tapers out)');