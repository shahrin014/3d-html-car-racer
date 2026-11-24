import './style.css';
import * as THREE from 'three';
import {
  buildObstacleMesh,
  obstacleSpecs,
  type ObstacleMesh,
} from './game/obstacles';
import {
  buildScenery,
  clearsTrack,
  SCENERY_GRID,
  SCENERY_LANDMARK_CLEARANCE,
  SCENERY_MARGIN,
  type Scenery,
} from './game/scenery';
import { randomSeed } from './game/seed';
import {
  markPendingExclusions,
  markPendingRequirements,
  markPendingSeed,
  markPendingStart,
} from './game/session';
import { buildSkybox } from './game/skybox';
import {
  buildFrames,
  generateCircuit,
  type Circuit,
  type Piece,
  type TrackFrame,
} from './game/track';
import {
  buildTrackMesh,
  splitCircuitPieces,
  type TrackMesh,
} from './game/trackMesh';
import { DEFAULT_LEVEL } from './game/constants';

const PREVIEW_FOV = 42;
const PREVIEW_NEAR = 0.5;
const PREVIEW_FAR = 4000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface SegmentChoice {
  kind: Piece['kind'];
  label: string;
  note: string;
  /** Structural kinds are always present and cannot be excluded. */
  structural?: boolean;
}

interface SegmentGroup {
  title: string;
  choices: readonly SegmentChoice[];
}

/**
 * The segments a preview can require. The order is the order the builder meets
 * them: core deck, authored features, elevation, then the whole-layout family.
 * Some kinds are always present; requiring them is harmless and makes the list
 * a complete inventory of `Piece['kind']`.
 */
const SEGMENT_GROUPS: readonly SegmentGroup[] = [
  {
    title: 'Core',
    choices: [
      { kind: 'straight', label: 'Straight', note: 'Always present; plain deck between features', structural: true },
      { kind: 'turn', label: 'Turn', note: 'Always present; banked corner', structural: true },
      { kind: 'boost', label: 'Boost strip', note: 'Always present; chevron strip that pushes the car', structural: true },
      { kind: 'loop', label: 'Loop', note: 'Vertical loop' },
      { kind: 'shift', label: 'Loop return', note: 'S-curve after the loop; tied to the loop' },
    ],
  },
  {
    title: 'Features',
    choices: [
      { kind: 'hill', label: 'Hill crest', note: 'Crest instead of a jump' },
      { kind: 'kicker', label: 'Jump launch', note: 'Part of a jump; pairs with the gap and landing' },
      { kind: 'gap', label: 'Jump gap', note: 'The deckless space in a jump' },
      { kind: 'landing', label: 'Landing ramp', note: 'Wide ramp after the gap' },
      { kind: 'obstacles', label: 'Obstacle corridor', note: 'Seeded block rows' },
    ],
  },
  {
    title: 'Elevation',
    choices: [
      { kind: 'spiral-up', label: 'Spiral up', note: 'Climb on a spiral ramp' },
      { kind: 'spiral-down', label: 'Spiral down', note: 'Spiral descent' },
      { kind: 'bridge', label: 'Bridge deck', note: 'Raised crossing deck' },
      { kind: 'ramp-up', label: 'Bridge ramp up', note: 'Straight climb to a bridge level' },
      { kind: 'ramp-down', label: 'Bridge ramp down', note: 'Straight descent from a bridge level' },
      { kind: 'steep-ramp', label: 'Steep ramp', note: '80° boost climb; pairs with the steep descent' },
      { kind: 'steep-ramp-down', label: 'Steep descent', note: '80° descent for the steep ramp' },
    ],
  },
  {
    title: 'Layout',
    choices: [
      { kind: 'multi-crossing', label: 'Multi-crossing', note: 'A whole trefoil layout; select it alone' },
    ],
  },
];


/**
 * Small orbit rig for the preview camera. Drag to orbit, wheel or pinch to
 * zoom, double-click to return to the framed overview. It deliberately avoids
 * the addon controls so the preview page stays inside the app-shell budget.
 */
