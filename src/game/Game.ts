import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar, WHEEL_RADIUS, type Car } from './Car';
import { cockpitPose } from './cockpitCamera';
import {
  BOOST_COOLDOWN,
  BOOST_IMPULSE,
  COUNTDOWN_SECONDS,
  DAMAGE_IMPULSE_FLOOR,
  FIXED_STEP,
  LAPS,
  MAX_DAMAGE,
  MAX_FRAME_DELTA,
  MAX_SUBSTEPS,
  PHYSICS_RIDE_HEIGHT,
  RESCUE_PENALTY_SECONDS,
  RESCUE_SPEED_THRESHOLD,
  RESCUE_STALL_SECONDS,
  TRACK_WIDTH,
} from './constants';
import { createPhysics, type PhysicsHandle } from './physics';
import {
  buildFrames,
  generateCircuit,
  trackLength,
  type TrackFrame,
} from './track';
import { buildTrackMesh, type TrackMesh } from './trackMesh';

export type RaceState = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export type CameraMode = 'chase' | 'cockpit';

export interface RaceSnapshot {
  state: RaceState;
  lap: number;
  lapTime: number;
  totalTime: number;
  speed: number;
  damage: number;
  camera: CameraMode;
}

export interface GameCallbacks {
  onSnapshot: (snapshot: RaceSnapshot) => void;
  onFinish: (totalTime: number, damage: number) => void;
  onPhysicsError?: (message: string) => void;
}

interface BoostZone {
  from: number;
  to: number;
}

const clamp = THREE.MathUtils.clamp;

/** Generated circuit, Rapier rigid-body vehicle, cameras, and race timing. */
export class Game {
  private readonly container: HTMLElement;
  private readonly callbacks: GameCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly car: Car;
  private readonly trackMesh: TrackMesh;
  private readonly frames: TrackFrame[];
  private readonly length: number;
  private readonly boosts: BoostZone[] = [];

  private state: RaceState = 'menu';
  private cameraMode: CameraMode = 'chase';
  private s = 0;
  private speed = 0;
  private steerTarget = 0;
  private damage = 0;
  private lap = 1;
  private lapStart = 0;
  private totalTime = 0;
  private countdownEndsAt = 0;
  private brake = false;
  private boostCooldown = 0;
  private pausedFromCountdown = false;
  private stallTime = 0;
  private lastTime = 0;
  private physics: PhysicsHandle | null = null;
  private pendingPhysics: PhysicsHandle | null = null;
  private physicsLoad: Promise<void> | null = null;
  private physicsFailed = false;
  private physicsAccumulator = 0;
  private lastFrameIndex = 0;
  private wheelSpin = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  /** Reused scratch pose so the cockpit rig allocates nothing per frame. */
  private readonly cockpitPose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly carUp = new THREE.Vector3();
  private readonly chaseDesired = new THREE.Vector3();
  private readonly chaseTarget = new THREE.Vector3();

  constructor(container: HTMLElement, callbacks: GameCallbacks, seed: string) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D race circuit');
    this.renderer.domElement.setAttribute('role', 'img');

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
    this.scene.fog = new THREE.Fog(0x07101a, 60, 220);
    this.scene.background = new THREE.Color(0x07101a);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;

    this.clockLights();
    this.addGround();

    const circuit = generateCircuit(seed, 1);
    this.frames = buildFrames(circuit);
    this.length = trackLength(this.frames);

    const pieces = this.splitPieces(circuit.pieces);
    this.trackMesh = buildTrackMesh(pieces);
    this.scene.add(this.trackMesh.group);

    let distance = 0;
    for (const piece of circuit.pieces) {
      if (piece.boost) {
        this.boosts.push({ from: distance, to: distance + piece.length });
      }
      distance += piece.length;
    }

    this.car = createCar();
    this.scene.add(this.car.group);
    this.placeCar(0, 0);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  get snapshot(): RaceSnapshot {
    return {
      state: this.state,
      lap: this.lap,
      lapTime: this.time - this.lapStart,
      totalTime: this.totalTime,
      speed: this.speed,
      damage: this.damage,
      camera: this.cameraMode,
    };
  }

