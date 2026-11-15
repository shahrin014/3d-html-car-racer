import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar, WHEEL_RADIUS, type Car } from './Car';
import {
  COUNTDOWN_SECONDS,
  LAPS,
  TRACK_WIDTH,
} from './constants';
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
}

interface BoostZone {
  from: number;
  to: number;
}

const clamp = THREE.MathUtils.clamp;

/** Track-constrained dynamics: speed integrates gravity, engine, and damage. */
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
  private lateral = 0;
  private damage = 0;
  private lap = 1;
  private lapStart = 0;
  private totalTime = 0;
  private countdown = COUNTDOWN_SECONDS;
  private brake = false;
  private boostCooldown = 0;
  private stallTime = 0;
  private lastTime = 0;
  private lastLapTopCheck = false;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;

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
    this.lateral = 0;
    this.steerTarget = 0;
    this.damage = 0;
    this.lap = 1;
    this.lapStart = 0;
    this.totalTime = 0;
    this.time = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.stallTime = 0;
    this.boostCooldown = 0;
    this.state = 'countdown';
    this.placeCar(0, 0);
    this.report();
  }

  pause(): void {
    if (this.state === 'racing' || this.state === 'countdown') {
      this.state = 'paused';
      this.report();
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'racing';
      this.lastTime = performance.now();
      this.report();
    }
  }

  toMenu(): void {
    this.state = 'menu';
    this.s = 0;
    this.speed = 0;
    this.damage = 0;
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
    this.trackMesh.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
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
    const delta = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (this.state === 'countdown') {
      this.countdown -= delta;
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.countdown = 0;
      }
    } else if (this.state === 'racing') {
      this.simulate(delta);
    }
    this.updateCarVisuals();
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
    this.report();
  };

  private simulate(delta: number): void {
    this.time += delta;
    this.totalTime += delta;

    const frame = this.frameAt(this.s);
    const damageScale = 1 - (this.damage / 100) * 0.45;
    const engine = this.brake ? -26 : 9.5 * damageScale;
    const maxSpeed = 24 * damageScale;
    const gravity = -9.82 * frame.tangent.y;

    this.speed += (engine + gravity) * delta;
    this.speed -= this.speed * 0.22 * delta;
    if (this.speed > maxSpeed) {
      this.speed = maxSpeed;
    }
    if (this.speed < 0) {
      this.speed = 0;
    }

    // Lateral movement inside the rails.
    const halfUsable = TRACK_WIDTH / 2 - 0.55;
    const previousLateral = this.lateral;
    this.lateral = clamp(
      this.lateral + this.steerTarget * 3.4 * delta,
      -halfUsable,
      halfUsable,
    );
    if (
      Math.abs(this.lateral) >= halfUsable - 0.001 &&
      Math.abs(this.steerTarget) > 0.5 &&
      Math.abs(this.lateral - previousLateral) < 0.0001
    ) {
      this.damage = Math.min(100, this.damage + 9 * delta);
      this.speed *= 0.985;
    }

    // Boost strips.
    this.boostCooldown = Math.max(0, this.boostCooldown - delta);
    if (this.boostCooldown === 0) {
      const zone = this.boosts.find(
        (candidate) => this.s >= candidate.from && this.s < candidate.to,
      );
      if (zone) {
        this.speed = Math.min(maxSpeed + 6, this.speed + 7);
        this.boostCooldown = 1.6;
      }
    }

    // Losing contact at the top of a loop damages the car and scrubs speed.
    const loopTop = frame.up.y < -0.7 && frame.position.y > 6;
    if (loopTop && !this.lastLapTopCheck && this.speed < 9.5) {
      this.damage = Math.min(100, this.damage + 22);
      this.speed *= 0.55;
    }
    this.lastLapTopCheck = loopTop;

    this.s += this.speed * delta;
    if (this.s >= this.length) {
      this.s -= this.length;
      this.lapStart = this.time;
      this.lap += 1;
      if (this.lap > LAPS) {
        this.state = 'finished';
        this.callbacks.onFinish(this.totalTime, this.damage);
        return;
      }
    }

    // Rescue when stuck.
    if (this.speed < 1) {
      this.stallTime += delta;
      if (this.stallTime > 2.5) {
        this.stallTime = 0;
        this.totalTime += 3;
        this.s = Math.max(0, this.s - 12);
        this.lateral *= 0.5;
        this.speed = 4;
      }
    } else {
      this.stallTime = 0;
    }
  }

  private updateCarVisuals(): void {
    const frame = this.frameAt(this.s);
    this.placeCar(this.s, this.lateral, frame);
    const spin = (this.s / WHEEL_RADIUS) * Math.PI * 2;
    for (const wheel of this.car.wheels) {
      wheel.rotation.x = spin;
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
    const frame = this.frameAt(this.s);
    const shake = this.reducedMotion.matches ? 0 : Math.min(0.06, this.speed / 400);
    if (this.cameraMode === 'chase') {
      const desired = frame.position
        .clone()
        .addScaledVector(frame.up, 4.2 + shake)
        .addScaledVector(frame.tangent, -10);
      this.camera.position.lerp(desired, clamp(delta * 8, 0, 1));
      const target = frame.position
        .clone()
        .addScaledVector(frame.tangent, 14)
        .addScaledVector(frame.up, 1.2);
      this.camera.up.copy(frame.up);
      this.camera.lookAt(target);
    } else {
      this.camera.position.copy(
        frame.position
          .clone()
          .addScaledVector(frame.up, 0.78)
          .addScaledVector(frame.tangent, 0.15),
      );
      const target = frame.position
        .clone()
        .addScaledVector(frame.tangent, 30)
        .addScaledVector(frame.up, 0.4);
      this.camera.up.copy(frame.up);
      this.camera.lookAt(target);
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