class OrbitRig {
  private azimuth = -0.72;
  private elevation = 0.62;
  private distance = 1;
  private minDistance = 1;
  private maxDistance = 1;
  private readonly target = new THREE.Vector3();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private bounds: THREE.Box3 | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly onChange: () => void,
  ) {
    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerEnd);
    element.addEventListener('pointercancel', this.handlePointerEnd);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
    element.addEventListener('dblclick', this.handleDoubleClick);
  }

  /** Fit the whole circuit into the view, keeping the current orbit angle. */
  frame(bounds: THREE.Box3, resetAngles = false): void {
    this.bounds = bounds;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1);
    this.target.copy(sphere.center);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov =
      2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const fitHeight = radius / Math.sin(verticalFov / 2);
    const fitWidth = radius / Math.sin(horizontalFov / 2);
    this.distance = Math.max(fitHeight, fitWidth) * 0.9;
    this.minDistance = this.distance * 0.35;
    this.maxDistance = this.distance * 2.4;
    if (resetAngles) {
      this.azimuth = -0.72;
      this.elevation = 0.62;
    }
    this.update();
  }

  update(): void {
    const cosElevation = Math.cos(this.elevation);
    this.camera.position.set(
      this.target.x + this.distance * cosElevation * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.sin(this.elevation),
      this.target.z + this.distance * cosElevation * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    this.onChange();
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerEnd);
    this.element.removeEventListener('pointercancel', this.handlePointerEnd);
    this.element.removeEventListener('wheel', this.handleWheel);
    this.element.removeEventListener('dblclick', this.handleDoubleClick);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this.element.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.pinchDistance = this.pinchDistanceNow();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      return;
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size >= 2) {
      const next = this.pinchDistanceNow();
      if (this.pinchDistance > 0 && next > 0) {
        this.distance = clamp(
          this.distance * (this.pinchDistance / next),
          this.minDistance,
          this.maxDistance,
        );
        this.update();
      }
      this.pinchDistance = next;
      return;
    }
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    this.azimuth -= deltaX * 0.006;
    this.elevation = clamp(this.elevation + deltaY * 0.006, 0.08, 1.45);
    this.update();
  };

  private handlePointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) {
      this.pinchDistance = 0;
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.distance = clamp(
      this.distance * Math.exp(event.deltaY * 0.0012),
      this.minDistance,
      this.maxDistance,
    );
    this.update();
  };

  private handleDoubleClick = (): void => {
    if (this.bounds) {
      this.frame(this.bounds, true);
    }
  };

  private pinchDistanceNow(): number {
    const points = [...this.pointers.values()];
    const first = points[0];
    const second = points[1];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }
}

