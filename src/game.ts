import './style.css';
import {
  BEST_TIME_KEY_PREFIX,
  CAR_KEY,
  DEFAULT_LEVEL,
  DEFAULT_OPPONENT_COUNT,
  LAPS,
  OPPONENT_COUNT_MAX,
  OPPONENTS_KEY,
  PAINT_KEY,
} from './game/constants';
import {
  brakeFromKeys,
  driftFromKeys,
  HELD_KEYS,
  steerFromKeys,
} from './game/controls';
import { Game, type CameraMode, type RaceSnapshot } from './game/Game';
import { preloadCarModel } from './game/Car';
import { placingLabel } from './game/placing';
import { CARS } from './game/car-spec.mjs';
import { paintById } from './game/palette';
import { randomSeed } from './game/seed';
import {
  takePendingCounts,
  takePendingCrossovers,
  takePendingExclusions,
  takePendingRequirements,
  takePendingSeed,
  takePendingStart,
} from './game/session';
import { steerFromTilt, tiltDegrees } from './game/tilt';

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const app = mustQuery<HTMLElement>('#app');
const timeElement = mustQuery<HTMLElement>('#time');
const lapElement = mustQuery<HTMLElement>('#lap');
const bestElement = mustQuery<HTMLElement>('#best');
const speedElement = mustQuery<HTMLElement>('#speed');
const damageElement = mustQuery<HTMLElement>('#damage');
const damageFill = mustQuery<HTMLElement>('#damage-fill');
const pauseButton = mustQuery<HTMLButtonElement>('#pause');
const cameraButton = mustQuery<HTMLButtonElement>('#camera');
const brakeButton = mustQuery<HTMLButtonElement>('#brake');
const driftButton = mustQuery<HTMLButtonElement>('#drift');
const finalTime = mustQuery<HTMLElement>('#final-time');
const finalDamage = mustQuery<HTMLElement>('#final-damage');
const newBest = mustQuery<HTMLElement>('#new-best');
const finalPlacing = mustQuery<HTMLElement>('#final-placing');
const rotatePrompt = mustQuery<HTMLElement>('#rotate');

// A fresh circuit every load: the seed is drawn at random, never from the
// date. A previewed seed replaces this one when the player starts from the
// track preview. Best times are kept per level so the record survives the new
// track.
let nextSeed = randomSeed();
const bestKey = `${BEST_TIME_KEY_PREFIX}.${DEFAULT_LEVEL}`;

