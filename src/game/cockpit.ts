import * as THREE from 'three';

/**
 * Driver's-eye cockpit overlay.
 *
 * The cockpit is drawn in camera space rather than car space. The camera rig
 * already rides the body through banks and loops, so an interior parented to
 * the camera stays locked to the driver's view with no per-frame transform,
 * and the exterior shell can stay hidden while it is shown.
 *
 * Both surfaces are generated canvas textures: a wide, soft-edged dashboard
 * across the lower view and a separate steering-wheel texture on a plane in
 * front of it. Keeping the wheel separate is what lets it turn under the
 * steering input without smearing the dashboard behind it.
 */

/** Largest visual rotation of the wheel at full lock, in radians. */
export const COCKPIT_WHEEL_MAX_ANGLE = Math.PI / 2;
/** How quickly the drawn wheel follows the steering target, per second. */
export const COCKPIT_WHEEL_RESPONSE = 16;

/** Depth of the dashboard plane in front of the camera, in metres. */
export const COCKPIT_DASH_DEPTH = 0.78;
/** Depth of the steering wheel, closer than the dashboard. */
export const COCKPIT_WHEEL_DEPTH = 0.5;
/** Width of the dashboard plane before it is stretched to a wide viewport. */
const DASH_WIDTH = 2.5;

/**
 * Wheel rotation for a steering input in [-1, 1]. Positive steer is the
 * driver's right, which turns the wheel clockwise: negative about the camera's
 * forward axis, where +Z points back toward the driver.
 */
export function steeringWheelAngle(steer: number): number {
  const clamped = THREE.MathUtils.clamp(steer, -1, 1);
  // Avoid returning negative zero at centre; a dead-ahead wheel is exact.
  return clamped === 0 ? 0 : -clamped * COCKPIT_WHEEL_MAX_ANGLE;
}

export interface Cockpit {
  /** Camera-space group; add it to the camera, not the car. */
  group: THREE.Group;
  setVisible: (visible: boolean) => void;
  /** Follow a steering input in [-1, 1] for `delta` seconds. */
  turn: (steer: number, delta: number) => void;
  /** Stretch the dashboard so it reaches both edges of a wide viewport. */
  resize: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

/**
 * Build the dashboard and steering wheel. Textures are generated here so the
 * cockpit ships no binary art and can be re-styled from one file.
 */
export function createCockpit(): Cockpit {
  const group = new THREE.Group();
  group.name = 'cockpit';
  group.visible = false;

  const dashboard = new THREE.Mesh(
    new THREE.PlaneGeometry(DASH_WIDTH, 0.45),
    cockpitMaterial(dashboardTexture()),
  );
  dashboard.name = 'dashboard';
  // The plane is sized to the lower band of the view at this depth, so the
  // whole dashboard is visible instead of being clipped by the near plane.
  // It leans back a touch so the leading edge recedes like a real scuttle.
  dashboard.position.set(0, -0.34, -COCKPIT_DASH_DEPTH);
  dashboard.rotation.x = -0.08;
  dashboard.renderOrder = 10;
  group.add(dashboard);

  const pivot = new THREE.Group();
  pivot.position.set(0, -0.3, -COCKPIT_WHEEL_DEPTH);
  // Steering wheels lean away at the top; spinning the inner mesh about its
  // own normal keeps the rim turning flat instead of wobbling.
  pivot.rotation.x = -0.24;
  group.add(pivot);

  const wheel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    cockpitMaterial(steeringWheelTexture()),
  );
  wheel.name = 'steering-wheel';
  wheel.renderOrder = 11;
  pivot.add(wheel);

  let angle = 0;

  return {
    group,
    setVisible: (visible) => {
      group.visible = visible;
    },
    turn: (steer, delta) => {
      const target = steeringWheelAngle(steer);
      angle = THREE.MathUtils.damp(angle, target, COCKPIT_WHEEL_RESPONSE, delta);
      wheel.rotation.z = angle;
    },
    resize: (camera) => {
      const visibleHeight =
        2 *
        Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) *
        COCKPIT_DASH_DEPTH;
      const visibleWidth = visibleHeight * camera.aspect;
      dashboard.scale.x = Math.max(1, visibleWidth / DASH_WIDTH);
    },
    dispose: () => {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.geometry.dispose();
        const material = object.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.map?.dispose();
          material.dispose();
        }
      });
      group.removeFromParent();
    },
  };
}

