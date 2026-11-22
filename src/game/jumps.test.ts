import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  JUMP_FAIL_DEPTH,
  JUMP_RETRY_DISTANCE,
  TRACK_WIDTH,
} from './constants';
import {
  jumpFailed,
  jumpRetryFrame,
  jumpSpanAt,
  jumpSpans,
  type JumpSpan,
} from './jumps';
import {
  buildFrames,
  generateCircuit,
  type Piece,
  type TrackFrame,
} from './track';

function piece(kind: Piece['kind'], length: number): Piece {
  return {
    kind,
    length,
    path: () => {
      throw new Error('not sampled');
    },
    matrix: new THREE.Matrix4(),
  };
}

function frame(s: number, solid = true): TrackFrame {
  return {
    position: new THREE.Vector3(0, 0, 0),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    s,
    solid,
    halfWidth: TRACK_WIDTH / 2,
  };
}

function at(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  return { x, y, z };
}

const SPAN: JumpSpan = { from: 10, to: 15, landingEnd: 32 };

describe('jump spans', () => {
  it('turns a gap and its landing into one span', () => {
    const spans = jumpSpans([
      piece('straight', 12),
      piece('kicker', 8),
      piece('gap', 5),
      piece('landing', 17),
      piece('straight', 12),
    ]);
    expect(spans).toEqual([{ from: 20, to: 25, landingEnd: 42 }]);
  });

  it('finds the span around a progress distance', () => {
    const spans = [SPAN];
    expect(jumpSpanAt(spans, 9.5)).toBe(SPAN);
    expect(jumpSpanAt(spans, 20)).toBe(SPAN);
    expect(jumpSpanAt(spans, 33)).toBeUndefined();
    expect(jumpSpanAt(spans, 5)).toBeUndefined();
  });

  it('finds the gap and a solid retry frame on a generated circuit', () => {
    for (let index = 0; index < 40; index += 1) {
      const circuit = generateCircuit(`jump-check-${index}`, 1);
      const spans = jumpSpans(circuit.pieces);
      if (spans.length === 0) {
        continue;
      }
      const frames = buildFrames(circuit);
      for (const span of spans) {
        const gapFrames = frames.filter(
          (frame) => frame.s >= span.from - 1e-6 && frame.s <= span.to + 1e-6,
        );
        expect(gapFrames.some((frame) => !frame.solid)).toBe(true);
        const retry = jumpRetryFrame(frames, span);
        expect(retry.solid).toBe(true);
        expect(retry.s).toBeLessThan(span.from);
      }
      return;
    }
    throw new Error('no jump circuit found');
  });
});

describe('jump failure', () => {
  it('accepts a car flying above the deck', () => {
    expect(jumpFailed(SPAN, frame(11), at(0, 0.5, 0), 11)).toBe(false);
    expect(jumpFailed(SPAN, frame(25), at(0, 2, 0), 25)).toBe(false);
  });

  it('rejects a car that drops below the jump line', () => {
    expect(
      jumpFailed(SPAN, frame(11), at(0, -JUMP_FAIL_DEPTH - 0.1, 0), 11),
    ).toBe(true);
  });

  it('rejects a car that drifts off the side of the gap or landing', () => {
    const side = TRACK_WIDTH / 2 + 1;
    expect(jumpFailed(SPAN, frame(11), at(side, 0, 0), 11)).toBe(true);
    expect(jumpFailed(SPAN, frame(25), at(side, 1, 0), 25)).toBe(true);
    expect(jumpFailed(SPAN, frame(25), at(0, 0, 0), 25)).toBe(false);
  });

  it('rejects a car that sails past the landing while airborne', () => {
    expect(
      jumpFailed(SPAN, frame(32.5), at(0, JUMP_FAIL_DEPTH + 0.5, 0), 32.5),
    ).toBe(true);
  });

  it('ignores failures outside a jump span', () => {
    expect(jumpFailed(undefined, frame(11), at(0, -5, 0), 11)).toBe(false);
    expect(jumpFailed(SPAN, frame(5), at(0, -5, 0), 5)).toBe(false);
    expect(jumpFailed(SPAN, frame(40), at(0, -5, 0), 40)).toBe(false);
  });
});

describe('jump retry frame', () => {
  it('backs up before the kicker and only picks solid deck', () => {
    const frames: TrackFrame[] = [];
    for (let s = 0; s <= 45; s += 1) {
      frames.push(frame(s, s < 10 || s > 14));
    }
    const retry = jumpRetryFrame(frames, { from: 30, to: 35, landingEnd: 52 });
    expect(retry.s).toBe(30 - JUMP_RETRY_DISTANCE);
    expect(retry.solid).toBe(true);
  });

  it('falls back to the last solid frame when there is no run-up', () => {
    const frames = [frame(0), frame(1, false), frame(2, false), frame(3)];
    const retry = jumpRetryFrame(frames, { from: 3, to: 5, landingEnd: 20 });
    expect(retry.s).toBe(0);
    expect(retry.solid).toBe(true);
  });
});
