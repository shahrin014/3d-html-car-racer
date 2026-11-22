import * as THREE from 'three';
import {
  createCar as createRuntimeCar,
  preloadCarModel,
} from '../../src/game/car-runtime.mjs';

/**
 * Preview entry point for the car and the cockpit rig.
 *
 * The car is built by the game's own runtime module from the published assets
 * in public/models, so the catalog render and the car on the track are the
 * same code, the same GLB, and the same transform.
 */

/** Load the game's car assets once, then return a clone for the studio. */
export async function createCar() {
  await preloadCarModel('/public/models/');
  return createRuntimeCar().group;
}

const wheelParts = {
  tyre: new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.92 }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xdfe7f2,
    metalness: 1,
    roughness: 0.16,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xd9a52b,
    metalness: 1,
    roughness: 0.22,
  }),
};

/**
 * Driver's-eye dashboard. A single plane with a generated texture keeps the
 * cockpit cheap; the game uses the same texture and camera offset.
 */
export function createCockpitDashboard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }

  const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backdrop.addColorStop(0, '#0a121d');
  backdrop.addColorStop(1, '#05080d');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < canvas.width; x += 16) {
    for (let y = 0; y < canvas.height; y += 16) {
      ctx.fillRect(x + 2, y + 2, 6, 6);
    }
  }

  const gauge = (cx, cy, radius, label, value, accent) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1824';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#243244';
    ctx.stroke();

    for (let tick = 0; tick <= 10; tick += 1) {
      const angle = Math.PI * 0.78 + (tick / 10) * Math.PI * 1.44;
      const inner = radius - (tick % 5 === 0 ? 16 : 9);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * (radius - 4), Math.sin(angle) * (radius - 4));
      ctx.lineWidth = tick % 5 === 0 ? 3 : 1.5;
      ctx.strokeStyle = tick % 5 === 0 ? '#e6ecf5' : '#5a6c82';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius - 30,
      Math.PI * 0.78,
      Math.PI * 0.78 + Math.PI * 1.44 * value,
      false,
    );
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();

    const needleAngle = Math.PI * 0.78 + Math.PI * 1.44 * value;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(needleAngle) * (radius - 22),
      Math.sin(needleAngle) * (radius - 22),
    );
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff5a3c';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e6ecf5';
    ctx.fill();

    ctx.fillStyle = '#8fa3bb';
    ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, radius - 14);
    ctx.restore();
  };

  gauge(190, 196, 128, 'KM/H', 0.62, '#ffb066');
  gauge(834, 196, 128, 'DAMAGE', 0.18, '#ff4d6d');

  ctx.fillStyle = '#0d1824';
  ctx.fillRect(378, 92, 268, 126);
  ctx.strokeStyle = '#22344a';
  ctx.lineWidth = 3;
  ctx.strokeRect(378, 92, 268, 126);
  ctx.fillStyle = '#ffb066';
  ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LAP 1 / 3', 512, 136);
  ctx.fillStyle = '#d8e5f5';
  ctx.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('02:14.6', 512, 186);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.16, 0.4),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
}

export function createSteeringWheel() {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.024, 12, 40),
    wheelParts.tyre,
  );
  group.add(rim);
  for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.02, 0.03),
      wheelParts.chrome,
    );
    spoke.rotation.z = angle;
    spoke.position.set(Math.cos(angle) * 0.07, Math.sin(angle) * 0.07, 0);
    group.add(spoke);
  }
  const badge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.018, 16),
    wheelParts.gold,
  );
  badge.rotation.x = Math.PI / 2;
  group.add(badge);
  return group;
}
