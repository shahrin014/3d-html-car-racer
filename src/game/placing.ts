/**
 * Race placing.
 *
 * Opponents are kinematic and never "finish", so the player's position is read
 * at the moment the third lap completes: everyone who has covered more distance
 * along the circuit since the grid is ahead. Opponent totals include their grid
 * handicap, which is why this compares total distance rather than laps.
 */
export function racePlacing(
  playerDistance: number,
  opponentDistances: readonly number[],
): number {
  let ahead = 0;
  for (const distance of opponentDistances) {
    if (distance > playerDistance) {
      ahead += 1;
    }
  }
  return ahead + 1;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(place: number): string {
  const rounded = Math.max(1, Math.round(place));
  const remainder = rounded % 100;
  if (remainder >= 11 && remainder <= 13) {
    return `${rounded}th`;
  }
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

/** "2nd of 4". */
export function placingLabel(place: number, fieldSize: number): string {
  return `${ordinal(place)} of ${Math.max(1, Math.round(fieldSize))}`;
}
