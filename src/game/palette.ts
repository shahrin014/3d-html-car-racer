/**
 * Selectable paints for the player car and the opponents.
 *
 * Ids are stable because the chosen paint is persisted; names double as the
 * accessible label on each swatch. The palette is capped at ten paints for the
 * player picker. A full field of opponents can be larger than the palette, so
 * rival paints cycle once every non-player colour has been used.
 */
export interface Paint {
  readonly id: string;
  readonly name: string;
  readonly color: number;
}

export const PAINTS: readonly Paint[] = [
  // The casting's own white livery leads: it is the colour the reference car
  // wears and therefore the default selection.
  { id: 'pearl', name: 'Pearl white', color: 0xf2f4f7 },
  { id: 'candy', name: 'Candy red', color: 0xa30f1d },
  { id: 'gold', name: 'Champagne gold', color: 0xf2b705 },
  { id: 'lemon', name: 'Lemon', color: 0xf7e04a },
  { id: 'lime', name: 'Lime', color: 0x7bd63a },
  { id: 'emerald', name: 'Emerald', color: 0x11a05a },
  { id: 'cyan', name: 'Ice cyan', color: 0x35e0e8 },
  { id: 'azure', name: 'Azure', color: 0x2b6cff },
  { id: 'violet', name: 'Violet', color: 0x8b5cf6 },
  { id: 'magenta', name: 'Magenta', color: 0xe63fa8 },
];

export const DEFAULT_PAINT = PAINTS[0]!;

/** The paint stored under `id`, or the default when the id is unknown. */
export function paintById(id: string | null | undefined): Paint {
  return PAINTS.find((paint) => paint.id === id) ?? DEFAULT_PAINT;
}

/**
 * Paints for `count` opponents: never the player's own paint. Walking from the
 * player's slot keeps the assignment deterministic, so the same player paint
 * always produces the same opponent grid. The walk cycles when the field is
 * larger than the remaining palette, so every rival still gets a paint.
 */
export function opponentPaints(player: Paint, count: number): Paint[] {
  const total = PAINTS.length;
  const start = Math.max(0, PAINTS.indexOf(player));
  const wanted = Math.max(0, Math.floor(count));
  const perCycle = Math.max(0, total - 1);
  const paints: Paint[] = [];
  if (perCycle === 0) {
    return paints;
  }
  for (let step = 0; step < wanted; step += 1) {
    paints.push(PAINTS[(start + 1 + (step % perCycle)) % total]!);
  }
  return paints;
}
