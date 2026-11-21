import {
  CAR_WIDTH,
  JUMP_FAIL_DEPTH,
  JUMP_RETRY_DISTANCE,
  TRACK_WIDTH,
} from './constants';
import type { Piece, TrackFrame } from './track';

/** The stretch of circuit that belongs to one jump. Distances are track `s`. */
export interface JumpSpan {
  /** Where the kicker ends and the deckless gap begins. */
  from: number;
  /** Where the gap ends and the landing ramp begins. */
  to: number;
  /** Where the landing ramp returns to flat deck. */
  landingEnd: number;
}

/** Find every jump in an assembled circuit, in circuit order. */
export function jumpSpans(pieces: readonly Piece[]): JumpSpan[] {
  const spans: JumpSpan[] = [];
  let distance = 0;
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) {
      continue;
    }
    if (piece.kind === 'gap') {
      const landing = pieces[index + 1];
      const landingLength = landing?.kind === 'landing' ? landing.length : 0;
      spans.push({
        from: distance,
        to: distance + piece.length,
        landingEnd: distance + piece.length + landingLength,
      });
    }
    distance += piece.length;
  }
  return spans;
}

/** The jump a progress distance belongs to, allowing a little edge margin. */
export function jumpSpanAt(
  spans: readonly JumpSpan[],
  s: number,
  margin = 0.5,
): JumpSpan | undefined {
  return spans.find(
    (span) => s >= span.from - margin && s <= span.landingEnd + margin,
  );
}

/**
 * True when the car has clearly missed the jump: it dropped below the virtual
 * launch line or landing deck, drifted off the side of a gap, or sailed past
 * the end of the landing while still airborne.
 *
 * Height is measured against the nearest frame, so over the gap it is height
 * above the launch line and over the landing it is height above the deck. A
 * successful jump stays at or above both; a failed one falls through.
 */
export function jumpFailed(
  span: JumpSpan | undefined,
  frame: TrackFrame,
  position: { x: number; y: number; z: number },
  s: number,
): boolean {
  if (!span) {
    return false;
  }
  if (s < span.from - 0.5 || s > span.landingEnd + 1.5) {
    return false;
  }
  const dx = position.x - frame.position.x;
  const dy = position.y - frame.position.y;
  const dz = position.z - frame.position.z;
  const height = dx * frame.up.x + dy * frame.up.y + dz * frame.up.z;
  if (height < -JUMP_FAIL_DEPTH) {
    return true;
  }
  const lateral = dx * frame.right.x + dy * frame.right.y + dz * frame.right.z;
  if (Math.abs(lateral) > TRACK_WIDTH / 2 + CAR_WIDTH / 2) {
    return true;
  }
  if (s > span.landingEnd && height > JUMP_FAIL_DEPTH) {
    return true;
  }
  return false;
}

/**
 * The frame to put a failed jumper back on. It sits before the kicker so the
 * car has a run-up, and it is always a solid frame rather than the gap.
 */
export function jumpRetryFrame(
  frames: readonly TrackFrame[],
  span: JumpSpan,
  distance = JUMP_RETRY_DISTANCE,
): TrackFrame {
  const first = frames[0];
  if (!first) {
    throw new Error('Cannot choose a jump retry without track frames');
  }
  const target = span.from - distance;
  let best: TrackFrame | undefined;
  let lastSolid: TrackFrame | undefined;
  for (const frame of frames) {
    if (frame.s >= span.from - 1e-6) {
      break;
    }
    if (!frame.solid) {
      continue;
    }
    lastSolid = frame;
    if (frame.s <= target) {
      best = frame;
    }
  }
  return best ?? lastSolid ?? first;
}
