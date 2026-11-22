import './style.css';
import {
  BEST_TIME_KEY_PREFIX,
  LAPS,
  DEFAULT_LEVEL,
  DEFAULT_OPPONENT_COUNT,
  OPPONENT_COUNT_MAX,
  OPPONENTS_KEY,
  PAINT_KEY,
  CAR_KEY,
} from './game/constants';
import {
  brakeFromKeys,
  HELD_KEYS,
  steerFromKeys,
} from './game/controls';
import { Game, type CameraMode, type RaceSnapshot } from './game/Game';
import { preloadCarModel } from './game/Car';
import { placingLabel } from './game/placing';
import { CARS } from './game/car-spec.mjs';
import { DEFAULT_PAINT, PAINTS, paintById } from './game/palette';
import { randomSeed } from './game/seed';
import { steerFromTilt, tiltDegrees } from './game/tilt';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
const menuBestElement = mustQuery<HTMLElement>('#menu-best');
const speedElement = mustQuery<HTMLElement>('#speed');
const damageElement = mustQuery<HTMLElement>('#damage');
const damageFill = mustQuery<HTMLElement>('#damage-fill');
const pauseButton = mustQuery<HTMLButtonElement>('#pause');
const cameraButton = mustQuery<HTMLButtonElement>('#camera');
const startButton = mustQuery<HTMLButtonElement>('#start');
const installButton = mustQuery<HTMLButtonElement>('#install');
const brakeButton = mustQuery<HTMLButtonElement>('#brake');
const finalTime = mustQuery<HTMLElement>('#final-time');
const finalDamage = mustQuery<HTMLElement>('#final-damage');
const newBest = mustQuery<HTMLElement>('#new-best');
const finalPlacing = mustQuery<HTMLElement>('#final-placing');
const rotatePrompt = mustQuery<HTMLElement>('#rotate');
const paintPicker = mustQuery<HTMLElement>('#paint-picker');
const carPicker = mustQuery<HTMLElement>('#car-picker');
const opponentsValue = mustQuery<HTMLOutputElement>('#opponents-value');
const fewerOpponents = mustQuery<HTMLButtonElement>('#opponents-fewer');
const moreOpponents = mustQuery<HTMLButtonElement>('#opponents-more');

// A fresh circuit every load: the seed is drawn at random, never from the
// date. This first seed builds the track behind the menu and is the one the
// first race runs on; every later start draws another. Best times are kept per
// level so the record survives the new track.
let nextSeed = randomSeed();
const bestKey = `${BEST_TIME_KEY_PREFIX}.${DEFAULT_LEVEL}`;

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

