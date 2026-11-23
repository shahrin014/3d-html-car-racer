/**
 * Handoff between the menu, the track preview, and the race page.
 *
 * The menu and the preview are separate pages, so the chosen circuit seed and
 * the "start immediately" flag travel in session storage. The race page reads
 * and clears both as it boots, so a refresh never replays a stale race.
 */
export const PENDING_START_KEY = 'neon-racer.pending-start';
export const PENDING_SEED_KEY = 'neon-racer.pending-seed';

/** Mark the next load of game.html as a real race start. */
export function markPendingStart(): void {
  try {
    window.sessionStorage.setItem(PENDING_START_KEY, '1');
  } catch {
    // Without session storage the race page still starts a race on load.
  }
}

/** Hand the previewed circuit to the race page. */
export function markPendingSeed(seed: string): void {
  try {
    window.sessionStorage.setItem(PENDING_SEED_KEY, seed);
  } catch {
    // Without session storage the race page draws its own seed.
  }
}

/** Drop a previewed seed so a normal menu start gets a fresh circuit. */
export function clearPendingSeed(): void {
  try {
    window.sessionStorage.removeItem(PENDING_SEED_KEY);
  } catch {
    // Persistence is best effort.
  }
}

/** Read and clear the start flag. */
export function takePendingStart(): boolean {
  try {
    const pending = window.sessionStorage.getItem(PENDING_START_KEY);
    window.sessionStorage.removeItem(PENDING_START_KEY);
    return pending === '1';
  } catch {
    return false;
  }
}

/** Read and clear the previewed seed, if there is one. */
export function takePendingSeed(): string | null {
  try {
    const seed = window.sessionStorage.getItem(PENDING_SEED_KEY);
    window.sessionStorage.removeItem(PENDING_SEED_KEY);
    return seed;
  } catch {
    return null;
  }
}
