import * as THREE from 'three';
import { createCar, disposeCarAssets, TRAFFIC_COLORS } from './Car';
import { clampLaneIndex, overlaps, type Box2D } from './collision';
import {
  scoreFor,
  spawnIntervalFor,
  speedAt,
} from './difficulty';
import {
  BASE_SPEED,
  DESPAWN_Z,
  INVULNERABLE_SECONDS,
  LANE_COUNT,
  LANE_X,
  MAX_DT,
  MAX_SPEED,
  PLAYER_HALF_LENGTH,
  PLAYER_HALF_WIDTH,
  PLAYER_Z,
  SPAWN_Z,
  STARTING_HEARTS,
  TRAFFIC_HALF_LENGTH,
  TRAFFIC_HALF_WIDTH,
  TRAFFIC_RELATIVE_SPEED,
} from './constants';
import { Input } from './Input';
import { Road } from './Road';
import { chooseLanes, trafficCountFor } from './spawn';

export type GameState = 'idle' | 'running' | 'paused' | 'over';

export interface RunResult {
  score: number;
  distance: number;
}

export interface GameCallbacks {
  onScore: (score: number) => void;
  onHearts: (hearts: number) => void;
  onHit: () => void;
  onGameOver: (result: RunResult) => void;
  /**
   * Reports the lane the player is heading to. Optional so the simulation
   * keeps working without a HUD; the browser smoke tests read it.
   */
  onLane?: (lane: number) => void;
}

interface Car {
  readonly group: THREE.Group;
  readonly box: Box2D;
  lane: number;
  active: boolean;
}

const POOL_SIZE = 16;
const POINTS_UPDATE_INTERVAL = 0.1;

/**
 * Vertical gradient used as the scene backdrop. The bottom matches the fog so
 * the road fades into the horizon instead of ending on a hard line.
 */
function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is not available');
  }
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#02040a');
  gradient.addColorStop(0.45, '#040c15');
  gradient.addColorStop(0.78, '#081826');
  gradient.addColorStop(1, '#0b2130');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Owns the Three.js scene, the simulation, and the run lifecycle.
 *
 * The class deliberately knows nothing about the DOM beyond the element it
 * renders into: the UI subscribes through {@link GameCallbacks}.
 */
export class Game {
  private currentState: GameState = 'idle';
  private readonly container: HTMLElement;
  private readonly callbacks: GameCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly road = new Road();
  private readonly trafficCars: Car[] = [];
  private readonly trafficGroup = new THREE.Group();
  private readonly player: THREE.Group;
  private readonly input: Input;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotionQuery: MediaQueryList;

  private elapsed = 0;
  private distance = 0;
  private hearts = STARTING_HEARTS;
  private lane = 1;
  private targetX = 0;
  private invulnerableUntil = 0;
  private spawnCooldown = 0.85;
  private scoreClock = 0;
  private shake = 0;
  private lastFrame = 0;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-label', '3D race track');
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
    this.camera.position.set(0, 5.6, PLAYER_Z + 10.5);
    this.camera.lookAt(0, 1.05, PLAYER_Z - 12);

    this.scene.background = createSkyTexture();
    this.scene.fog = new THREE.Fog(0x0b2130, 55, 170);