function writePaint(id: string): void {
  try {
    window.localStorage.setItem(PAINT_KEY, id);
  } catch {
    // Persistence is best effort.
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

function writeCar(id: string): void {
  try {
    window.localStorage.setItem(CAR_KEY, id);
  } catch {
    // Persistence is best effort.
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

function writeOpponentCount(count: number): void {
  try {
    window.localStorage.setItem(OPPONENTS_KEY, String(count));
  } catch {
    // Persistence is best effort.
  }
}

let paint = readPaint();
let opponentCount = readOpponentCount();

let best = readBest();
bestElement.textContent = formatTime(best ?? 0);
menuBestElement.textContent = formatTime(best ?? 0);

function setScreen(screen: 'menu' | 'countdown' | 'racing' | 'paused' | 'finished'): void {
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
// Each orientation event nudges the wheel toward the target. Smoothing keeps a
// shaky hand from sawing at the wheel without making the response feel laggy.
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
 * Load the car model before building the scene: a race never starts with an
 * empty car. The start button stays disabled until both the model and the
 * renderer are ready.
 */
async function bootGame(): Promise<void> {
  startButton.disabled = true;
  try {
    // Every car is loaded so rivals can use any catalog model.
    await Promise.all(CARS.map((car) => preloadCarModel(car.id)));
  } catch (error) {
    console.error('The car model could not be loaded.', error);
    startButton.textContent = 'Car model unavailable';
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
        startButton.disabled = true;
        startButton.textContent = message;
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
          menuBestElement.textContent = formatTime(totalTime);
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
    opponentCount,
    carId,
  );
  } catch (error) {
    console.error('WebGL could not be initialised.', error);
    startButton.disabled = true;
    startButton.textContent = 'WebGL unavailable';
    return;
  }

  startButton.disabled = false;
}

void bootGame();

function markPaint(id: string): void {
  for (const swatch of paintPicker.querySelectorAll<HTMLButtonElement>('button[data-paint]')) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.paint === id));
  }
}

function markCar(id: string): void {
  for (const button of carPicker.querySelectorAll<HTMLButtonElement>(
    'button[data-car]',
  )) {
    button.setAttribute('aria-pressed', String(button.dataset.car === id));
  }
}

for (const option of CARS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'car-option';
  button.dataset.car = option.id;
  button.textContent = option.name;
  button.setAttribute('aria-label', option.name);
  button.setAttribute('aria-pressed', String(option.id === carId));
  carPicker.append(button);
}

/**
 * Switch cars: fetch the model, then let the game rebuild the player car. The
 * picker is locked while the new set loads so a race can never start with a
 * half-swapped model.
 */
async function chooseCar(id: string): Promise<void> {
  if (id === carId) {
    return;
  }
  const previous = carId;
  carId = id;
  markCar(id);
  writeCar(id);
  carPicker.setAttribute('aria-busy', 'true');
  startButton.disabled = true;
  for (const button of carPicker.querySelectorAll<HTMLButtonElement>('button')) {
    button.disabled = true;
  }
  try {
    await preloadCarModel(id);
    game?.setPlayerCar(id);
  } catch (error) {
    console.error('The car model could not be loaded.', error);
    carId = previous;
    markCar(previous);
    writeCar(previous);
  } finally {
    carPicker.removeAttribute('aria-busy');
    startButton.disabled = false;
    for (const button of carPicker.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = false;
    }
  }
}

carPicker.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[data-car]',
  );
  if (!button) {
    return;
  }
  void chooseCar(button.dataset.car ?? DEFAULT_CAR);
});

for (const option of PAINTS) {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = option.id === 'stock' ? 'paint paint--stock' : 'paint';
  swatch.dataset.paint = option.id;
  if (option.color !== null) {
    swatch.style.setProperty(
      '--paint',
      `#${option.color.toString(16).padStart(6, '0')}`,
    );
  }
  swatch.title = option.name;
  swatch.setAttribute('aria-label', option.name);
  swatch.setAttribute('aria-pressed', String(option.id === paint.id));
  paintPicker.append(swatch);
}

paintPicker.addEventListener('click', (event) => {
  const swatch = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[data-paint]',
  );
  if (!swatch) {
    return;
  }
  paint = paintById(swatch.dataset.paint);
  markPaint(paint.id);
  writePaint(paint.id);
  game?.setPlayerPaint(paint);
});

function showOpponentCount(): void {
  opponentsValue.textContent = String(opponentCount);
  fewerOpponents.disabled = opponentCount <= 0;
  moreOpponents.disabled = opponentCount >= OPPONENT_COUNT_MAX;
}

function changeOpponentCount(step: number): void {
  opponentCount = Math.min(
    OPPONENT_COUNT_MAX,
    Math.max(0, opponentCount + step),
  );
  showOpponentCount();
  writeOpponentCount(opponentCount);
  game?.setOpponentCount(opponentCount);
}

fewerOpponents.addEventListener('click', () => changeOpponentCount(-1));
moreOpponents.addEventListener('click', () => changeOpponentCount(1));
showOpponentCount();

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
  if (!game) {
    return;
  }
  game.toMenu();
  setScreen('menu');
  exitFullscreen();
}

startButton.addEventListener('click', startRace);
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
brakeButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  setBrake(true);
});
for (const event of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
  brakeButton.addEventListener(event, () => setBrake(false));
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
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
  keySteer = steerFromKeys(keys);
  applySteer(game);
  setBrake(brakeFromKeys(keys));
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

// ---------- Install prompt ----------

let installPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    return;
  }
  await installPrompt.prompt();
  await installPrompt.userChoice.catch(() => undefined);
  installPrompt = null;
  installButton.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
});

// ---------- Service worker ----------

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined);
  });
}