/**
 * An overlay material: unlit, untonemapped, and always drawn in front. The
 * cockpit is a view attachment, so a rail or the car's own shell must never
 * poke through it.
 */
function cockpitMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function canvasTexture(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }
  return { canvas, ctx };
}

function finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Wide dashboard: carbon-trimmed scuttle, an ambient orange edge, vents down
 * both sides, and a central infotainment screen. Telemetry already lives in
 * the DOM HUD, so the screen carries the game mark instead of duplicating it.
 */
function dashboardTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvasTexture(2048, 368);
  const width = canvas.width;
  const height = canvas.height;

  const shell = ctx.createLinearGradient(0, 0, 0, height);
  shell.addColorStop(0, '#1d2837');
  shell.addColorStop(0.35, '#0d141d');
  shell.addColorStop(1, '#05080d');
  ctx.fillStyle = shell;
  ctx.fillRect(0, 0, width, height);

  // Carbon weave, faint enough to read as texture rather than noise.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#9fb4cc';
  for (let x = 0; x < width; x += 28) {
    for (let y = 0; y < height; y += 28) {
      if ((x / 28 + y / 28) % 2 === 0) {
        roundedRect(ctx, x + 3, y + 3, 18, 9, 3);
      } else {
        roundedRect(ctx, x + 8, y + 12, 9, 12, 3);
      }
      ctx.fill();
    }
  }
  ctx.restore();

  // Ambient strip along the leading edge, with a soft bloom above it.
  const glow = ctx.createLinearGradient(0, 0, 0, 84);
  glow.addColorStop(0, 'rgba(255,122,47,0.34)');
  glow.addColorStop(1, 'rgba(255,122,47,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 84);
  ctx.save();
  ctx.shadowColor = '#ff7a2f';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = '#ff8a45';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(width, 10);
  ctx.stroke();
  ctx.restore();

  const vent = (x: number) => {
    ctx.save();
    roundedRect(ctx, x, 86, 200, 220, 24);
    const body = ctx.createLinearGradient(x, 0, x + 200, 0);
    body.addColorStop(0, '#070b11');
    body.addColorStop(0.5, '#182230');
    body.addColorStop(1, '#070b11');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,175,205,0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, x + 20, 104, 160, 184, 16);
    ctx.clip();
    for (let y = 110; y < 286; y += 20) {
      ctx.fillStyle = 'rgba(4,7,11,0.85)';
      ctx.fillRect(x + 20, y, 160, 11);
      ctx.fillStyle = 'rgba(120,145,175,0.18)';
      ctx.fillRect(x + 20, y, 160, 2);
    }
    ctx.restore();
    ctx.restore();
  };
  vent(110);
  vent(width - 310);

  // Centre screen.
  const screenX = 744;
  const screenY = 70;
  const screenW = 560;
  const screenH = 214;
  ctx.save();
  ctx.shadowColor = 'rgba(34,211,238,0.35)';
  ctx.shadowBlur = 30;
  roundedRect(ctx, screenX - 12, screenY - 12, screenW + 24, screenH + 24, 30);
  ctx.fillStyle = '#070b11';
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, screenX, screenY, screenW, screenH, 22);
  const screen = ctx.createLinearGradient(0, screenY, 0, screenY + screenH);
  screen.addColorStop(0, '#101f30');
  screen.addColorStop(1, '#060b12');
  ctx.fillStyle = screen;
  ctx.fill();

  // Screen content: orange ring mark, wordmark, and an idle status line.
  ctx.save();
  ctx.translate(screenX + screenW / 2, screenY + 76);
  ctx.strokeStyle = '#ff7a2f';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, 0, 42, Math.PI * 0.15, Math.PI * 1.55);
  ctx.stroke();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 30, Math.PI * 1.7, Math.PI * 2.9);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6eef9';
  ctx.font = '700 42px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('ORANGE LOOP', screenX + screenW / 2, screenY + 148);
  ctx.fillStyle = '#ff8a45';
  ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('RACE SYSTEM READY', screenX + screenW / 2, screenY + 186);

  // Climate dials in the panels beside the screen.
  const dial = (cx: number) => {
    ctx.save();
    ctx.translate(cx, 196);
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    const metal = ctx.createLinearGradient(-40, -40, 40, 40);
    metal.addColorStop(0, '#2b3746');
    metal.addColorStop(0.5, '#0a0f16');
    metal.addColorStop(1, '#25303d');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,185,215,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7a2f';
    ctx.fill();
    ctx.restore();
  };
  dial(486);
  dial(1536);

  // Stitched leather band along the bottom edge.
  const bandY = 302;
  const band = ctx.createLinearGradient(0, bandY, 0, height);
  band.addColorStop(0, '#151c26');
  band.addColorStop(1, '#070a0f');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandY, width, height - bandY);
  ctx.save();
  ctx.setLineDash([18, 16]);
  ctx.strokeStyle = 'rgba(255,122,47,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, bandY + 20);
  ctx.lineTo(width - 40, bandY + 20);
  ctx.stroke();
  ctx.restore();

  // Fade the top edge into the scene instead of ending on a hard rectangle.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, 0, 84);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, 84);
  ctx.globalCompositeOperation = 'source-over';

  return finishTexture(canvas);
}

