import * as THREE from 'three';

/**
 * Die-cast toy car built from shared primitives. This is the catalog model; the
 * game ports the same proportions and materials into `src/game/Car.ts`.
 *
 * Length 2.2 m, width 1.0 m, height 0.7 m. Front faces +Z.
 */

export const CAR = {
  length: 2.2,
  width: 1,
  height: 0.7,
  wheelbase: 1.34,
  rearWheelRadius: 0.36,
  frontWheelRadius: 0.26,
};

const materials = {
  paint: new THREE.MeshStandardMaterial({
    color: 0xc0103f,
    metalness: 0.72,
    roughness: 0.24,
  }),
  paintDark: new THREE.MeshStandardMaterial({
    color: 0x7d0b29,
    metalness: 0.6,
    roughness: 0.32,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xe4ecf7,
    metalness: 1,
    roughness: 0.14,
  }),
  tyre: new THREE.MeshStandardMaterial({
    color: 0x131519,
    roughness: 0.94,
    metalness: 0.05,
  }),
  rim: new THREE.MeshStandardMaterial({
    color: 0xf2b52c,
    metalness: 0.92,
    roughness: 0.28,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x0b1a26,
    metalness: 0.5,
    roughness: 0.08,
  }),
  light: new THREE.MeshStandardMaterial({
    color: 0xfff1c9,
    emissive: 0xffd27a,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  }),
  lampRed: new THREE.MeshStandardMaterial({
    color: 0xff3355,
    emissive: 0xff2244,
    emissiveIntensity: 1.1,
    roughness: 0.4,
  }),
};

/** Stylised flame livery on a transparent canvas. */
export function createFlameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const flames = [
    { x: 30, len: 330, spread: 62, color: '#fff3b0' },
    { x: 10, len: 400, spread: 70, color: '#ffc61a' },
    { x: -10, len: 460, spread: 76, color: '#ff7a18' },
  ];

  for (const flame of flames) {
    ctx.beginPath();
    ctx.moveTo(flame.x, 80);
    ctx.bezierCurveTo(
      flame.x + flame.len * 0.25,
      80 - flame.spread,
      flame.x + flame.len * 0.55,
      80 - flame.spread * 0.4,
      flame.x + flame.len,
      80 - 8,
    );
    ctx.bezierCurveTo(
      flame.x + flame.len * 0.6,
      80 + flame.spread * 0.3,
      flame.x + flame.len * 0.35,
      80 + flame.spread * 0.8,
      flame.x,
      88,
    );
    ctx.closePath();
    ctx.fillStyle = flame.color;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function wheel(radius, width, x, z) {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 24),
    materials.tyre,
  );
  tyre.rotation.z = Math.PI / 2;
  group.add(tyre);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 18),
    materials.rim,
  );
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  for (let spoke = 0; spoke < 5; spoke += 1) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.16, radius * 0.9, radius * 0.16),
      materials.chrome,
    );
    bar.rotation.x = (spoke / 5) * Math.PI;
    group.add(bar);
  }

  group.position.set(x, radius, z);
  return group;
}

