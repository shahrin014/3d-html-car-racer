import './style.css';
import { BEST_SCORE_KEY, STARTING_HEARTS } from './game/constants';
import { Game, type RunResult } from './game/Game';

type Screen = 'menu' | 'playing' | 'paused' | 'over';

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

const app = mustQuery<HTMLElement>('#app');
const scoreElement = mustQuery<HTMLElement>('#score');
const bestElement = mustQuery<HTMLElement>('#best');
const menuBestElement = mustQuery<HTMLElement>('#menu-best');
const heartsElement = mustQuery<HTMLElement>('#hearts');
const heartElements = Array.from(
  document.querySelectorAll<HTMLElement>('.heart'),
);
const pauseButton = mustQuery<HTMLButtonElement>('#pause');
const startButton = mustQuery<HTMLButtonElement>('#start');
const installButton = mustQuery<HTMLButtonElement>('#install');
const steerLeft = mustQuery<HTMLButtonElement>('#steer-left');
const steerRight = mustQuery<HTMLButtonElement>('#steer-right');
const finalScore = mustQuery<HTMLElement>('#final-score');
const finalDistance = mustQuery<HTMLElement>('#final-distance');
const newBest = mustQuery<HTMLElement>('#new-best');
const hitFlash = mustQuery<HTMLElement>('#hit-flash');

let bestScore = readBestScore();
bestElement.textContent = formatScore(bestScore);
menuBestElement.textContent = formatScore(bestScore);

function formatScore(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return safe.toString().padStart(5, '0');
}

function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    // Private browsing can make localStorage unavailable. Scores still work.
    return 0;
  }
}

function writeBestScore(value: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(value)));
  } catch {
    // Persistence is best-effort; never block the game over a failed write.
  }
}

function renderHearts(hearts: number): void {
  const remaining = Math.max(0, Math.min(STARTING_HEARTS, Math.floor(hearts)));
  for (const [index, heart] of heartElements.entries()) {
    heart.classList.toggle('is-lost', index >= remaining);
  }
  heartsElement.setAttribute(
    'aria-label',
    `${remaining} of ${STARTING_HEARTS} lives remaining`,
  );
}

function flashHit(): void {
  hitFlash.classList.remove('is-active');
  // Restart the CSS animation even when hits happen in quick succession.
  void hitFlash.offsetWidth;
  hitFlash.classList.add('is-active');
}

function setScreen(screen: Screen): void {
  document.body.dataset.screen = screen;
  if (screen === 'playing') {
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    return;
  }
  const primary = document.querySelector<HTMLButtonElement>(
    `[data-overlay="${screen}"] .button--primary`,
  );
  window.requestAnimationFrame(() => {
    primary?.focus({ preventScroll: true });
  });
}

function currentScreen(): Screen {
  const value = document.body.dataset.screen;
  if (value === 'playing' || value === 'paused' || value === 'over') {
    return value;
  }
  return 'menu';
}

function handleGameOver(result: RunResult): void {
  const previousBest = bestScore;
  if (result.score > bestScore) {
    bestScore = result.score;
    writeBestScore(bestScore);
  }
  bestElement.textContent = formatScore(bestScore);
  finalScore.textContent = formatScore(result.score);
  finalDistance.textContent = `${Math.round(result.distance).toLocaleString(
    'en-US',
  )} m`;
  newBest.hidden = result.score === 0 || result.score <= previousBest;
  setScreen('over');
}

let game: Game | null = null;

try {
  game = new Game(app, {
    onScore: (score) => {
      scoreElement.textContent = formatScore(score);
    },
    onHearts: renderHearts,
    onHit: flashHit,
    onGameOver: handleGameOver,
  });
} catch (error) {
  console.error('WebGL could not be initialised.', error);
  showUnsupported();
}

function startRun(): void {
  if (!game) {
    return;
  }
  bestElement.textContent = formatScore(bestScore);
  newBest.hidden = true;
  game.startRun();
  setScreen('playing');
}

function pauseRun(): void {
  if (!game || currentScreen() !== 'playing') {
    return;
  }
  game.pause();
  setScreen('paused');
}

function resumeRun(): void {
  if (!game || currentScreen() !== 'paused') {
    return;
  }
  game.resume();
  setScreen('playing');
}

function showMenu(): void {
  if (!game) {
    return;
  }
  game.showIdle();
  bestElement.textContent = formatScore(bestScore);
  setScreen('menu');
}

function showUnsupported(): void {
  startButton.disabled = true;
  startButton.textContent = 'WebGL unavailable';
  const notice = document.createElement('p');
  notice.className = 'hint';
  notice.textContent =
    'This browser could not create a WebGL context. Try a recent version of Safari, Chrome, or Firefox with hardware acceleration enabled.';
  document.querySelector('[data-overlay="menu"] .panel')?.append(notice);
}

startButton.addEventListener('click', startRun);
pauseButton.addEventListener('click', pauseRun);
steerLeft.addEventListener('click', () => game?.steer(-1));
steerRight.addEventListener('click', () => game?.steer(1));

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-action]',
)) {
  button.addEventListener('click', () => {
    switch (button.dataset.action) {
      case 'resume':
        resumeRun();
        break;
      case 'restart':
        startRun();
        break;
      case 'menu':
        showMenu();
        break;
      default:
        break;
    }
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'p' || event.key === 'P') {
    if (currentScreen() === 'playing') {
      event.preventDefault();
      pauseRun();
    } else if (currentScreen() === 'paused') {
      event.preventDefault();
      resumeRun();
    }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    pauseRun();
  }
});

// ---------- Optional install prompt ----------

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

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (isStandalone) {
  installButton.hidden = true;
}

// ---------- Service worker ----------

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined);
  });
}