/**
 * Steering wheel: dark grip with an orange centring stripe, brushed spokes,
 * and a hub badge. Drawn on transparency so the dashboard shows through the
 * open rim.
 */
function steeringWheelTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = canvasTexture(1024, 1024);
  const cx = 512;
  const cy = 512;
  const radius = 388;
  const rim = 72;

  ctx.save();
  ctx.translate(cx, cy);

  // Grip.
  const grip = ctx.createLinearGradient(-radius, -radius, radius, radius);
  grip.addColorStop(0, '#3c4654');
  grip.addColorStop(0.35, '#11161d');
  grip.addColorStop(0.68, '#05080c');
  grip.addColorStop(1, '#2a3340');
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.lineWidth = rim;
  ctx.strokeStyle = grip;
  ctx.stroke();

  // Inner and outer edge highlights give the rim roundness.
  ctx.beginPath();
  ctx.arc(0, 0, radius - rim / 2 + 3, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(170,195,225,0.35)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius + rim / 2 - 3, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.stroke();

  // Orange centring stripe at twelve o'clock.
  ctx.beginPath();
  ctx.arc(0, 0, radius, Math.PI * 1.36, Math.PI * 1.64);
  ctx.lineWidth = rim;
  ctx.strokeStyle = '#ff7a2f';
  ctx.stroke();

  // Spokes at nine, three, and six o'clock.
  const spoke = (angle: number, length: number, width: number) => {
    ctx.save();
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
    gradient.addColorStop(0, '#c9d4e2');
    gradient.addColorStop(0.45, '#5b6878');
    gradient.addColorStop(0.55, '#3a4553');
    gradient.addColorStop(1, '#161c24');
    roundedRect(ctx, 92, -width / 2, length, width, width / 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  };
  spoke(Math.PI, radius - 84, 62);
  spoke(0, radius - 84, 62);
  spoke(Math.PI / 2, radius - 150, 52);

  // Hub.
  ctx.beginPath();
  ctx.arc(0, 0, 126, 0, Math.PI * 2);
  const hub = ctx.createRadialGradient(-28, -34, 12, 0, 0, 140);
  hub.addColorStop(0, '#333f4e');
  hub.addColorStop(0.6, '#0b1016');
  hub.addColorStop(1, '#04070b');
  ctx.fillStyle = hub;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,185,215,0.4)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 74, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0f16';
  ctx.fill();
  ctx.strokeStyle = '#ff7a2f';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#ff8a45';
  ctx.font = '700 48px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OL', 0, 3);

  // Bolts around the hub.
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 100, Math.sin(angle) * 100, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#8e9cad';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 100 - 2, Math.sin(angle) * 100 - 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#dbe5f0';
    ctx.fill();
  }

  // Orange stitching along the inner grip.
  ctx.setLineDash([10, 22]);
  ctx.beginPath();
  ctx.arc(0, 0, radius - rim / 2 + 14, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,122,47,0.7)';
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  return finishTexture(canvas);
}
