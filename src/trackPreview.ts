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
  markPendingCounts,
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
    minimumCounts: Partial<Record<Piece['kind'], number>> = {},
  ): Circuit {
    const circuit = generateCircuit(seed, DEFAULT_LEVEL, {
      allowMultiCrossing: true,
      minimumCounts,
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
const segmentsHost = mustQuery<HTMLTableSectionElement>('#preview-segments');
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

type SegmentCount = number | null;

const JUMP_KINDS: Piece['kind'][] = ['kicker', 'gap', 'landing'];
const SPIRAL_KINDS: Piece['kind'][] = ['spiral-up', 'spiral-down'];
const RAMP_KINDS: Piece['kind'][] = ['ramp-up', 'ramp-down'];
const STEEP_KINDS: Piece['kind'][] = ['steep-ramp', 'steep-ramp-down'];
const COUNT_OPTIONS: SegmentCount[] = [null, 0, 1, 2, 3, 4, 5];

const segmentCounts = new Map<Piece['kind'], SegmentCount>();
const segmentSelects = new Map<Piece['kind'], HTMLSelectElement>();
const segmentStatuses = new Map<Piece['kind'], HTMLElement>();
const choiceByKind = new Map<Piece['kind'], SegmentChoice>();
const selectableKinds = new Set<Piece['kind']>();
const structuralKinds = new Set<Piece['kind']>();

function countToOption(value: SegmentCount): string {
  return value === null ? 'none' : String(value);
}

function optionToCount(value: string): SegmentCount {
  if (value === 'none') {
    return null;
  }
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null;
}

function countState(value: SegmentCount): 'neutral' | 'exclude' | 'require' {
  return value === null ? 'neutral' : value === 0 ? 'exclude' : 'require';
}

for (const group of SEGMENT_GROUPS) {
  const groupRow = document.createElement('tr');
  groupRow.className = 'preview__segment-group';
  const groupCell = document.createElement('th');
  groupCell.colSpan = 3;
  groupCell.textContent = group.title;
  groupRow.append(groupCell);
  segmentsHost.append(groupRow);

  for (const choice of group.choices) {
    selectableKinds.add(choice.kind);
    choiceByKind.set(choice.kind, choice);
    segmentCounts.set(choice.kind, null);
    if (choice.structural) {
      structuralKinds.add(choice.kind);
    }
    const row = document.createElement('tr');
    row.className = 'preview__segment-row';
    row.dataset.kind = choice.kind;
    row.title = choice.note;
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = choice.label;
    const minCell = document.createElement('td');
    const now = document.createElement('td');
    now.className = 'preview__segment-now';
    now.textContent = '–';
    if (choice.structural) {
      row.classList.add('is-always');
      minCell.className = 'preview__segment-always';
      minCell.textContent = 'Always';
    } else {
      const select = document.createElement('select');
      select.className = 'preview__segment-count';
      select.setAttribute('aria-label', `Minimum ${choice.label} count`);
      for (const option of COUNT_OPTIONS) {
        const element = document.createElement('option');
        element.value = countToOption(option);
        element.textContent = option === null ? 'No' : String(option);
        select.append(element);
      }
      select.value = 'none';
      select.addEventListener('change', () => {
        applyCount(choice.kind, optionToCount(select.value));
      });
      minCell.append(select);
      segmentSelects.set(choice.kind, select);
    }
    row.append(name, minCell, now);
    segmentsHost.append(row);
    segmentStatuses.set(choice.kind, now);
    updateCountSelect(choice.kind);
  }
}

function updateCountSelect(kind: Piece['kind']): void {
  const select = segmentSelects.get(kind);
  if (!select) {
    return;
  }
  const value = segmentCounts.get(kind) ?? null;
  select.value = countToOption(value);
  select.dataset.state = countState(value);
  const choice = choiceByKind.get(kind);
  select.title = `${choice?.note ?? ''} No = seed choice, 0 = exclude, N = minimum count.`;
}

function refreshCountUi(): void {
  for (const kind of segmentSelects.keys()) {
    updateCountSelect(kind);
  }
}

function selectedCounts(): Partial<Record<Piece['kind'], number>> {
  const counts: Partial<Record<Piece['kind'], number>> = {};
  for (const [kind, value] of segmentCounts) {
    if (!structuralKinds.has(kind) && value !== null) {
      counts[kind] = value;
    }
  }
  return counts;
}

function setCount(kind: Piece['kind'], value: SegmentCount): void {
  if (structuralKinds.has(kind)) {
    return;
  }
  segmentCounts.set(kind, value);
  if (JUMP_KINDS.includes(kind)) {
    for (const member of JUMP_KINDS) {
      segmentCounts.set(member, value);
    }
  }
  if (kind === 'loop' || kind === 'shift') {
    segmentCounts.set('loop', value);
    segmentCounts.set('shift', value);
    if (value === 0 && (segmentCounts.get('bridge') ?? 0) > 0) {
      segmentCounts.set('bridge', 0);
    }
  }
  if (kind === 'bridge' && value !== null && value > 0) {
    if ((segmentCounts.get('loop') ?? 0) <= 0) {
      segmentCounts.set('loop', 1);
      segmentCounts.set('shift', 1);
    }
    for (const other of [...RAMP_KINDS, ...STEEP_KINDS]) {
      if ((segmentCounts.get(other) ?? 0) > 0) {
        segmentCounts.set(other, 0);
      }
    }
  }
  if (
    (RAMP_KINDS.includes(kind) || STEEP_KINDS.includes(kind)) &&
    value !== null &&
    value > 0 &&
    (segmentCounts.get('bridge') ?? 0) > 0
  ) {
    segmentCounts.set('bridge', 0);
  }
  if (kind === 'multi-crossing' && value !== null && value > 0) {
    for (const other of segmentCounts.keys()) {
      if (other !== 'multi-crossing') {
        segmentCounts.set(other, null);
      }
    }
  }
  normalizeCounts();
  refreshCountUi();
  showCounts();
  scheduleBuild();
}

function normalizeCounts(): void {
  for (const kind of structuralKinds) {
    segmentCounts.set(kind, null);
  }
  const multi = segmentCounts.get('multi-crossing') ?? null;
  if (multi !== null && multi > 0) {
    for (const kind of segmentCounts.keys()) {
      if (kind !== 'multi-crossing') {
        segmentCounts.set(kind, null);
      }
    }
    return;
  }

  const jumpActive = JUMP_KINDS
    .map((kind) => segmentCounts.get(kind))
    .find((value) => value !== null);
  if (jumpActive !== undefined) {
    for (const kind of JUMP_KINDS) {
      segmentCounts.set(kind, jumpActive);
    }
  }

  const loop = segmentCounts.get('loop') ?? null;
  const shift = segmentCounts.get('shift') ?? null;
  const loopActive = loop !== null ? loop : shift;
  if (loopActive !== null) {
    segmentCounts.set('loop', loopActive);
    segmentCounts.set('shift', loopActive);
  } else {
    segmentCounts.set('loop', null);
    segmentCounts.set('shift', null);
  }

  const bridge = segmentCounts.get('bridge') ?? null;
  if (bridge !== null && bridge > 0) {
    if ((segmentCounts.get('loop') ?? 0) <= 0) {
      segmentCounts.set('loop', 1);
      segmentCounts.set('shift', 1);
    }
    for (const kind of [...RAMP_KINDS, ...STEEP_KINDS]) {
      if ((segmentCounts.get(kind) ?? 0) > 0) {
        segmentCounts.set(kind, 0);
      }
    }
    if (
      (segmentCounts.get('hill') ?? 0) > 0 &&
      JUMP_KINDS.some((kind) => (segmentCounts.get(kind) ?? 0) > 0)
    ) {
      segmentCounts.set('hill', null);
    }
  }
}

function applyCount(kind: Piece['kind'], value: SegmentCount): void {
  if (structuralKinds.has(kind)) {
    return;
  }
  setCount(kind, value);
}

function parseCountEntries(
  value: string | null,
): { kind: Piece['kind']; count: number }[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [rawKind, rawCount] = entry.split(':');
      const kind = rawKind as Piece['kind'];
      if (!selectableKinds.has(kind)) {
        return [];
      }
      const count = rawCount === undefined ? 1 : Number(rawCount);
      if (!Number.isFinite(count) || count < 0) {
        return [];
      }
      return [{ kind, count: Math.floor(count) }];
    });
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
// reloads. require entries may carry a count, e.g. require=spiral-down:2.
const initialParams = new URLSearchParams(window.location.search);
const requestedSeed = initialParams.get('seed')?.trim();
if (requestedSeed) {
  seed = requestedSeed;
}
const requestedRequirements = parseCountEntries(initialParams.get('require'));
const requestedExclusions = parseCountEntries(initialParams.get('exclude'));
for (const { kind, count } of requestedRequirements) {
  segmentCounts.set(kind, count);
}
for (const { kind } of requestedExclusions) {
  segmentCounts.set(kind, 0);
}
if (requestedRequirements.length > 0 || requestedExclusions.length > 0) {
  normalizeCounts();
  refreshCountUi();
  showCounts();
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

function showCounts(): void {
  const counts = selectedCounts();
  const required: string[] = [];
  const excluded: string[] = [];
  for (const [kind, count] of Object.entries(counts) as [
    Piece['kind'],
    number,
  ][]) {
    if (count === 0) {
      excluded.push(kind);
    } else {
      required.push(count === 1 ? kind : `${kind}:${count}`);
    }
  }
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
  counts: Partial<Record<Piece['kind'], number>>,
  circuit: Circuit | null,
): void {
  requirementsNote.classList.remove('is-error');
  const entries = Object.entries(counts) as [Piece['kind'], number][];
  if (entries.length === 0) {
    requirementsNote.textContent =
      'Set a minimum count; No leaves it to the seed, 0 excludes it.';
    return;
  }
  if (!circuit) {
    return;
  }
  const actual = new Map<Piece['kind'], number>();
  for (const piece of circuit.pieces) {
    actual.set(piece.kind, (actual.get(piece.kind) ?? 0) + 1);
  }
  const failures: string[] = [];
  for (const [kind, minimum] of entries) {
    const count = actual.get(kind) ?? 0;
    if (minimum === 0 && count !== 0) {
      failures.push(`${kind} should be 0, found ${count}`);
    } else if (minimum > 0 && count < minimum) {
      failures.push(`${kind} ${count}/${minimum}`);
    }
  }
  if (failures.length > 0) {
    requirementsNote.textContent = `Rules not met: ${failures.join(', ')}`;
    requirementsNote.classList.add('is-error');
    return;
  }
  requirementsNote.textContent = `${entries.length} rule${
    entries.length === 1 ? '' : 's'
  } · all met.`;
}

function updateSegmentStatuses(circuit: Circuit | null): void {
  const actual = new Map<Piece['kind'], number>();
  for (const piece of circuit?.pieces ?? []) {
    actual.set(piece.kind, (actual.get(piece.kind) ?? 0) + 1);
  }
  for (const [kind, status] of segmentStatuses) {
    if (!circuit) {
      status.textContent = '–';
      delete status.dataset.state;
      continue;
    }
    const count = actual.get(kind) ?? 0;
    status.textContent = String(count);
    if (structuralKinds.has(kind)) {
      status.dataset.state = 'neutral';
      continue;
    }
    const minimum = segmentCounts.get(kind) ?? null;
    if (minimum === null) {
      status.dataset.state = 'neutral';
      continue;
    }
    const met = minimum === 0 ? count === 0 : count >= minimum;
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
    const counts = selectedCounts();
    try {
      const circuit = preview?.setSeed(next, counts) ?? null;
      if (!circuit) {
        return;
      }
      hasCircuit = true;
      updateRequirementsNote(counts, circuit);
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
            ? 'Those rules cannot be fitted together. Change one or press Randomize.'
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

function randomCounts(): Partial<Record<Piece['kind'], number>> {
  const counts: Partial<Record<Piece['kind'], number>> = {};
  const set = (kind: Piece['kind'], value: number): void => {
    counts[kind] = value;
  };
  const elevationCount = (): number => (Math.random() < 0.5 ? 1 : 2);
  const obstacles = (): void => {
    const roll = Math.random();
    if (roll < 0.34) {
      set('obstacles', 1);
    } else if (roll < 0.67) {
      set('obstacles', 0);
    }
  };
  const feature = Math.random();
  const chooseHillOrJump = (): void => {
    if (feature < 0.4) {
      set('hill', 1);
      for (const kind of JUMP_KINDS) set(kind, 0);
    } else if (feature < 0.8) {
      for (const kind of JUMP_KINDS) set(kind, 1);
      set('hill', 0);
    } else {
      set('hill', 0);
      for (const kind of JUMP_KINDS) set(kind, 0);
    }
  };

  if (Math.random() < 0.12) {
    set('multi-crossing', 1);
    return counts;
  }

  if (Math.random() < 0.5) {
    set('bridge', 1);
    set('loop', 1);
    set('shift', 1);
    for (const kind of [...RAMP_KINDS, ...STEEP_KINDS]) set(kind, 0);
    chooseHillOrJump();
    obstacles();
    if (Math.random() < 0.4) {
      set('spiral-up', 1);
      set('spiral-down', 1);
    }
    return counts;
  }

  set('bridge', 0);
  const elevation = Math.random();
  if (elevation < 0.25) {
    set('ramp-up', elevationCount());
    set('ramp-down', elevationCount());
    for (const kind of [...SPIRAL_KINDS, ...STEEP_KINDS]) set(kind, 0);
  } else if (elevation < 0.45) {
    set('steep-ramp', elevationCount());
    set('steep-ramp-down', elevationCount());
    for (const kind of RAMP_KINDS) set(kind, 0);
    if (Math.random() < 0.5) {
      set('spiral-down', elevationCount());
    }
  } else if (elevation < 0.65) {
    set('spiral-up', elevationCount());
    set('spiral-down', elevationCount());
    for (const kind of [...RAMP_KINDS, ...STEEP_KINDS]) set(kind, 0);
  } else {
    for (const kind of [...RAMP_KINDS, ...SPIRAL_KINDS, ...STEEP_KINDS]) {
      set(kind, 0);
    }
  }
  const loop = Math.random() < 0.5 ? 1 : 0;
  set('loop', loop);
  set('shift', loop);
  chooseHillOrJump();
  obstacles();
  return counts;
}

regenerateButton.addEventListener('click', () => {
  if (busy) {
    return;
  }
  showCounts();
  build(randomSeed());
});

randomizeRequirementsButton.addEventListener('click', () => {
  if (busy) {
    return;
  }
  const counts = randomCounts();
  for (const kind of selectableKinds) {
    segmentCounts.set(kind, counts[kind] ?? null);
  }
  normalizeCounts();
  refreshCountUi();
  showCounts();
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
  markPendingCounts(selectedCounts());
  markPendingRequirements([]);
  markPendingExclusions([]);
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