/** A disposable, seed-driven 3D preview of the circuit the race will use. */
export class TrackPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: OrbitRig;
  private readonly resizeObserver: ResizeObserver;
  private track: TrackMesh | null = null;
  private obstacles: ObstacleMesh | null = null;
  private scenery: Scenery | null = null;
  private ground: { mesh: THREE.Mesh; grid: THREE.GridHelper } | null = null;
  private skyboxRevision = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', 'Track preview');
    this.container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      PREVIEW_FOV,
      1,
      PREVIEW_NEAR,
      PREVIEW_FAR,
    );
    this.scene.fog = new THREE.Fog(0x050a12, 260, 900);
    this.scene.add(new THREE.HemisphereLight(0x9fd6e6, 0x0a1018, 0.9));
    const key = new THREE.DirectionalLight(0xffe3c4, 2.1);
    key.position.set(18, 30, 12);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x22d3ee, 1.1);
    rim.position.set(-24, 12, -18);
    this.scene.add(rim);

    this.rig = new OrbitRig(this.camera, this.renderer.domElement, () =>
      this.render(),
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  /** Rebuild the scene for a new seed with the chosen segment rules. */
  setSeed(
    seed: string,
    requiredKinds: readonly Piece['kind'][] = [],
    excludedKinds: readonly Piece['kind'][] = [],
  ): Circuit {
    const circuit = generateCircuit(seed, DEFAULT_LEVEL, {
      allowMultiCrossing: true,
      requiredKinds,
      excludedKinds,
    });
    const frames = buildFrames(circuit);
    this.disposeCircuit();

    this.track = buildTrackMesh(splitCircuitPieces(circuit.pieces));
    this.scene.add(this.track.group);

    this.obstacles = buildObstacleMesh(obstacleSpecs(circuit));
    this.scene.add(this.obstacles.group);

    this.scenery = buildScenery(
      frames,
      seed,
      undefined,
      this.landmarks(circuit, frames),
    );
    this.scene.add(this.scenery.group);

    this.layoutGround(frames);
    this.applySkybox(seed);

    const bounds = new THREE.Box3();
    for (const frame of frames) {
      bounds.expandByPoint(frame.position);
    }
    this.rig.frame(bounds);
    this.render();
    return circuit;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.disposeCircuit();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };

  private resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  };

  private landmarks(circuit: Circuit, frames: TrackFrame[]) {
    return circuit.pieces
      .filter(
        (piece) => piece.kind === 'spiral-up' && piece.spiralCenter !== undefined,
      )
      .map((piece) => {
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
          frames,
          building.x,
          building.z,
          SCENERY_LANDMARK_CLEARANCE,
        ),
      );
  }

  /**
   * A dark floor and grid under the circuit. The preview shows the whole city,
   * so the floor reaches past the skyline instead of ending at the rails.
   */
  private layoutGround(frames: TrackFrame[]): void {
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
    for (const frame of frames) {
      minX = Math.min(minX, frame.position.x);
      maxX = Math.max(maxX, frame.position.x);
      minZ = Math.min(minZ, frame.position.z);
      maxZ = Math.max(maxZ, frame.position.z);
    }
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const halfSpan = Math.max(maxX - minX, maxZ - minZ) / 2;
    const cityHalfSpan = halfSpan + SCENERY_MARGIN + SCENERY_GRID + 8;
    const planeSize = 2 * (cityHalfSpan + 120);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(planeSize, planeSize),
      new THREE.MeshStandardMaterial({
        color: 0x0a1018,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centerX, -0.02, centerZ);
    this.scene.add(mesh);

    const grid = new THREE.GridHelper(
      2 * cityHalfSpan,
      Math.max(1, Math.round((2 * cityHalfSpan) / 4)),
      0x22334a,
      0x141d29,
    );
    grid.position.set(centerX, 0.001, centerZ);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    this.ground = { mesh, grid };
  }

  private applySkybox(seed: string): void {
    const revision = ++this.skyboxRevision;
    const skybox = buildSkybox(seed);
    this.scene.background = new THREE.Color(skybox.style.fog);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(skybox.style.fog);
    }
    void skybox.texture
      .then((texture) => {
        if (revision !== this.skyboxRevision) {
          return;
        }
        this.scene.background = texture;
        this.render();
      })
      .catch((error: unknown) => {
        console.error('The preview sky could not be loaded.', error);
      });
  }

  private disposeCircuit(): void {
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }
    if (this.obstacles) {
      this.scene.remove(this.obstacles.group);
      this.obstacles.dispose();
      this.obstacles = null;
    }
    if (this.scenery) {
      this.scene.remove(this.scenery.group);
      this.scenery.dispose();
      this.scenery = null;
    }
    if (this.ground) {
      this.scene.remove(this.ground.mesh);
      this.scene.remove(this.ground.grid);
      this.ground.mesh.geometry.dispose();
      (this.ground.mesh.material as THREE.Material).dispose();
      this.ground.grid.geometry.dispose();
      (this.ground.grid.material as THREE.Material).dispose();
      this.ground = null;
    }
  }
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const canvasHost = mustQuery<HTMLElement>('#preview-canvas');
const seedElement = mustQuery<HTMLElement>('#preview-seed');
const segmentsHost = mustQuery<HTMLElement>('#preview-segments');
const requirementsNote = mustQuery<HTMLElement>('#preview-requirements-note');
const regenerateButton = mustQuery<HTMLButtonElement>('#preview-regenerate');
const requirementsSection = mustQuery<HTMLElement>('.preview__requirements');
const requirementsBody = mustQuery<HTMLElement>('#preview-requirements-body');
const randomizeRequirementsButton = mustQuery<HTMLButtonElement>(
  '#preview-randomize-requirements',
);
const collapseRequirementsButton = mustQuery<HTMLButtonElement>(
  '#preview-collapse-requirements',
);
const startButton = mustQuery<HTMLButtonElement>('#preview-start');
const backButton = mustQuery<HTMLButtonElement>('#preview-back');
const rotatePrompt = mustQuery<HTMLElement>('#rotate');
const loading = mustQuery<HTMLElement>('#preview-loading');