  private time = 0;

  startRace(): void {
    this.s = 0;
    this.speed = 0;
    this.steerTarget = 0;
    this.damage = 0;
    this.lap = 1;
    this.lapStart = 0;
    this.totalTime = 0;
    this.time = 0;
    this.countdownEndsAt = 0;
    this.stallTime = 0;
    this.boostCooldown = 0;
    this.physicsAccumulator = 0;
    this.lastFrameIndex = 0;
    this.wheelSpin = 0;
    if (this.pendingPhysics) {
      this.physics = this.pendingPhysics;
      this.pendingPhysics = null;
    }
    const first = this.frames[0];
    if (this.physics && first) {
      this.physics.reset(first);
    }
    this.state = 'countdown';
    this.placeCar(0, 0);
    void this.loadPhysics();
    this.report();
  }

  pause(): void {
    if (this.state === 'racing' || this.state === 'countdown') {
      this.pausedFromCountdown = this.state === 'countdown';
      this.state = 'paused';
      this.report();
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = this.pausedFromCountdown ? 'countdown' : 'racing';
      this.lastTime = performance.now();
      this.report();
    }
  }

  toMenu(): void {
    this.state = 'menu';
    this.s = 0;
    this.speed = 0;
    this.damage = 0;
    const first = this.frames[0];
    if (this.physics && first) {
      this.physics.reset(first);
    }
    this.placeCar(0, 0);
    this.report();
  }

  setSteer(value: number): void {
    this.steerTarget = clamp(value, -1, 1);
  }

  setBrake(active: boolean): void {
    this.brake = active;
  }

  toggleCamera(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
    this.report();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.physics?.dispose();
    this.pendingPhysics?.dispose();
    this.trackMesh.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /**
   * Load Rapier on the first Start. The countdown waits for the engine, so the
   * menu stays responsive and the race never begins without physics. A failed
   * load disables Start and reports the problem instead of silently changing
   * the driving model.
   */
  private loadPhysics(): Promise<void> {
    if (this.physics || this.physicsFailed) {
      return Promise.resolve();
    }
    if (this.physicsLoad) {
      return this.physicsLoad;
    }
    this.physicsLoad = createPhysics(this.frames)
      .then((handle) => {
        const first = this.frames[0];
        if (this.state === 'racing' || this.state === 'paused') {
          this.pendingPhysics = handle;
          return;
        }
        this.physics = handle;
        if (first) {
          handle.reset(first);
        }
        this.physicsAccumulator = 0;
        this.lastFrameIndex = 0;
      })
      .catch((error: unknown) => {
        this.physicsFailed = true;
        console.error('Rapier could not start.', error);
        this.state = 'menu';
        this.callbacks.onPhysicsError?.('Physics unavailable');
        this.report();
      });
    return this.physicsLoad;
  }

  private addGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(400, 100, 0x22334a, 0x141d29);
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
  }

