/**
 * Selectable paints for the player car and the opponents.
 *
 * Ids are stable because the chosen paint is persisted; names double as the
 * accessible label on each swatch. The palette is capped at ten paints so a
 * full grid of opponents can each take a distinct colour without repeating.
 */
export interface Paint {
  readonly id: string;
  readonly name: string;
  readonly color: number;
}

export const PAINTS: readonly Paint[] = [
  { id: 'candy', name: 'Candy red', color: 0xa30f1d },
  { id: 'gold', name: 'Champagne gold', color: 0xf2b705 },
  { id: 'lemon', name: 'Lemon', color: 0xf7e04a },
  { id: 'lime', name: 'Lime', color: 0x7bd63a },
  { id: 'emerald', name: 'Emerald', color: 0x11a05a },
  { id: 'cyan', name: 'Ice cyan', color: 0x35e0e8 },
  { id: 'azure', name: 'Azure', color: 0x2b6cff },
  { id: 'violet', name: 'Violet', color: 0x8b5cf6 },
  { id: 'magenta', name: 'Magenta', color: 0xe63fa8 },
  { id: 'pearl', name: 'Pearl white', color: 0xe9edf2 },
];

export const DEFAULT_PAINT = PAINTS[0]!;

/** The paint stored under `id`, or the default when the id is unknown. */
export function paintById(id: string | null | undefined): Paint {
  return PAINTS.find((paint) => paint.id === id) ?? DEFAULT_PAINT;
}

/**
 * Paints for `count` opponents: always distinct, and never the player's own
 * paint. Walking from the player's slot keeps the assignment deterministic, so
 * the same player paint always produces the same opponent grid.
 */
export function opponentPaints(player: Paint, count: number): Paint[] {
  const total = PAINTS.length;
  const start = Math.max(0, PAINTS.indexOf(player));
  const wanted = Math.min(Math.max(0, Math.floor(count)), total - 1);
  const paints: Paint[] = [];
  for (let step = 1; step <= wanted; step += 1) {
    paints.push(PAINTS[(start + step) % total]!);
  }
  return paints;
}