type SegmentRule = 'neutral' | 'require' | 'exclude';

const JUMP_KINDS: Piece['kind'][] = ['kicker', 'gap', 'landing'];
const SPIRAL_KINDS: Piece['kind'][] = ['spiral-up', 'spiral-down'];
const RAMP_KINDS: Piece['kind'][] = ['ramp-up', 'ramp-down'];
const STEEP_KINDS: Piece['kind'][] = ['steep-ramp', 'steep-ramp-down'];

const segmentRules = new Map<Piece['kind'], SegmentRule>();
const segmentButtons = new Map<Piece['kind'], HTMLButtonElement>();
const segmentStatuses = new Map<Piece['kind'], HTMLElement>();
const choiceByKind = new Map<Piece['kind'], SegmentChoice>();
const selectableKinds = new Set<Piece['kind']>();
const structuralKinds = new Set<Piece['kind']>();

for (const group of SEGMENT_GROUPS) {
  const section = document.createElement('div');
  section.className = 'preview__segment-group';
  const heading = document.createElement('p');
  heading.className = 'preview__segment-group-title';
  heading.id = `preview-segment-group-${group.title.toLowerCase()}`;
  heading.textContent = group.title;
  section.append(heading);
  const list = document.createElement('div');
  list.className = 'preview__segment-list';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-labelledby', heading.id);
  for (const choice of group.choices) {
    selectableKinds.add(choice.kind);
    choiceByKind.set(choice.kind, choice);
    segmentRules.set(choice.kind, 'neutral');
    if (choice.structural) {
      structuralKinds.add(choice.kind);
    }
    const row = document.createElement(choice.structural ? 'div' : 'button');
    row.className = 'preview__segment';
    row.dataset.kind = choice.kind;
    row.title = choice.note;
    if (choice.structural) {
      row.classList.add('is-always');
      row.dataset.state = 'always';
    } else {
      (row as HTMLButtonElement).type = 'button';
      row.dataset.state = 'neutral';
      row.addEventListener('click', () => cycleRule(choice.kind));
      segmentButtons.set(choice.kind, row as HTMLButtonElement);
    }
    const dot = document.createElement('span');
    dot.className = 'preview__segment-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'preview__segment-label';
    label.textContent = choice.label;
    const status = document.createElement('span');
    status.className = 'preview__segment-status';
    status.setAttribute('aria-hidden', 'true');
    row.append(dot, label, status);
    list.append(row);
    segmentStatuses.set(choice.kind, status);
    updateRuleButton(choice.kind);
  }
  section.append(list);
  segmentsHost.append(section);
}

function updateRuleButton(kind: Piece['kind']): void {
  const button = segmentButtons.get(kind);
  if (!button) {
    return;
  }
  const rule = segmentRules.get(kind) ?? 'neutral';
  const choice = choiceByKind.get(kind);
  button.dataset.state = rule;
  const stateLabel =
    rule === 'require'
      ? 'required'
      : rule === 'exclude'
        ? 'excluded'
        : 'no rule';
  const nextLabel =
    rule === 'neutral'
      ? 'require'
      : rule === 'require'
        ? 'exclude'
        : 'clear the rule';
  button.setAttribute(
    'aria-label',
    `${choice?.label ?? kind}: ${stateLabel}. Activate to ${nextLabel}.`,
  );
  button.title = `${choice?.note ?? ''} Click to cycle: require, exclude, no rule.`;
}