const DEFAULT_PAINT = paintById(undefined);

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--.-';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest
    .toFixed(1)
    .padStart(4, '0')}`;
}

function readBest(): number | null {
  try {
    const raw = window.localStorage.getItem(bestKey);
    const value = raw === null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeBest(value: number): void {
  try {
    window.localStorage.setItem(bestKey, value.toFixed(2));
  } catch {
    // Persistence is best effort.
  }
}

function readPaint() {
  try {
    return paintById(window.localStorage.getItem(PAINT_KEY));
  } catch {
    return DEFAULT_PAINT;
  }
}

const DEFAULT_CAR = CARS[0]!.id;

function readCar(): string {
  try {
    const stored = window.localStorage.getItem(CAR_KEY);
    return CARS.some((car) => car.id === stored) ? stored! : DEFAULT_CAR;
  } catch {
    return DEFAULT_CAR;
  }
}

function readOpponentCount(): number {
  try {
    const raw = window.localStorage.getItem(OPPONENTS_KEY);
    const value = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(value)
      ? Math.min(OPPONENT_COUNT_MAX, Math.max(0, value))
      : DEFAULT_OPPONENT_COUNT;
  } catch {
    return DEFAULT_OPPONENT_COUNT;
  }
}

let paint = readPaint();

let best = readBest();
bestElement.textContent = formatTime(best ?? 0);

function setScreen(screen: 'countdown' | 'racing' | 'paused' | 'finished' | 'menu'): void {
  document.body.dataset.screen = screen;
  rotatePrompt.setAttribute('aria-hidden', String(!isPortrait()));
}

function isPortrait(): boolean {
  return window.matchMedia('(orientation: portrait)').matches;
}

// ---------- Fullscreen ----------

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function enterFullscreen(): void {
  if (fullscreenElement()) {
    return;
  }
  const root = document.documentElement as FullscreenElement;
  const request =
    root.requestFullscreen?.bind(root) ??
    root.webkitRequestFullscreen?.bind(root);
  try {
    const result = request?.();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // Fullscreen is a progressive enhancement; the race still runs without it.
  }
}

// The Start button lives on the menu page, and navigating here drops the
// click's user activation, so fullscreen cannot engage in that same gesture.
// Re-request it on the first interaction with the race page. This is a
// one-shot listener: pausing/resuming re-enters fullscreen from its own clicks.
let fullscreenArmed = false;
function armFullscreenOnGesture(): void {
  if (fullscreenArmed || fullscreenElement()) {
    return;
  }
  fullscreenArmed = true;
  for (const kind of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(kind, () => {
      fullscreenArmed = false;
      if (
        document.body.dataset.screen === 'racing' ||
        document.body.dataset.screen === 'countdown'
      ) {
        enterFullscreen();
      }
    });
  }
}

function exitFullscreen(): void {
  if (!fullscreenElement()) {
    return;
  }
  const doc = document as FullscreenDocument;
  const exit =
    doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
  try {
    const result = exit?.();
    if (result instanceof Promise) {
      void result.catch(() => undefined);
    }
  } catch {
    // The browser may have already dropped fullscreen.
  }
}

let tiltEnabled = false;
let tiltListening = false;
let tiltNeutral: number | null = null;
let tiltValue = 0;
let keySteer = 0;

const TILT_DEAD_ZONE = 3;
const TILT_FULL_LOCK = 25;
const TILT_SMOOTHING = 0.35;

function screenAngleDegrees(): number {
  const angle = window.screen.orientation?.angle;
  if (typeof angle === 'number') {
    return angle;
  }
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === 'number' ? ((legacy % 360) + 360) % 360 : 0;
}

function applySteer(game: Game | null): void {
  if (!game) {
    return;
  }
  const tilt = tiltEnabled ? tiltValue : 0;
  game.setSteer(Math.max(-1, Math.min(1, tilt + keySteer)));
}

function resetTilt(): void {
  tiltNeutral = null;
  tiltValue = 0;
  applySteer(game);
}

function handleOrientation(event: DeviceOrientationEvent): void {
  if (!tiltEnabled || event.beta === null || event.gamma === null) {
    return;
  }
  const angle = tiltDegrees(event.beta, event.gamma, screenAngleDegrees());
  if (angle === null) {
    return;
  }
  if (tiltNeutral === null) {
    tiltNeutral = angle;
    return;
  }
  const target = steerFromTilt(
    angle,
    tiltNeutral,
    TILT_DEAD_ZONE,
    TILT_FULL_LOCK,
  );
  tiltValue += (target - tiltValue) * TILT_SMOOTHING;
  applySteer(game);
}

async function enableTilt(): Promise<void> {
  if (tiltEnabled) {
    return;
  }
  try {
    const orientation = DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
    if (typeof orientation.requestPermission === 'function') {
      const result = await orientation.requestPermission();
      if (result !== 'granted') {
        tiltEnabled = false;
        return;
      }
    }
    tiltEnabled = true;
    if (!tiltListening) {
      window.addEventListener('deviceorientation', handleOrientation);
      tiltListening = true;
    }
  } catch {
    tiltEnabled = false;
  }
}

let game: Game | null = null;
let carId = readCar();

/**
 * Boot the race. The menu is a separate page, so the car models are loaded here
 * before the scene is built and the race starts immediately (the menu set a
 * pending-start flag). A previewed seed, when present, makes the first race use
 * the exact circuit the player just previewed. A direct load of game.html
 * without that flag falls back to the menu page rather than racing on its own.
 */
async function bootGame(): Promise<void> {
  // Read the preview handoff before the start flag so stale values are
  // consumed even when this load is not a real race start. Requirements only
  // apply when there is a previewed seed; a normal menu start ignores them.
  const previewSeed = takePendingSeed();
  const pendingRequirements = takePendingRequirements();
  const pendingExclusions = takePendingExclusions();
  const pendingCounts = takePendingCounts();
  const pendingCrossovers = takePendingCrossovers();
  const previewRequirements = previewSeed ? pendingRequirements : [];
  const previewExclusions = previewSeed ? pendingExclusions : [];
  const previewCounts = previewSeed ? pendingCounts : {};
  const previewCrossovers = previewSeed ? pendingCrossovers : null;
  // A direct load or refresh of game.html has no race to show. Leave for the
  // menu before loading models or building the scene, so the redirect happens
  // immediately instead of after a full boot. The menu sets the pending-start
  // flag just before it navigates here.
  if (!takePendingStart()) {
    window.location.replace('./index.html');
    return;
  }
  if (previewSeed) {
    nextSeed = previewSeed;
  }

  try {
    // Every car is loaded so rivals can use any catalog model.
    await Promise.all(CARS.map((car) => preloadCarModel(car.id)));
  } catch (error) {
    // The race has no menu of its own; fall back to the menu page.
    console.error('The car model could not be loaded.', error);
    try {
      window.location.replace('./index.html');
    } catch {
      // Navigation is best-effort on a failing model load.
    }
    return;
  }

  try {
    game = new Game(
      app,
      {
        onSnapshot: (snapshot: RaceSnapshot) => {
          timeElement.textContent = formatTime(snapshot.totalTime);
          lapElement.textContent = `${Math.min(snapshot.lap, LAPS)} / ${LAPS}`;
          speedElement.textContent = String(Math.round(snapshot.speed * 3.6));
          const damage = Math.round(snapshot.damage);
          damageFill.style.width = `${damage}%`;
          damageElement.setAttribute('aria-valuenow', String(damage));
          damageElement.classList.toggle('is-heavy', damage > 60);
          if (snapshot.state !== document.body.dataset.screen) {
            setScreen(snapshot.state);
          }
        },
        onPhysicsError: (message: string) => {
          // The race has no menu of its own; send the player back to the menu
          // page when the physics engine cannot start.
          console.error(message);
          try {
            window.location.replace('./index.html');
          } catch {
            // Very defensive: navigation is best-effort on a failing engine.
          }
        },
        onFinish: (
          totalTime: number,
          damage: number,
          placing: number,
          fieldSize: number,
        ) => {
          finalTime.textContent = formatTime(totalTime);
          finalDamage.textContent = `${Math.round(damage)}%`;
          finalPlacing.textContent = placingLabel(placing, fieldSize);
          const improved = best === null || totalTime < best;
          newBest.hidden = !improved;
          if (improved) {
            best = totalTime;
            writeBest(totalTime);
            bestElement.textContent = formatTime(totalTime);
          }
          setScreen('finished');
          exitFullscreen();
          document
            .querySelector<HTMLButtonElement>('[data-overlay="finished"] .button--primary')
            ?.focus({ preventScroll: true });
        },
      },
      nextSeed,
      paint,
      readOpponentCount(),
      carId,
      previewRequirements,
      previewExclusions,
      previewCounts,
      previewCrossovers ?? undefined,
    );
  } catch (error) {
    console.error('WebGL could not be initialised.', error);
    try {
      window.location.replace('./index.html');
    } catch {
      // Navigation is best-effort on a failing renderer.
    }
    return;
  }

  startRace();
}

function startRace(): void {
  if (!game) {
    return;
  }
  newBest.hidden = true;
  void enableTilt();
  // A new track for every race, not just every load.
  game.startRace(nextSeed);
  nextSeed = randomSeed();
  keySteer = 0;
  resetTilt();
  setScreen('countdown');
  enterFullscreen();
  armFullscreenOnGesture();
}

function pauseRace(): void {
  if (!game) {
    return;
  }
  game.pause();
  setScreen('paused');
  exitFullscreen();
}

function resumeRace(): void {
  if (!game) {
    return;
  }
  game.resume();
  setScreen('racing');
  enterFullscreen();
}

function showMenu(): void {
  exitFullscreen();
  window.location.assign('./index.html');
}

pauseButton.addEventListener('click', () => {
  if (document.body.dataset.screen === 'racing') {
    pauseRace();
  }
});
cameraButton.addEventListener('click', () => {
  game?.toggleCamera();
  cameraButton.setAttribute(
    'aria-label',
    game?.snapshot.camera === 'cockpit'
      ? 'Switch to chase camera'
      : 'Switch to cockpit camera',
  );
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', () => {
    switch (button.dataset.action) {
      case 'resume':
        resumeRace();
        break;
      case 'restart':
        startRace();
        break;
      case 'menu':
        showMenu();
        break;
      default:
        break;
    }
  });
}

const setBrake = (active: boolean) => game?.setBrake(active);
const setDrift = (active: boolean) => game?.setDrift(active);

/** Hold-to-activate control for the brake and drift buttons. */
for (const [button, set] of [
  [brakeButton, setBrake],
  [driftButton, setDrift],
] as const) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    set(true);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    button.addEventListener(event, () => set(false));
  }
}

const keys = new Set<string>();
window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if ((HELD_KEYS as readonly string[]).includes(event.key.toLowerCase())) {
    event.preventDefault();
  }
  if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    if (document.body.dataset.screen === 'racing') {
      pauseRace();
    } else if (document.body.dataset.screen === 'paused') {
      resumeRace();
    }
  }
  if (event.key === 'c' || event.key === 'C') {
    game?.toggleCamera();
    const camera: CameraMode | undefined = game?.snapshot.camera;
    cameraButton.setAttribute(
      'aria-label',
      camera === 'cockpit' ? 'Switch to chase camera' : 'Switch to cockpit camera',
    );
  }
  keySteer = steerFromKeys(keys);
  applySteer(game);
  setBrake(brakeFromKeys(keys));
  setDrift(driftFromKeys(keys));
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
  keySteer = steerFromKeys(keys);
  applySteer(game);
  setBrake(brakeFromKeys(keys));
  setDrift(driftFromKeys(keys));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && document.body.dataset.screen === 'racing') {
    pauseRace();
  }
});

// The browser's own Escape handling leaves fullscreen without delivering a
// keydown, so treat any fullscreen exit during a race as a pause request.
function handleFullscreenChange(): void {
  if (!fullscreenElement() && document.body.dataset.screen === 'racing') {
    pauseRace();
  }
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

window.addEventListener('orientationchange', () => {
  rotatePrompt.setAttribute('aria-hidden', String(!isPortrait()));
  // The screen frame changed, so the neutral roll has to be learned again.
  resetTilt();
  if (isPortrait() && document.body.dataset.screen === 'racing') {
    pauseRace();
  }
});
rotatePrompt.setAttribute('aria-hidden', String(!isPortrait()));

void bootGame();

// ---------- Service worker ----------

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        updateViaCache: 'none',
      })
      .catch(() => undefined);
  });
}