export function createCar() {
  const car = new THREE.Group();
  car.name = 'hot-wheels-car';

  // Side profile: low nose, cabin, chopped rear deck.
  const profile = new THREE.Shape();
  profile.moveTo(-1.1, 0.22);
  profile.lineTo(0.98, 0.2);
  profile.lineTo(1.16, 0.3);
  profile.lineTo(0.92, 0.42);
  profile.lineTo(0.32, 0.5);
  profile.lineTo(0.04, 0.76);
  profile.lineTo(-0.6, 0.76);
  profile.lineTo(-0.98, 0.54);
  profile.lineTo(-1.14, 0.4);
  profile.closePath();

  const bodyGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: CAR.width - 0.06,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 3,
    curveSegments: 2,
  });
  // Shape lives in XY; turn length into +Z and centre the extrusion on X.
  bodyGeometry.rotateY(-Math.PI / 2);
  bodyGeometry.translate((CAR.width - 0.06) / 2, 0, 0);
  const body = new THREE.Mesh(bodyGeometry, materials.paint);
  car.add(body);

  // Rocker panel and belly pan.
  const rocker = new THREE.Mesh(
    new THREE.BoxGeometry(CAR.width + 0.02, 0.12, 1.9),
    materials.paintDark,
  );
  rocker.position.set(0, 0.2, -0.05);
  car.add(rocker);

  // Windscreen and side glass.
  const windscreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.24, 0.06),
    materials.glass,
  );
  windscreen.name = 'windscreen';
  windscreen.position.set(0, 0.64, 0.2);
  windscreen.rotation.x = -0.62;
  car.add(windscreen);

  for (const side of [-1, 1]) {
    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.16, 0.5),
      materials.glass,
    );
    sideGlass.name = 'side-glass';
    sideGlass.position.set(side * 0.44, 0.63, -0.22);
    car.add(sideGlass);
  }

  // Exposed chrome engine with intake stacks.
  const engine = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.2, 0.46),
    materials.chrome,
  );
  engine.position.set(0, 0.5, 0.5);
  car.add(engine);

  for (const x of [-0.15, -0.05, 0.05, 0.15]) {
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12),
      materials.chrome,
    );
    stack.name = 'engine-stack';
    stack.position.set(x, 0.66, 0.5);
    car.add(stack);
  }

  // Hood scoop.
  const scoop = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.13, 0.28),
    materials.chrome,
  );
  scoop.position.set(0, 0.6, 0.16);
  scoop.rotation.x = 0.12;
  car.add(scoop);

  // Rear spoiler.
  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.05, 0.24),
    materials.paintDark,
  );
  spoiler.position.set(0, 0.7, -1.02);
  car.add(spoiler);
  for (const x of [-0.34, 0.34]) {
    const strut = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.16, 0.06),
      materials.chrome,
    );
    strut.position.set(x, 0.6, -1.0);
    car.add(strut);
  }

  // Side exhausts and head/tail lights.
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.055, 0.56, 12),
      materials.chrome,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 0.42, 0.3, -0.72);
    car.add(exhaust);

    const headlight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14),
      materials.light,
    );
    headlight.rotation.x = Math.PI / 2;
    headlight.position.set(side * 0.28, 0.36, 1.14);
    car.add(headlight);

    const tailLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.07, 0.03),
      materials.lampRed,
    );
    tailLight.position.set(side * 0.26, 0.44, -1.13);
    car.add(tailLight);
  }

  // Flame livery on both flanks.
  const flameTexture = createFlameTexture();
  const flameMaterial = new THREE.MeshStandardMaterial({
    map: flameTexture,
    transparent: true,
    roughness: 0.35,
    metalness: 0.1,
    depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), flameMaterial);
    decal.position.set(side * (CAR.width / 2 + 0.014), 0.4, -0.12);
    decal.rotation.y = side * (Math.PI / 2);
    car.add(decal);
  }

  // Wheels: oversized at the rear, tucked in at the front.
  car.add(wheel(CAR.rearWheelRadius, 0.32, -0.52, -0.62));
  car.add(wheel(CAR.rearWheelRadius, 0.32, 0.52, -0.62));
  car.add(wheel(CAR.frontWheelRadius, 0.22, -0.52, 0.72));
  car.add(wheel(CAR.frontWheelRadius, 0.22, 0.52, 0.72));

  return car;
}

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
      ctx.strokeStyle = tick % 5 === 0 ? '#c8d7ea' : '#5a6c82';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, radius - 30, Math.PI * 0.78, Math.PI * 0.78 + Math.PI * 1.44 * value, false);
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
    ctx.fillStyle = '#c8d7ea';
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
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0.1 }),
  );
}

export function createSteeringWheel() {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.024, 12, 40),
    materials.tyre,
  );
  group.add(rim);
  for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.02, 0.03),
      materials.chrome,
    );
    spoke.rotation.z = angle;
    spoke.position.set(
      Math.cos(angle) * 0.07,
      Math.sin(angle) * 0.07,
      0,
    );
    group.add(spoke);
  }
  const badge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.018, 16),
    materials.rim,
  );
  badge.rotation.x = Math.PI / 2;
  group.add(badge);
  return group;
}
