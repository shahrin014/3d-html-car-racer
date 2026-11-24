import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCar, PLAYER_CAR, WHEEL_RADIUS, type Car } from './Car';
import { chasePose, createChaseRig, resetChaseRig } from './chaseCamera';
import { createCockpit, type Cockpit } from './cockpit';
import { cockpitPose } from './cockpitCamera';
import {
  BOOST_COOLDOWN,
  BOOST_IMPULSE,
  COUNTDOWN_SECONDS,
  DAMAGE_IMPULSE_FLOOR,
  DEFAULT_LEVEL,
  DEFAULT_OPPONENT_COUNT,
  FIXED_STEP,
  JUMP_FAIL_GRACE_SECONDS,
  LAPS,
  MAX_DAMAGE,
  MAX_FRAME_DELTA,
  MAX_SUBSTEPS,
  OPPONENT_COUNT_MAX,
  PHYSICS_RIDE_HEIGHT,
  RESCUE_PENALTY_SECONDS,
  RESCUE_SPEED_THRESHOLD,
  RESCUE_STALL_SECONDS,
  TRACK_WIDTH,
} from './constants';
import {
  jumpFailed,
  jumpRetryFrame,
  jumpSpanAt,
  jumpSpans,
  type JumpSpan,
} from './jumps';
import {
  buildObstacleMesh,
  obstacleLanes,
  obstacleSpecs,
  type ObstacleLane,
  type ObstacleMesh,
  type ObstacleSpec,
} from './obstacles';
import { opponentCarIds, opponentSpecs, racingPose } from './opponents';
import { DEFAULT_PAINT, opponentPaints, type Paint } from './palette';
import { createPhysics, type PhysicsHandle } from './physics';
import { racePlacing } from './placing';
import { createSmoothedPose, resetSmoothedPose, smoothPose } from './poseSmoothing';
import {
  buildScenery,
  clearsTrack,
  SCENERY_GRID,
  SCENERY_LANDMARK_CLEARANCE,
  SCENERY_MARGIN,
  type Building,
  type Scenery,
} from './scenery';
import { buildSkybox, disposeSkyboxes } from './skybox';
import {
  buildFrames,
  generateCircuit,
  trackLength,
  type Circuit,
  type Piece,
  type TrackFrame,
} from './track';
import { buildTrackMesh, splitCircuitPieces, type TrackMesh } from './trackMesh';

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
  onFinish: (
    totalTime: number,
    damage: number,
    placing: number,
    fieldSize: number,
  ) => void;
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
  private readonly cockpit: Cockpit;
  private car: Car;
  private playerPaint: Paint;
  private opponentCount: number;
  private opponents: { car: Car; spin: number }[] = [];
  private trackMesh!: TrackMesh;
  private obstacleMesh: ObstacleMesh | null = null;
  private obstacles: ObstacleSpec[] = [];
  private obstacleLaneSpecs: ObstacleLane[] = [];
  private scenery: Scenery | null = null;
  /** The floor plane and its grid, rebuilt with each circuit. */
  private ground: { mesh: THREE.Mesh; grid: THREE.GridHelper } | null = null;
  private skyboxRevision = 0;
  private frames!: TrackFrame[];
  private length!: number;
  private boosts: BoostZone[] = [];
  private jumps: JumpSpan[] = [];
  /** Seed of the circuit currently built. */
  private seed: string;

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
  private drift = false;
  private boostCooldown = 0;
  private pausedFromCountdown = false;
  private stallTime = 0;
  private jumpFailTime = 0;
  private lastTime = 0;
  private physics: PhysicsHandle | null = null;
  private pendingPhysics: PhysicsHandle | null = null;
  private physicsLoad: Promise<void> | null = null;
  private physicsFailed = false;
  /** Bumped when the circuit changes, so stale physics loads are discarded. */
  private physicsRevision = 0;
  private physicsAccumulator = 0;
  private lastFrameIndex = 0;
  private wheelSpin = 0;
  private carId: string;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  /** Reused scratch pose so the camera rigs allocate nothing per frame. */
  private readonly cameraPose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly carUp = new THREE.Vector3();
  private readonly opponentUp = new THREE.Vector3();
  private readonly carTarget = new THREE.Vector3();
  private readonly visualPose = createSmoothedPose();
  private readonly chaseRig = createChaseRig();

  constructor(
    container: HTMLElement,
    callbacks: GameCallbacks,
    seed: string,
    paint: Paint = DEFAULT_PAINT,
    opponents = DEFAULT_OPPONENT_COUNT,
    carId = PLAYER_CAR,
    requiredKinds: readonly Piece['kind'][] = [],
    excludedKinds: readonly Piece['kind'][] = [],
  ) {
    this.carId = carId;
    this.container = container;
    this.callbacks = callbacks;
    this.playerPaint = paint;
    this.opponentCount = Math.min(
      OPPONENT_COUNT_MAX,
      Math.max(0, Math.round(opponents)),
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D race circuit');
    this.renderer.domElement.setAttribute('role', 'img');

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
    // The cockpit is parented to the camera so it rides the driver's view
    // through banks and loops. A camera has to be in the scene graph for its
    // children to be drawn.
    this.cockpit = createCockpit();
    this.camera.add(this.cockpit.group);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0x07101a, 60, 220);
    this.scene.background = new THREE.Color(0x07101a);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;

    this.clockLights();

    this.seed = seed;
    this.buildCircuit(
      generateCircuit(seed, DEFAULT_LEVEL, {
        allowMultiCrossing: true,
        requiredKinds,
        excludedKinds,
      }),
    );

    this.car = createCar(paint.color, this.carId);
    this.scene.add(this.car.group);
    this.placeCar(0, 0);
    this.rebuildOpponentCars();

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

  /**
   * Build the circuit behind the menu or a new race. A different seed replaces
   * the track mesh and resets the physics world, because the colliders were cut
   * for the old layout.
   */
  private buildCircuit(circuit: Circuit): void {
    this.seed = circuit.seed;
    this.frames = buildFrames(circuit);
    this.length = trackLength(this.frames);
    this.boosts = [];
    this.jumps = jumpSpans(circuit.pieces);
    this.jumpFailTime = 0;
    let distance = 0;
    for (const piece of circuit.pieces) {
      if (piece.boost) {
        this.boosts.push({ from: distance, to: distance + piece.length });
      }
      distance += piece.length;
    }
    if (this.trackMesh) {
      this.scene.remove(this.trackMesh.group);
      this.trackMesh.dispose();
    }
    const mesh = buildTrackMesh(splitCircuitPieces(circuit.pieces));
    this.trackMesh = mesh;
    this.scene.add(mesh.group);

    this.obstacles = obstacleSpecs(circuit);
    this.obstacleLaneSpecs = obstacleLanes(circuit);
    if (this.obstacleMesh) {
      this.scene.remove(this.obstacleMesh.group);
      this.obstacleMesh.dispose();
    }
    this.obstacleMesh = buildObstacleMesh(this.obstacles);
    this.scene.add(this.obstacleMesh.group);

    if (this.scenery) {
      this.scene.remove(this.scenery.group);
      this.scenery.dispose();
    }
    // Each spiral ramp wraps around a landmark tower. Keep the tower only when
    // its 12 m footprint stays clear of every other part of the circuit.
    const landmarks = circuit.pieces
      .filter(
        (piece) => piece.kind === 'spiral-up' && piece.spiralCenter !== undefined,
      )
      .map((piece): Building => {
        const center = piece.spiralCenter!;
        return {
          x: center.x,
          z: center.z,
          width: 12,
          depth: 12,
          height: 26,
          rotation: 0,
        };
      })
      .filter((building) =>
        clearsTrack(
          this.frames,
          building.x,
          building.z,
          SCENERY_LANDMARK_CLEARANCE,
        ),
      );
    this.scenery = buildScenery(
      this.frames,
      circuit.seed,
      undefined,
      landmarks,
    );
    this.scene.add(this.scenery.group);

    this.layoutGround();

    this.applySkybox(circuit.seed);
  }

  /**
   * Load the sky belonging to a circuit. The flat fog colour stands in until
   * the HDR arrives, and a newer circuit invalidates an older, slower load.
   */
  private applySkybox(seed: string): void {
    const revision = ++this.skyboxRevision;
    const skybox = buildSkybox(seed);
    this.scene.background = new THREE.Color(skybox.style.fog);
    const fog = this.scene.fog;
    if (fog) {
      fog.color.setHex(skybox.style.fog);
    }
    void skybox.texture
      .then((texture) => {
        if (revision !== this.skyboxRevision) {
          return;
        }
        this.scene.background = texture;
      })
      .catch((error: unknown) => {
        console.error('Skybox could not load.', error);
      });
  }

  /**
   * Swap in a freshly seeded circuit. The old physics handle is dropped and a
   * load for the new layout starts lazily on the next step.
   */
  private replaceCircuit(seed: string): void {
    this.buildCircuit(
      generateCircuit(seed, DEFAULT_LEVEL, { allowMultiCrossing: true }),
    );
    this.invalidatePhysics();
    this.placeOpponents();
  }

  /** Drop the physics world so the next load builds it for the current field. */
  private invalidatePhysics(): void {
    this.physicsRevision += 1;
    this.physics?.dispose();
    this.physics = null;
    this.pendingPhysics?.dispose();
    this.pendingPhysics = null;
    this.physicsLoad = null;
    this.physicsFailed = false;
    this.physicsAccumulator = 0;
  }

  /**
   * Start a race. A `seed` different from the current circuit is built first,
   * so the caller can randomize the track on every start; the physics world is
   * rebuilt for the new colliders.
   */
  startRace(seed?: string): void {
    if (seed !== undefined && seed !== this.seed) {
      this.replaceCircuit(seed);
    }
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
    this.jumpFailTime = 0;
    this.boostCooldown = 0;
    this.physicsAccumulator = 0;
    this.lastFrameIndex = 0;
    this.wheelSpin = 0;
    this.brake = false;
    this.drift = false;
    if (this.pendingPhysics) {
      this.physics = this.pendingPhysics;
      this.pendingPhysics = null;
    }
    const first = this.frames[0];
    if (this.physics && first) {
      this.physics.reset(first);
    }
    resetChaseRig(this.chaseRig);
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
    this.jumpFailTime = 0;
    const first = this.frames[0];
    if (this.physics && first) {
      this.physics.reset(first);
    }
    resetChaseRig(this.chaseRig);
    this.placeCar(0, 0);
    this.report();
  }

  /**
   * Repaint the player car. `Car.ts` clones the loaded scene and swaps only the
   * three named paint channels, so a rebuild is cheap and a colour the player
   * returns to does not leak another material. The visual pose snaps on the
   * next frame, and physics keeps its own state. Rivals are repainted at the
   * same time so they never share the player's new colour.
   */
  /**
   * Switch the player's car. The caller must have preloaded the new model;
   * ignored once a race is under way, like the paint picker.
   */
  setPlayerCar(id: string): void {
    if (id === this.carId) {
      return;
    }
    if (
      this.state === 'countdown' ||
      this.state === 'racing' ||
      this.state === 'paused'
    ) {
      return;
    }
    this.carId = id;
    this.scene.remove(this.car.group);
    this.car = createCar(this.playerPaint.color, id);
    this.scene.add(this.car.group);
    resetSmoothedPose(this.visualPose);
    this.placeCar(0, 0);
    this.rebuildOpponentCars();
  }

  setPlayerPaint(paint: Paint): void {
    if (paint.id === this.playerPaint.id) {
      return;
    }
    this.playerPaint = paint;
    this.scene.remove(this.car.group);
    this.car = createCar(paint.color, this.carId);
    this.scene.add(this.car.group);
    resetSmoothedPose(this.visualPose);
    this.rebuildOpponentCars();
  }

  /** Set the field size for the next race; ignored once a race is under way. */
  setOpponentCount(count: number): void {
    if (
      this.state === 'countdown' ||
      this.state === 'racing' ||
      this.state === 'paused'
    ) {
      return;
    }
    const next = Math.min(
      OPPONENT_COUNT_MAX,
      Math.max(0, Math.round(count)),
    );
    if (next === this.opponentCount) {
      return;
    }
    this.opponentCount = next;
    // The field lives in the physics world, so drop it; it is rebuilt with the
    // new opponents on the next race. Rebuild the visuals after, so the rivals
    // sit on the grid rather than at their last frozen pose.
    this.invalidatePhysics();
    this.rebuildOpponentCars();
  }

  /** Draw each rival at its grid slot, or at its physics pose in a race. */
  private rebuildOpponentCars(): void {
    for (const opponent of this.opponents) {
      this.scene.remove(opponent.car.group);
    }
    const ids = opponentCarIds(this.seed, this.opponentCount);
    this.opponents = opponentPaints(this.playerPaint, this.opponentCount).map(
      (paint, index) => {
        const car = createCar(paint.color, ids[index] ?? this.carId);
        this.scene.add(car.group);
        return { car, spin: 0 };
      },
    );
    this.placeOpponents();
  }

  private placeOpponents(): void {
    const specs = opponentSpecs(this.opponentCount);
    const states = this.physics?.readOpponents() ?? [];
    this.opponents.forEach((opponent, index) => {
      const state = states[index];
      if (state) {
        this.opponentUp.set(0, 1, 0).applyQuaternion(state.quaternion);
        opponent.car.group.position
          .copy(state.position)
          .addScaledVector(this.opponentUp, -PHYSICS_RIDE_HEIGHT);
        opponent.car.group.quaternion.copy(state.quaternion);
        return;
      }
      const spec = specs[index];
      if (!spec) {
        return;
      }
      const pose = racingPose(this.frames, spec.start, spec.lane);
      opponent.car.group.position
        .copy(pose.position)
        .addScaledVector(pose.up, -PHYSICS_RIDE_HEIGHT);
      opponent.car.group.quaternion.copy(pose.quaternion);
    });
  }

  setSteer(value: number): void {
    this.steerTarget = clamp(value, -1, 1);
  }

  setBrake(active: boolean): void {
    this.brake = active;
  }

  setDrift(active: boolean): void {
    this.drift = active;
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
    this.obstacleMesh?.dispose();
    this.scenery?.dispose();
    this.skyboxRevision += 1;
    disposeSkyboxes();
    this.cockpit.dispose();
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
    const revision = this.physicsRevision;
    this.physicsLoad = createPhysics(this.frames, {
      opponents: opponentSpecs(this.opponentCount),
      obstacles: this.obstacles,
      obstacleLanes: this.obstacleLaneSpecs,
    })
      .then((handle) => {
        if (revision !== this.physicsRevision) {
          // The circuit changed while Rapier was loading: this world holds the
          // old layout, so drop it and let the caller's next load build the new
          // one.
          handle.dispose();
          return;
        }
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
        if (revision !== this.physicsRevision) {
          return;
        }
        this.physicsFailed = true;
        console.error('Rapier could not start.', error);
        this.state = 'menu';
        this.callbacks.onPhysicsError?.('Physics unavailable');
        this.report();
      });
    return this.physicsLoad;
  }

  /**
   * Build the floor plane and its grid under the circuit and its skyline.
   * The floor is sized to the city — track plus the buildings that ring it —
   * with enough margin that its edge never reaches the camera's frustum; a
   * fixed 400 m floor only covered the track, so buildings stood past its
   * edge with the skybox's own lower hemisphere under them. The plane is drawn
   * double-sided so the floor is still there if the driver's eye slips
   * below it.
   */
  private layoutGround(): void {
    if (this.ground) {
      this.scene.remove(this.ground.mesh);
      this.scene.remove(this.ground.grid);
      this.ground.mesh.geometry.dispose();
      (this.ground.mesh.material as THREE.Material).dispose();
      this.ground.grid.geometry.dispose();
      (this.ground.grid.material as THREE.Material).dispose();
      this.ground = null;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const frame of this.frames) {
      minX = Math.min(minX, frame.position.x);
      maxX = Math.max(maxX, frame.position.x);
      minZ = Math.min(minZ, frame.position.z);
      maxZ = Math.max(maxZ, frame.position.z);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfSpan = Math.max(maxX - cx, maxZ - cz);
    // The skyline reaches this far past the track: the grid margin, the
    // metre-wide jitter, and the outer edge of the widest building.
    const cityHalfSpan = halfSpan + SCENERY_MARGIN + SCENERY_GRID + 8;
    // 450 m of floor past the city keeps the edge past the 400 m far plane.
    const planeSize = 2 * (cityHalfSpan + 450);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(planeSize, planeSize),
      new THREE.MeshStandardMaterial({
        color: 0x0a1018,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.02, cz);
    this.scene.add(ground);
    const grid = new THREE.GridHelper(
      2 * cityHalfSpan,
      Math.max(1, Math.round((2 * cityHalfSpan) / 4)),
      0x22334a,
      0x141d29,
    );
    grid.position.set(cx, 0.001, cz);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    this.ground = { mesh: ground, grid };
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
      this.simulatePhysics(delta, true);
    } else if (this.state === 'finished') {
      // The result is already recorded. Keep the car and the field moving
      // behind the results so the finish does not freeze mid-corner.
      this.simulatePhysics(delta, false);
    }
    this.updateCarVisuals(delta);
    this.updateOpponentVisuals(delta);
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
    this.report();
  };

  private simulatePhysics(delta: number, racing: boolean): void {
    const physics = this.physics;
    if (!physics) {
      return;
    }
    if (racing) {
      this.time += delta;
      this.totalTime += delta;
    }

    const damageScale = 1 - (this.damage / 100) * 0.45;
    let steer = this.steerTarget;
    let brake = this.brake;
    let drift = this.drift;
    if (!racing) {
      // Finished: drive the racing line on autopilot. The results are frozen,
      // so this is presentation only.
      const state = physics.read();
      const guide = this.frameAt(this.s);
      const lateral =
        (state.position.x - guide.position.x) * guide.right.x +
        (state.position.y - guide.position.y) * guide.right.y +
        (state.position.z - guide.position.z) * guide.right.z;
      const lateralSpeed =
        state.velocity.x * guide.right.x +
        state.velocity.y * guide.right.y +
        state.velocity.z * guide.right.z;
      steer = clamp(lateral / 0.9 + lateralSpeed * 0.15, -1, 1);
      brake = false;
      drift = false;
    }
    const input = {
      throttle: damageScale,
      brake,
      steer,
      drift,
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

    if (!racing) {
      this.lastFrameIndex = index;
      this.keepOnTrack(physics, frame, index, delta, false);
      return;
    }

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
        const opponents = physics.readOpponents();
        const placing = racePlacing(
          (this.lap - 1) * this.length,
          opponents.map((opponent) => opponent.travelled),
        );
        this.callbacks.onFinish(
          this.totalTime,
          this.damage,
          placing,
          this.opponentCount + 1,
        );
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

    this.keepOnTrack(physics, frame, index, delta, true);
  }

  /**
   * Rescue timer. In a race a rescue adds a time penalty; after the finish the
   * same reset runs without touching the frozen result.
   */
  private keepOnTrack(
    physics: PhysicsHandle,
    frame: TrackFrame,
    index: number,
    delta: number,
    racing: boolean,
  ): void {
    const state = physics.read();
    this.carUp.set(0, 1, 0).applyQuaternion(state.quaternion);
    const offTrack = state.position.distanceTo(frame.position) > TRACK_WIDTH;
    const inverted = this.carUp.dot(frame.up) < 0.2;

    // A jump has its own, much shorter, failure timer: once the car is below
    // the launch line or landing deck it cannot recover, and the generic
    // off-track distance would take seconds to notice because the gap has no
    // floor to stop the fall.
    const span = jumpSpanAt(this.jumps, frame.s);
    const failedJump = jumpFailed(span, frame, state.position, frame.s);
    this.jumpFailTime = failedJump ? this.jumpFailTime + delta : 0;

    if (this.speed < RESCUE_SPEED_THRESHOLD || offTrack || inverted) {
      this.stallTime += delta;
    } else {
      this.stallTime = 0;
    }

    if (
      this.jumpFailTime > JUMP_FAIL_GRACE_SECONDS ||
      this.stallTime > RESCUE_STALL_SECONDS
    ) {
      this.stallTime = 0;
      this.jumpFailTime = 0;
      if (racing) {
        this.totalTime += RESCUE_PENALTY_SECONDS;
      }
      // A failed jumper is put back before the kicker so it has a run-up. Any
      // other rescue stays on the frame under the car.
      const retry =
        failedJump && span ? jumpRetryFrame(this.frames, span) : frame;
      const retryIndex =
        failedJump && span ? this.frames.indexOf(retry) : index;
      physics.reset(retry);
      resetChaseRig(this.chaseRig);
      resetSmoothedPose(this.visualPose);
      this.s = retry.s;
      this.lastFrameIndex = retryIndex >= 0 ? retryIndex : index;
      this.physicsAccumulator = 0;
    }
  }

  private updateOpponentVisuals(delta: number): void {
    if (this.opponents.length === 0) {
      return;
    }
    const states = this.physics?.readOpponents() ?? [];
    this.opponents.forEach((opponent, index) => {
      const state = states[index];
      if (!state) {
        return;
      }
      this.opponentUp.set(0, 1, 0).applyQuaternion(state.quaternion);
      opponent.car.group.position
        .copy(state.position)
        .addScaledVector(this.opponentUp, -PHYSICS_RIDE_HEIGHT);
      opponent.car.group.quaternion.copy(state.quaternion);
      opponent.spin += (state.speed * delta) / WHEEL_RADIUS;
      for (const wheel of opponent.car.wheels) {
        wheel.rotation.x = opponent.spin;
      }
    });
  }

  private updateCarVisuals(delta: number): void {
    if (this.physics) {
      const state = this.physics.read();
      this.carUp.set(0, 1, 0).applyQuaternion(state.quaternion);
      // Draw a filtered pose. The body rests directly on a faceted deck, so
      // pure physics bounces it a few millimetres at contact frequency; that
      // buzz is not gameplay and reads as the car shaking.
      this.carTarget
        .copy(state.position)
        .addScaledVector(this.carUp, -PHYSICS_RIDE_HEIGHT);
      const pose = smoothPose(
        this.visualPose,
        this.carTarget,
        state.quaternion,
        delta,
      );
      this.car.group.position.copy(pose.position);
      this.car.group.quaternion.copy(pose.quaternion);
      this.wheelSpin += (this.speed * delta) / WHEEL_RADIUS;
    } else {
      this.placeCar(0, 0);
    }
    for (const wheel of this.car.wheels) {
      wheel.rotation.x = this.wheelSpin;
    }
    // Positive steer is the player's right, and the model faces +Z, so its
    // local +X is the driver's left; the wheels need the negated angle.
    this.car.setSteer(-this.steerTarget);
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
    resetSmoothedPose(this.visualPose);
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
    // The driver's-eye view shows its own interior instead of the shell: the
    // body would sit between the eye and the road, and the dashboard and wheel
    // are attached to the camera. The wheel follows the steering input.
    const cockpitMode = this.cameraMode === 'cockpit';
    this.car.group.visible = !cockpitMode;
    this.cockpit.setVisible(cockpitMode);
    if (cockpitMode) {
      this.cockpit.turn(this.steerTarget, delta);
    }
    if (this.cameraMode === 'chase') {
      // The rig smooths its own orientation and stays clear of the deck, so the
      // view follows the loop instead of cutting through it.
      const pose = chasePose(
        this.chaseRig,
        position,
        orientation,
        this.frames,
        this.lastFrameIndex,
        delta,
        shake,
        this.cameraPose,
      );
      this.camera.position.copy(pose.position);
      this.camera.up.copy(pose.up);
      this.camera.lookAt(pose.target);
    } else {
      // The driver's eye rides the body, not the racing line. Reading the rig
      // off the car is what keeps the view across the track when the car
      // steers off centre, and lets its yaw swing the view into the turn.
      const pose = cockpitPose(
        this.car.group.position,
        this.car.group.quaternion,
        this.cameraPose,
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
    this.cockpit.resize(this.camera);
  }
}