function refreshRuleUi(): void {
  for (const kind of segmentButtons.keys()) {
    updateRuleButton(kind);
  }
}

function selectedRules(): {
  required: Piece['kind'][];
  excluded: Piece['kind'][];
} {
  const required: Piece['kind'][] = [];
  const excluded: Piece['kind'][] = [];
  for (const [kind, rule] of segmentRules) {
    if (structuralKinds.has(kind)) {
      continue;
    }
    if (rule === 'require') {
      required.push(kind);
    } else if (rule === 'exclude') {
      excluded.push(kind);
    }
  }
  return { required, excluded };
}

/**
 * Keep related rules coherent: the jump group, the elevation pairs, and the
 * loop/return pair move together. A bridge needs a loop; a trefoil is a whole
 * layout and clears every other rule.
 */
function normalizeRules(): void {
  for (const kind of structuralKinds) {
    segmentRules.set(kind, 'neutral');
  }
  if (segmentRules.get('multi-crossing') === 'require') {
    for (const kind of segmentRules.keys()) {
      if (kind !== 'multi-crossing') {
        segmentRules.set(kind, 'neutral');
      }
    }
    return;
  }
  // Only the jump group is atomic; elevation pieces are independent so a
  // steep climb can return on spirals, ramps, or another steep descent.
  {
    const active = JUMP_KINDS
      .map((kind) => segmentRules.get(kind))
      .find((rule) => rule !== undefined && rule !== 'neutral');
    if (active) {
      for (const kind of JUMP_KINDS) {
        segmentRules.set(kind, active);
      }
    }
  }

  const loopRule = segmentRules.get('loop');
  const shiftRule = segmentRules.get('shift');
  const loopExcluded = loopRule === 'exclude' || shiftRule === 'exclude';
  if (loopExcluded) {
    segmentRules.set('loop', 'exclude');
    segmentRules.set('shift', 'exclude');
  } else if (loopRule === 'require' || shiftRule === 'require') {
    segmentRules.set('loop', 'require');
    segmentRules.set('shift', 'require');
  } else {
    segmentRules.set('loop', 'neutral');
    segmentRules.set('shift', 'neutral');
  }

  if (segmentRules.get('bridge') === 'require') {
    if (loopExcluded) {
      segmentRules.set('bridge', 'exclude');
    } else {
      segmentRules.set('loop', 'require');
      segmentRules.set('shift', 'require');
      for (const kind of SPIRAL_KINDS) {
        if (segmentRules.get(kind) === 'exclude') {
          segmentRules.set(kind, 'neutral');
        }
      }
      for (const kind of [...RAMP_KINDS, ...STEEP_KINDS]) {
        if (segmentRules.get(kind) === 'require') {
          segmentRules.set(kind, 'exclude');
        }
      }
      if (
        segmentRules.get('hill') === 'require' &&
        JUMP_KINDS.some((kind) => segmentRules.get(kind) === 'require')
      ) {
        segmentRules.set('hill', 'neutral');
      }
    }
  }
}

function applyRule(kind: Piece['kind'], rule: SegmentRule): void {
  if (structuralKinds.has(kind)) {
    return;
  }
  segmentRules.set(kind, rule);
  // The clicked segment decides its group's direction; the URL loader can
  // still normalize mixed rules after parsing.
  if (JUMP_KINDS.includes(kind)) {
    for (const member of JUMP_KINDS) {
      segmentRules.set(member, rule);
    }
  }
  if (kind === 'loop' || kind === 'shift') {
    segmentRules.set('loop', rule);
    segmentRules.set('shift', rule);
    if (rule === 'exclude' && segmentRules.get('bridge') === 'require') {
      segmentRules.set('bridge', 'exclude');
    }
  }
  if (kind === 'bridge' && rule === 'require') {
    segmentRules.set('loop', 'require');
    segmentRules.set('shift', 'require');
    for (const spiral of SPIRAL_KINDS) {
      if (segmentRules.get(spiral) === 'exclude') {
        segmentRules.set(spiral, 'neutral');
      }
    }
    for (const other of [...RAMP_KINDS, ...STEEP_KINDS]) {
      if (segmentRules.get(other) === 'require') {
        segmentRules.set(other, 'exclude');
      }
    }
  }
  if (
    (RAMP_KINDS.includes(kind) || STEEP_KINDS.includes(kind)) &&
    rule === 'require' &&
    segmentRules.get('bridge') === 'require'
  ) {
    segmentRules.set('bridge', 'exclude');
  }
  normalizeRules();
  refreshRuleUi();
  showRules();
  scheduleBuild();
}

