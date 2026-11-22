/**
 * Selectable paints for the player car and the opponents.
 *
 * Ids are stable because the chosen paint is persisted; names double as the
 * accessible label on each swatch. The first entry is the stock livery: each
 * car keeps its own baked colours until a paint is chosen, which matters for a
 * dark car like the GT. The ten paint colours follow. A full field of opponents
 * can be larger than the palette, so rival paints cycle.
 */
export interface Paint {
  readonly id: string;
  readonly name: string;
  /** Paint colour, or null for the car's own baked livery. */
  readonly color: number | null;
}

export const PAINTS: readonly Paint[] = [
  { id: 'stock', name: 'Stock livery', color: null },
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
 * Paints for `count` opponents: never the player's own paint, and never the
 * stock livery (rivals are always a solid colour). Walking the palette from the
 * player's slot keeps the assignment deterministic; the walk cycles when the
 * field is larger than the remaining palette.
 */
export function opponentPaints(player: Paint, count: number): Paint[] {
  const palette = PAINTS.filter((paint) => paint.color !== null);
  const start = palette.indexOf(player);
  const available = start >= 0 ? palette.filter((paint) => paint !== player) : palette;
  const wanted = Math.max(0, Math.floor(count));
  if (available.length === 0) {
    return [];
  }
  const paints: Paint[] = [];
  for (let step = 0; step < wanted; step += 1) {
    paints.push(available[step % available.length]!);
  }
  return paints;
}
