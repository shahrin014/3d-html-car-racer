import './style.css';
import {
  DEFAULT_LEVEL,
  DEFAULT_OPPONENT_COUNT,
  OPPONENT_COUNT_MAX,
  OPPONENTS_KEY,
  PAINT_KEY,
  CAR_KEY,
  BEST_TIME_KEY_PREFIX,
} from './game/constants';
import { preloadCarModel } from './game/car-runtime.mjs';
import { CARS } from './game/car-spec.mjs';
import { DEFAULT_PAINT, PAINTS, paintById, type Paint } from './game/palette';
import { clearPendingSeed, markPendingStart } from './game/session';
import { CarPreview } from './menuCarousel';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const CAR_MODELS = `${import.meta.env.BASE_URL}models/`;

function readPaint(): Paint {
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

const bestKey = `${BEST_TIME_KEY_PREFIX}.${DEFAULT_LEVEL}`;
function readBest(): number | null {
  try {
    const raw = window.localStorage.getItem(bestKey);
    const value = raw === null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isPortrait(): boolean {
  return window.matchMedia('(orientation: portrait)').matches;
}

const startButton = mustQuery<HTMLButtonElement>('#start');
const previewButton = mustQuery<HTMLButtonElement>('#preview-track');
const installButton = mustQuery<HTMLButtonElement>('#install');
const menuBestElement = mustQuery<HTMLElement>('#menu-best');
const rotatePrompt = mustQuery<HTMLElement>('#rotate');
const paintPicker = mustQuery<HTMLElement>('#paint-picker');
const carPicker = mustQuery<HTMLElement>('#car-picker');
const carPreviewEl = mustQuery<HTMLElement>('#car-preview');
const carName = mustQuery<HTMLElement>('#car-name');
const carDots = mustQuery<HTMLElement>('#car-dots');
const carPrev = mustQuery<HTMLButtonElement>('#car-prev');
const carNext = mustQuery<HTMLButtonElement>('#car-next');
const opponentsValue = mustQuery<HTMLOutputElement>('#opponents-value');
const fewerOpponents = mustQuery<HTMLButtonElement>('#opponents-fewer');
const moreOpponents = mustQuery<HTMLButtonElement>('#opponents-more');

menuBestElement.textContent = formatTime(readBest() ?? 0);

let paint = readPaint();
let carId = readCar();
let opponentCount = readOpponentCount();

function markPaint(id: string): void {
  for (const swatch of paintPicker.querySelectorAll<HTMLButtonElement>('button[data-paint]')) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.paint === id));
  }
}

function setCarControlsDisabled(disabled: boolean): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '.cars button',
  )) {
    button.disabled = disabled;
  }
}

/** Show one car in the carousel: name, the active dot, and the live preview. */
function showCar(id: string): void {
  const option = CARS.find((car) => car.id === id) ?? CARS[0]!;
  carName.textContent = option.name;
  for (const dot of carDots.querySelectorAll<HTMLButtonElement>('button')) {
    dot.setAttribute('aria-pressed', String(dot.dataset.car === option.id));
  }
}

for (const option of CARS) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.dataset.car = option.id;
  dot.setAttribute('aria-label', option.name);
  dot.setAttribute('aria-pressed', String(option.id === carId));
  carDots.append(dot);
}

let busy = false;

/** Switch cars: fetch the model, then show it in the preview. */
async function chooseCar(id: string): Promise<void> {
  if (id === carId || busy) {
    return;
  }
  const previous = carId;
  carId = id;
  showCar(id);
  writeCar(id);
  carPicker.setAttribute('aria-busy', 'true');
  busy = true;
  startButton.disabled = true;
  setCarControlsDisabled(true);
  try {
    await preview.setCar(id);
  } catch (error) {
    console.error('The car model could not be loaded.', error);
    carId = previous;
    showCar(previous);
    writeCar(previous);
  } finally {
    carPicker.removeAttribute('aria-busy');
    busy = false;
    startButton.disabled = false;
    setCarControlsDisabled(false);
  }
}

function stepCar(delta: number): void {
  const index = Math.max(0, CARS.findIndex((car) => car.id === carId));
  const next = CARS[(index + delta + CARS.length) % CARS.length]!;
  void chooseCar(next.id);
}

carPrev.addEventListener('click', () => stepCar(-1));
carNext.addEventListener('click', () => stepCar(1));
carDots.addEventListener('click', (event) => {
  const dot = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[data-car]',
  );
  if (dot) {
    void chooseCar(dot.dataset.car ?? DEFAULT_CAR);
  }
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
  preview.setPaint(paint);
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
}

fewerOpponents.addEventListener('click', () => changeOpponentCount(-1));
moreOpponents.addEventListener('click', () => changeOpponentCount(1));
showOpponentCount();

// The pending-start flag hands the chosen car, paint, and opponents to the race
// page; those are already persisted, so the flag only tells game.html to skip
// its own menu and start immediately. A stale previewed seed is dropped so a
// normal start always draws a fresh circuit.
startButton.addEventListener('click', () => {
  if (startButton.disabled) {
    return;
  }
  clearPendingSeed();
  markPendingStart();
  window.location.assign('./game.html');
});

previewButton.addEventListener('click', () => {
  window.location.assign('./track.html');
});

// ---------- Car preview ----------

const preview = new CarPreview(carPreviewEl, paint, carId);
showCar(carId);
// The menu needs the stored car (and its paint) visible before the player can
// race, exactly like the old boot gating the Start button on the loaded model.
startButton.disabled = true;
preloadCarModel(CAR_MODELS, carId)
  .then(() => {
    startButton.disabled = false;
    return preview.setCar(carId);
  })
  .catch((error: unknown) => {
    console.error('The car model could not be loaded.', error);
    startButton.textContent = 'Car model unavailable';
  });

// ---------- Rotate prompt ----------

function updateRotatePrompt(): void {
  rotatePrompt.setAttribute('aria-hidden', String(!isPortrait()));
}
window.addEventListener('orientationchange', updateRotatePrompt);
window.addEventListener('resize', updateRotatePrompt);
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
  // Whether this page was already controlled before the update check. On a
  // first visit there is no previous worker, so taking control is not an
  // update and must not reload the page.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  // The worker now calls skipWaiting, so a new deployment takes control while
  // the menu is open. Reload once so the live car preview fetches the new
  // model and paint mask instead of the previous deployment's cached files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || document.body.dataset.screen !== 'menu') {
      return;
    }
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        updateViaCache: 'none',
      })
      .catch(() => undefined);
  });
}