function cycleRule(kind: Piece['kind']): void {
  const current = segmentRules.get(kind) ?? 'neutral';
  applyRule(
    kind,
    current === 'neutral'
      ? 'require'
      : current === 'require'
        ? 'exclude'
        : 'neutral',
  );
}

function parseKindList(value: string | null): Piece['kind'][] {
  return (value ?? '')
    .split(',')
    .map((kind) => kind.trim())
    .filter((kind): kind is Piece['kind'] =>
      selectableKinds.has(kind as Piece['kind']),
    );
}

let preview: TrackPreview | null = null;
try {
  preview = new TrackPreview(canvasHost);
} catch (error) {
  console.error('The track preview could not be initialised.', error);
  loading.textContent = 'The track preview needs WebGL.';
  loading.classList.add('is-error');
  regenerateButton.disabled = true;
  randomizeRequirementsButton.disabled = true;
  collapseRequirementsButton.disabled = true;
  startButton.disabled = true;
}

let seed = randomSeed();
let busy = false;
let buildFailed = false;
let requirementsDirty = false;
let hasCircuit = false;
let buildQueued: string | null = null;

// A ?seed= query makes a previewed circuit reproducible, and ?require= /
// ?exclude= keep the segment rules in the link, which is useful for QA and
// reloads.
const initialParams = new URLSearchParams(window.location.search);
const requestedSeed = initialParams.get('seed')?.trim();
if (requestedSeed) {
  seed = requestedSeed;
}
const requestedRequirements = parseKindList(initialParams.get('require'));
const requestedExclusions = parseKindList(initialParams.get('exclude'));
for (const kind of requestedRequirements) {
  segmentRules.set(kind, 'require');
}
for (const kind of requestedExclusions) {
  segmentRules.set(kind, 'exclude');
}
if (requestedRequirements.length > 0 || requestedExclusions.length > 0) {
  normalizeRules();
  refreshRuleUi();
  showRules();
}

function setBusy(value: boolean): void {
  busy = value;
  document.body.classList.toggle('is-building', value);
  regenerateButton.disabled = value;
  randomizeRequirementsButton.disabled = value;
  collapseRequirementsButton.disabled = value;
  startButton.disabled = value || buildFailed || requirementsDirty;
}

function showSeed(next: string): void {
  seed = next;
  seedElement.textContent = next;
  seedElement.title = next;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', next);
  window.history.replaceState(null, '', url);
}

function showRules(): void {
  const { required, excluded } = selectedRules();
  const url = new URL(window.location.href);
  if (required.length > 0) {
    url.searchParams.set('require', required.join(','));
  } else {
    url.searchParams.delete('require');
  }
  if (excluded.length > 0) {
    url.searchParams.set('exclude', excluded.join(','));
  } else {
    url.searchParams.delete('exclude');
  }
  window.history.replaceState(null, '', url);
}

function updateRequirementsNote(
  required: readonly Piece['kind'][],
  excluded: readonly Piece['kind'][],
  circuit: Circuit | null,
): void {
  requirementsNote.classList.remove('is-error');
  if (required.length === 0 && excluded.length === 0) {
    requirementsNote.textContent =
      'Click a segment to require it; click again to exclude it.';
    return;
  }
  if (!circuit) {
    return;
  }
  const present = new Set(circuit.pieces.map((piece) => piece.kind));
  const missing = required.filter((kind) => !present.has(kind));
  const leaked = excluded.filter((kind) => present.has(kind));
  if (missing.length > 0 || leaked.length > 0) {
    const details = [
      ...missing.map((kind) => `missing ${kind}`),
      ...leaked.map((kind) => `unexpected ${kind}`),
    ];
    requirementsNote.textContent = `Rules not met: ${details.join(', ')}`;
    requirementsNote.classList.add('is-error');
    return;
  }
  const parts: string[] = [];
  if (required.length > 0) {
    parts.push(`${required.length} required`);
  }
  if (excluded.length > 0) {
    parts.push(`${excluded.length} excluded`);
  }
  requirementsNote.textContent = `${parts.join(' · ')} · all met.`;
}