  private clockLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9fd6ff, 0x0a1018, 0.9));
    const key = new THREE.DirectionalLight(0xffe3b3, 2.1);
    key.position.set(18, 30, 14);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    rim.position.set(-16, 10, -20);
    this.scene.add(rim);
  }

  private splitPieces(
    pieces: ReturnType<typeof generateCircuit>['pieces'],
  ): { frames: TrackFrame[]; boost?: boolean }[] {
    const grouped: { frames: TrackFrame[]; boost?: boolean }[] = [];
    let offset = 0;
    for (const piece of pieces) {
      const count = Math.max(8, Math.ceil(piece.length / 0.4));
      const frames: TrackFrame[] = [];
      for (let index = 0; index <= count; index += 1) {
        const sample = piece.path(index / count);
        const uprightRight = new THREE.Vector3()
          .crossVectors(sample.up, sample.tangent)
          .normalize();
        const up = sample.up
          .clone()
          .multiplyScalar(Math.cos(sample.bank))
          .addScaledVector(uprightRight, Math.sin(sample.bank))
          .normalize();
        const position = sample.position.clone().applyMatrix4(piece.matrix);
        const tangent = sample.tangent
          .clone()
          .transformDirection(piece.matrix)
          .normalize();
        const upWorld = up.clone().transformDirection(piece.matrix).normalize();
        frames.push({
          position,
          tangent,
          up: upWorld,
          right: new THREE.Vector3().crossVectors(upWorld, tangent).normalize(),
          s: offset + (index / count) * piece.length,
        });
      }
      grouped.push(piece.boost ? { frames, boost: true } : { frames });
      offset += piece.length;
    }
    return grouped;
  }

  private readonly tick = (now: number): void => {
    const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (this.state === 'countdown') {
      if (this.physics) {
        // Start the clock only once the engine is ready. Loading Rapier can
        // block the main thread, and the countdown must neither run during
        // that gap nor restart after it.
        if (this.countdownEndsAt === 0) {
          this.countdownEndsAt = now + COUNTDOWN_SECONDS * 1000;
        } else if (now >= this.countdownEndsAt) {
          this.state = 'racing';
        }
      } else if (this.physicsFailed) {
        this.state = 'menu';
      }
    } else if (this.state === 'racing') {
      this.simulatePhysics(delta);
    }
    this.updateCarVisuals(delta);
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
    this.report();
  };

  private simulatePhysics(delta: number): void {
    const physics = this.physics;
    if (!physics) {
      return;
    }
    this.time += delta;
    this.totalTime += delta;

    const damageScale = 1 - (this.damage / 100) * 0.45;
    const input = {
      throttle: damageScale,
      brake: this.brake,
      steer: this.steerTarget,
    };

    // A fixed step keeps the solver and the loop contact stable regardless of
    // display refresh. A stalled tab may advance by at most MAX_SUBSTEPS.
    this.physicsAccumulator += delta;
    this.physicsAccumulator = Math.min(
      this.physicsAccumulator,
      FIXED_STEP * MAX_SUBSTEPS,
    );
    let steps = 0;
    while (this.physicsAccumulator >= FIXED_STEP && steps < MAX_SUBSTEPS) {
      physics.step(FIXED_STEP, input, this.frameAt(this.s));
      this.physicsAccumulator -= FIXED_STEP;
      steps += 1;
    }

    const state = physics.read();
    this.speed = state.speed;

    const index = this.nearestTrackIndex(state.position);
    const frame = this.frames[index] ?? this.frameAt(this.s);
    this.s = frame.s;

    const impact = physics.takeImpact();
    if (impact > DAMAGE_IMPULSE_FLOOR) {
      this.damage = Math.min(
        MAX_DAMAGE,
        this.damage + Math.min(20, (impact * impact) / 25),
      );
    }

    const count = this.frames.length;
    if (
      this.lastFrameIndex > count * 0.75 &&
      index < count * 0.25 &&
      this.speed > 1
    ) {
      this.lapStart = this.time;
      this.lap += 1;
      if (this.lap > LAPS) {
        this.state = 'finished';
        this.callbacks.onFinish(this.totalTime, this.damage);
        return;
      }
    }
    this.lastFrameIndex = index;

    this.boostCooldown = Math.max(0, this.boostCooldown - delta);
    if (this.boostCooldown === 0) {
      const zone = this.boosts.find(
        (candidate) => this.s >= candidate.from && this.s < candidate.to,
      );
      if (zone) {
        physics.boost(BOOST_IMPULSE);
        this.boostCooldown = BOOST_COOLDOWN;
      }
    }

    this.carUp.set(0, 1, 0).applyQuaternion(state.quaternion);
    const offTrack = state.position.distanceTo(frame.position) > TRACK_WIDTH;
    const inverted = this.carUp.dot(frame.up) < 0.2;
    if (this.speed < RESCUE_SPEED_THRESHOLD || offTrack || inverted) {
      this.stallTime += delta;
      if (this.stallTime > RESCUE_STALL_SECONDS) {
        this.stallTime = 0;
        this.totalTime += RESCUE_PENALTY_SECONDS;
        physics.reset(frame);
        this.s = frame.s;
        this.lastFrameIndex = index;
        this.physicsAccumulator = 0;
      }
    } else {
      this.stallTime = 0;
    }
  }

  private updateCarVisuals(delta: number): void {
    if (this.physics) {
      const state = this.physics.read();
      this.carUp.set(0, 1, 0).applyQuaternion(state.quaternion);
      this.car.group.position
        .copy(state.position)
        .addScaledVector(this.carUp, -PHYSICS_RIDE_HEIGHT);
      this.car.group.quaternion.copy(state.quaternion);
      this.wheelSpin += (this.speed * delta) / WHEEL_RADIUS;
    } else {
      this.placeCar(0, 0);
    }
    for (const wheel of this.car.wheels) {
      wheel.rotation.x = this.wheelSpin;
    }
    this.car.setSteer(this.steerTarget);
  }

  private placeCar(
    distance: number,
    lateral: number,
    frame = this.frameAt(distance),
  ): void {
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral)
      .addScaledVector(frame.up, 0.02);
    this.car.group.position.copy(position);
    const basis = new THREE.Matrix4().makeBasis(
      frame.right,
      frame.up,
      frame.tangent,
    );
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
    if (lateral !== 0) {
      quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          this.steerTarget * 0.28,
        ),
      );
    }
    this.car.group.quaternion.copy(quaternion);
  }

  /**
   * Nearest frame around the last known progress. The circuit's last frame
   * touches the start line, so a global nearest search can jump a whole lap at
   * the grid; this search only wraps once the car is already near the end.
   */
  private nearestTrackIndex(position: THREE.Vector3): number {
    const count = this.frames.length;
    if (count === 0) {
      return 0;
    }
    let best = this.lastFrameIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    const window = 60;
    for (let offset = -2; offset <= window; offset += 1) {
      const candidate = this.lastFrameIndex + offset;
      if (candidate < 0) {
        continue;
      }
      const index = candidate >= count ? candidate - count : candidate;
      const frame = this.frames[index];
      if (!frame) {
        continue;
      }
      const distance = frame.position.distanceToSquared(position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  private frameAt(distance: number): TrackFrame {
    const frames = this.frames;
    const first = frames[0];
    if (!first) {
      throw new Error('Track has no frames');
    }
    const index = clamp(
      Math.round((distance / Math.max(1, this.length)) * (frames.length - 1)),
      0,
      frames.length - 1,
    );
    return frames[index] ?? first;
  }

  private updateCamera(delta: number): void {
    const shake = this.reducedMotion.matches ? 0 : Math.min(0.06, this.speed / 400);
    const position = this.car.group.position;
    const orientation = this.car.group.quaternion;
    if (this.cameraMode === 'chase') {
      this.chaseDesired
        .set(0, 2.8 + shake, -8)
        .applyQuaternion(orientation)
        .add(position);
      this.camera.position.lerp(this.chaseDesired, clamp(delta * 8, 0, 1));
      this.chaseTarget
        .set(0, 1.2, 14)
        .applyQuaternion(orientation)
        .add(position);
      this.carUp.set(0, 1, 0).applyQuaternion(orientation);
      this.camera.up.copy(this.carUp);
      this.camera.lookAt(this.chaseTarget);
    } else {
      // The driver's eye rides the body, not the racing line. Reading the rig
      // off the car is what keeps the view across the track when the car
      // steers off centre, and lets its yaw swing the view into the turn.
      const pose = cockpitPose(
        this.car.group.position,
        this.car.group.quaternion,
        this.cockpitPose,
      );
      this.camera.position.copy(pose.position);
      this.camera.up.copy(pose.up);
      this.camera.lookAt(pose.target);
    }
  }

  private report(): void {
    this.callbacks.onSnapshot(this.snapshot);
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
