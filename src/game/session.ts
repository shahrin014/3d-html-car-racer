import type { Piece } from './track';

/**
 * Handoff between the menu, the track preview, and the race page.
 *
 * The menu and the preview are separate pages, so the chosen circuit seed, the
 * previewed segment requirements, and the "start immediately" flag travel in
 * session storage. The race page reads and clears them as it boots, so a
 * refresh never replays a stale race.
 */
export const PENDING_START_KEY = 'neon-racer.pending-start';
export const PENDING_SEED_KEY = 'neon-racer.pending-seed';
export const PENDING_REQUIREMENTS_KEY = 'neon-racer.pending-requirements';
export const PENDING_COUNTS_KEY = 'neon-racer.pending-counts';
export const PENDING_CROSSOVERS_KEY = 'neon-racer.pending-crossovers';

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
    window.sessionStorage.removeItem(PENDING_REQUIREMENTS_KEY);
    window.sessionStorage.removeItem(PENDING_COUNTS_KEY);
    window.sessionStorage.removeItem(PENDING_CROSSOVERS_KEY);
  } catch {
    // Persistence is best effort.
  }
}

/** Hand the previewed segment requirements to the race page. */
export function markPendingRequirements(
  kinds: readonly Piece['kind'][],
): void {
  try {
    if (kinds.length === 0) {
      window.sessionStorage.removeItem(PENDING_REQUIREMENTS_KEY);
      return;
    }
    window.sessionStorage.setItem(
      PENDING_REQUIREMENTS_KEY,
      JSON.stringify([...new Set(kinds)]),
    );
  } catch {
    // Without session storage the race still draws its own circuit.
  }
}

/** Drop any previewed requirements (the menu start does not use them). */
export function clearPendingRequirements(): void {
  try {
    window.sessionStorage.removeItem(PENDING_REQUIREMENTS_KEY);
  } catch {
    // Persistence is best effort.
  }
}

/** Hand the previewed minimum piece counts to the race page. */
export function markPendingCounts(
  counts: Partial<Record<Piece['kind'], number>>,
): void {
  try {
    const entries = Object.entries(counts).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    );
    if (entries.length === 0) {
      window.sessionStorage.removeItem(PENDING_COUNTS_KEY);
      return;
    }
    window.sessionStorage.setItem(
      PENDING_COUNTS_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Without session storage the race still draws its own circuit.
  }
}

/** Read and clear the previewed minimum piece counts. */
export function takePendingCounts(): Partial<Record<Piece['kind'], number>> {
  try {
    const raw = window.sessionStorage.getItem(PENDING_COUNTS_KEY);
    window.sessionStorage.removeItem(PENDING_COUNTS_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const counts: Partial<Record<Piece['kind'], number>> = {};
    for (const [kind, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts[kind as Piece['kind']] = Math.max(0, Math.floor(value));
      }
    }
    return counts;
  } catch {
    return {};
  }
}

/** Hand the previewed crossover count to the race page. */
export function markPendingCrossovers(crossovers: 0 | 1 | 2 | null): void {
  try {
    if (crossovers === null) {
      window.sessionStorage.removeItem(PENDING_CROSSOVERS_KEY);
      return;
    }
    window.sessionStorage.setItem(
      PENDING_CROSSOVERS_KEY,
      String(crossovers),
    );
  } catch {
    // Without session storage the race still draws its own circuit.
  }
}

/** Read and clear the previewed crossover count. */
export function takePendingCrossovers(): 0 | 1 | 2 | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_CROSSOVERS_KEY);
    window.sessionStorage.removeItem(PENDING_CROSSOVERS_KEY);
    if (raw === '0' || raw === '1' || raw === '2') {
      return Number(raw) as 0 | 1 | 2;
    }
    return null;
  } catch {
    return null;
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

function takePendingKinds(key: string): Piece['kind'][] {
  try {
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (value): value is Piece['kind'] => typeof value === 'string',
    );
  } catch {
    return [];
  }
}

/** Read and clear the previewed segment requirements. */
export function takePendingRequirements(): Piece['kind'][] {
  return takePendingKinds(PENDING_REQUIREMENTS_KEY);
}