function updateSegmentStatuses(circuit: Circuit | null): void {
  const present = new Set(
    circuit?.pieces.map((piece) => piece.kind) ?? [],
  );
  for (const [kind, status] of segmentStatuses) {
    if (structuralKinds.has(kind)) {
      status.textContent = '✓';
      status.dataset.state = 'met';
      continue;
    }
    const rule = segmentRules.get(kind) ?? 'neutral';
    if (rule === 'neutral' || !circuit) {
      status.textContent = '';
      delete status.dataset.state;
      continue;
    }
    const isPresent = present.has(kind);
    const met = rule === 'require' ? isPresent : !isPresent;
    status.textContent = met ? '✓' : '!';
    status.dataset.state = met ? 'met' : 'failed';
  }
}

function build(next: string): void {
  if (!preview) {
    return;
  }
  if (busy) {
    buildQueued = next;
    return;
  }
  buildFailed = false;
  requirementsDirty = false;
  setBusy(true);
  // Let the busy state paint before the synchronous circuit build.
  requestAnimationFrame(() => {
    const { required, excluded } = selectedRules();
    try {
      const circuit = preview?.setSeed(next, required, excluded) ?? null;
      if (!circuit) {
        return;
      }
      hasCircuit = true;
      updateRequirementsNote(required, excluded, circuit);
      updateSegmentStatuses(circuit);
      showSeed(next);
    } catch (error) {
      // A segment rule the player chose is input, not an app fault; keep it
      // out of the console-error channel so offline/e2e checks stay clean.
      console.warn('The track preview could not be built.', error);
      buildFailed = true;
      const message = error instanceof Error ? error.message : 'Track unavailable';
      requirementsNote.textContent =
        message.includes('cannot be combined')
          ? 'Multi-crossing is a whole layout; select it alone.'
          : message.includes('Cannot fit') || message.includes('with rules:')
            ? 'Those rules cannot be fitted together. Clear one or press Randomize.'
            : message;
      requirementsNote.classList.add('is-error');
      updateSegmentStatuses(null);
      if (!hasCircuit) {
        seedElement.textContent = 'Track unavailable';
        loading.textContent = 'Track unavailable';
      }
    } finally {
      setBusy(false);
      if (buildQueued) {
        const queued = buildQueued;
        buildQueued = null;
        build(queued);
      }
    }
  });
}

function scheduleBuild(): void {
  requirementsDirty = true;
  startButton.disabled = true;
  build(seed);
}

/**
 * Pick a compatible mix of require/exclude/neutral rules. A bridge family and
 * a polygon family cannot share every elevation piece, so the randomizer picks
 * one family and excludes the other's pieces explicitly.
 */