    const hemisphere = new THREE.HemisphereLight(0x9fd6ff, 0x0a1018, 1.35);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffe3b3, 2.5);
    key.position.set(7, 16, 8);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x22d3ee, 1.2);
    rim.position.set(-6, 6, -14);
    this.scene.add(rim);

    const fill = new THREE.AmbientLight(0x27445c, 0.55);
    this.scene.add(fill);

    this.scene.add(this.road.group);
    this.scene.add(this.trafficGroup);

    this.player = createCar(0x22d3ee);
    this.player.name = 'player-car';
    this.player.position.set(0, 0, PLAYER_Z);
    this.scene.add(this.player);

    for (let index = 0; index < POOL_SIZE; index += 1) {
      const group = createCar(TRAFFIC_COLORS[index % TRAFFIC_COLORS.length] ?? 0xffffff);
      group.visible = false;
      this.trafficGroup.add(group);
      this.trafficCars.push({
        group,
        active: false,
        lane: 0,
        box: {
          x: 0,
          z: SPAWN_Z,
          halfWidth: TRAFFIC_HALF_WIDTH,
          halfLength: TRAFFIC_HALF_LENGTH,
        },
      });
    }

    this.input = new Input(this.renderer.domElement, (direction) => {
      this.steer(direction);
    });
    this.input.attach();

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
    this.resize();

    this.render();
  }

  get currentLane(): number {
    return this.lane;
  }

  /** Reset the scene and start a fresh run. */
  startRun(): void {
    this.resetSimulation();
    this.seedTraffic();
    this.currentState = 'running';
    this.callbacks.onScore(0);
    this.callbacks.onHearts(this.hearts);
    this.callbacks.onLane?.(this.lane);
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Freeze the simulation. Rendering stops until resumed. */
  pause(): void {
    if (this.currentState !== 'running') {
      return;
    }
    this.currentState = 'paused';
    this.renderer.setAnimationLoop(null);
    this.render();
  }

  resume(): void {
    if (this.currentState !== 'paused') {
      return;
    }
    this.currentState = 'running';
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Return to the attract screen with an empty road. */
  showIdle(): void {
    this.currentState = 'idle';
    this.renderer.setAnimationLoop(null);
    this.resetSimulation();
    this.render();
  }

  /** Change lane by one, clamped to the road. */
  steer(direction: -1 | 1): void {
    if (this.currentState !== 'running') {
      return;
    }
    const nextLane = clampLaneIndex(this.lane + direction, LANE_COUNT);
    if (nextLane === this.lane) {
      return;
    }
    this.lane = nextLane;
    this.targetX = LANE_X[nextLane] ?? 0;
    this.callbacks.onLane?.(this.lane);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.input.detach();
    this.resizeObserver.disconnect();
    this.road.dispose();
    disposeCarAssets();
    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background.dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly tick = (time: number): void => {
    const dt = Math.min(
      MAX_DT,
      Math.max(0, (time - this.lastFrame) / 1000),
    );
    this.lastFrame = time;
    this.update(dt);
    this.render();
  };

  private resetSimulation(): void {
    this.elapsed = 0;
    this.distance = 0;
    this.hearts = STARTING_HEARTS;
    this.lane = 1;
    this.targetX = LANE_X[1] ?? 0;
    this.invulnerableUntil = 0;
    this.spawnCooldown = 0.85;
    this.scoreClock = 0;
    this.shake = 0;
    this.player.position.x = this.targetX;
    this.player.visible = true;
    this.road.reset();
    for (const car of this.trafficCars) {
      car.active = false;
      car.group.visible = false;
    }
    this.camera.position.x = 0;
  }

  private update(dt: number): void {
    if (this.currentState !== 'running') {
      return;
    }

    this.elapsed += dt;
    const speed = speedAt(this.elapsed);
    this.distance += speed * dt;

    this.road.update(dt, speed);
    this.updateTraffic(dt, speed);

    this.player.position.x = THREE.MathUtils.damp(
      this.player.position.x,
      this.targetX,
      14,
      dt,
    );

    const invulnerable = this.elapsed < this.invulnerableUntil;
    this.player.visible = !invulnerable || Math.floor(this.elapsed * 16) % 2 === 0;

    if (!invulnerable) {
      const hit = this.findCollision();
      if (hit) {
        this.removeTrafficCar(hit);
        this.handleHit();
        if (this.currentState !== 'running') {
          return;
        }
      }
    }

    this.updateCamera(dt);
    this.scoreClock += dt;
    if (this.scoreClock >= POINTS_UPDATE_INTERVAL) {
      this.scoreClock = 0;
      this.callbacks.onScore(scoreFor(this.distance));
    }
  }

  private updateTraffic(dt: number, speed: number): void {
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      this.spawnWave(speed);
      // Small jitter keeps waves from feeling metronomic.
      this.spawnCooldown = spawnIntervalFor(speed) * (0.9 + Math.random() * 0.2);
    }

    for (const car of this.trafficCars) {
      if (!car.active) {
        continue;
      }
      car.group.position.z += speed * TRAFFIC_RELATIVE_SPEED * dt;
      car.box.z = car.group.position.z;
      if (car.group.position.z > DESPAWN_Z) {
        car.active = false;
        car.group.visible = false;
      }
    }
  }

  private spawnWave(speed: number): void {
    const count = trafficCountFor(Math.random, speed, BASE_SPEED, MAX_SPEED);
    const lanes = chooseLanes(Math.random, count, LANE_COUNT);
    for (const lane of lanes) {
      this.spawnTrafficCar(lane);
    }
  }

  /**
   * Put a few cars on the road immediately so the first seconds of a run are
   * not empty. The starting lane stays clear for one beat.
   */
  private seedTraffic(): void {
    this.spawnTrafficCar(0, -34);
    this.spawnTrafficCar(2, -58);
    this.spawnTrafficCar(0, -82);
  }

  private spawnTrafficCar(
    lane: number,
    z = SPAWN_Z - Math.random() * 8,
  ): void {
    // Never stack a new car on top of one that just entered the same lane.
    const blocked = this.trafficCars.some(
      (car) =>
        car.active &&
        car.lane === lane &&
        Math.abs(car.group.position.z - z) < 14,
    );
    if (blocked) {
      return;
    }

    const car = this.trafficCars.find((candidate) => !candidate.active);
    if (!car) {
      return;
    }

    const x = LANE_X[lane] ?? 0;
    car.active = true;
    car.lane = lane;
    car.group.visible = true;
    car.group.position.set(x, 0, z);
    car.box.x = x;
    car.box.z = car.group.position.z;
  }

  private findCollision(): Car | null {
    const playerBox: Box2D = {
      x: this.player.position.x,
      z: PLAYER_Z,
      halfWidth: PLAYER_HALF_WIDTH,
      halfLength: PLAYER_HALF_LENGTH,
    };
    for (const car of this.trafficCars) {
      if (car.active && overlaps(playerBox, car.box)) {
        return car;
      }
    }
    return null;
  }

  private removeTrafficCar(car: Car): void {
    car.active = false;
    car.group.visible = false;
  }

  private handleHit(): void {
    this.hearts -= 1;
    this.callbacks.onHearts(this.hearts);
    this.callbacks.onHit();
    this.shake = this.reducedMotionQuery.matches ? 0 : 0.45;

    if (this.hearts <= 0) {
      this.endRun();
      return;
    }
    this.invulnerableUntil = this.elapsed + INVULNERABLE_SECONDS;
  }

  private endRun(): void {
    this.currentState = 'over';
    this.renderer.setAnimationLoop(null);
    this.callbacks.onScore(scoreFor(this.distance));
    this.render();
    this.callbacks.onGameOver({
      score: scoreFor(this.distance),
      distance: this.distance,
    });
  }

  private updateCamera(dt: number): void {
    const shakeAmount = this.shake;
    const shakeX =
      shakeAmount > 0 ? Math.sin(this.elapsed * 74) * shakeAmount * 0.06 : 0;
    // Follow the car laterally so the outer lanes never leave the frame.
    const targetX = this.player.position.x * 0.92 + shakeX;
    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      targetX,
      9,
      dt,
    );
    this.camera.position.y =
      5.6 + (shakeAmount > 0 ? Math.sin(this.elapsed * 91) * 0.05 : 0);
    this.camera.lookAt(
      this.player.position.x * 0.82,
      1.05,
      PLAYER_Z - 13,
    );
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.65 ? 72 : 62;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