function randomRules(): Map<Piece['kind'], SegmentRule> {
  const rules = new Map<Piece['kind'], SegmentRule>();
  for (const kind of selectableKinds) {
    rules.set(kind, 'neutral');
  }
  const set = (kind: Piece['kind'], rule: SegmentRule): void => {
    rules.set(kind, rule);
  };
  const group = (kinds: readonly Piece['kind'][], rule: SegmentRule): void => {
    for (const kind of kinds) {
      rules.set(kind, rule);
    }
  };
  const obstacles = (): void => {
    const roll = Math.random();
    if (roll < 0.34) {
      set('obstacles', 'require');
    } else if (roll < 0.67) {
      set('obstacles', 'exclude');
    }
  };
  const feature = Math.random();
  const chooseHillOrJump = (): void => {
    if (feature < 0.4) {
      set('hill', 'require');
      group(JUMP_KINDS, 'exclude');
    } else if (feature < 0.8) {
      group(JUMP_KINDS, 'require');
      set('hill', 'exclude');
    } else {
      set('hill', 'exclude');
      group(JUMP_KINDS, 'exclude');
    }
  };

  // A trefoil is a whole layout; it cannot coexist with catalog segments.
  if (Math.random() < 0.12) {
    set('multi-crossing', 'require');
    return rules;
  }

  if (Math.random() < 0.5) {
    set('bridge', 'require');
    group(['loop', 'shift'], 'require');
    group(RAMP_KINDS, 'exclude');
    group(STEEP_KINDS, 'exclude');
    chooseHillOrJump();
    obstacles();
    if (Math.random() < 0.4) {
      group(SPIRAL_KINDS, 'require');
    }
    return rules;
  }

  set('bridge', 'exclude');
  const elevation = Math.random();
  const requireOrNeutral = (): SegmentRule =>
    Math.random() < 0.6 ? 'require' : 'neutral';
  if (elevation < 0.25) {
    set('ramp-up', requireOrNeutral());
    set('ramp-down', requireOrNeutral());
    group(SPIRAL_KINDS, 'exclude');
    group(STEEP_KINDS, 'exclude');
  } else if (elevation < 0.45) {
    set('steep-ramp', requireOrNeutral());
    set('steep-ramp-down', requireOrNeutral());
    group(RAMP_KINDS, 'exclude');
    // Leave spirals available so a steep climb can return on two 2-level
    // spirals instead of a matching steep descent.
    if (Math.random() < 0.5) {
      set('spiral-down', 'require');
    }
  } else if (elevation < 0.65) {
    set('spiral-up', requireOrNeutral());
    set('spiral-down', requireOrNeutral());
    group(RAMP_KINDS, 'exclude');
    group(STEEP_KINDS, 'exclude');
  } else {
    group(RAMP_KINDS, 'exclude');
    group(SPIRAL_KINDS, 'exclude');
    group(STEEP_KINDS, 'exclude');
  }
  if (Math.random() < 0.5) {
    group(['loop', 'shift'], 'require');
  } else {
    group(['loop', 'shift'], 'exclude');
  }
  chooseHillOrJump();
  obstacles();
  return rules;
}

regenerateButton.addEventListener('click', () => {
  if (busy) {
    return;
  }
  showRules();
  build(randomSeed());
});

randomizeRequirementsButton.addEventListener('click', () => {
  if (busy) {
    return;
  }
  const rules = randomRules();
  for (const [kind, rule] of rules) {
    segmentRules.set(kind, rule);
  }
  normalizeRules();
  refreshRuleUi();
  showRules();
  scheduleBuild();
});

function setRequirementsCollapsed(collapsed: boolean): void {
  requirementsSection.classList.toggle('is-collapsed', collapsed);
  requirementsBody.hidden = collapsed;
  collapseRequirementsButton.setAttribute(
    'aria-expanded',
    String(!collapsed),
  );
  collapseRequirementsButton.textContent = collapsed ? 'Show' : 'Hide';
}

collapseRequirementsButton.addEventListener('click', () => {
  setRequirementsCollapsed(
    !requirementsSection.classList.contains('is-collapsed'),
  );
});

startButton.addEventListener('click', () => {
  if (busy || buildFailed || requirementsDirty) {
    return;
  }
  const { required, excluded } = selectedRules();
  markPendingRequirements(required);
  markPendingExclusions(excluded);
  markPendingSeed(seed);
  markPendingStart();
  window.location.assign('./game.html');
});

backButton.addEventListener('click', () => {
  window.location.assign('./index.html');
});

function updateRotatePrompt(): void {
  rotatePrompt.setAttribute(
    'aria-hidden',
    String(!window.matchMedia('(orientation: portrait)').matches),
  );
}
window.addEventListener('orientationchange', updateRotatePrompt);
window.addEventListener('resize', updateRotatePrompt);
updateRotatePrompt();

build(seed);
