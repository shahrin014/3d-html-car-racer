import { describe, expect, it } from 'vitest';
import { TRACK_THICKNESS } from './constants';
import { buildFrames, generateCircuit } from './track';
import { SUPPORT_HALF, supportTop } from './trackMesh';

/**
 * Support columns are vertical boxes under the deck. Because the deck is banked
 * and pitched, a column whose top reaches the frame centre pokes through the
 * low side of the surface, which renders as a dark square in the middle of the
 * road. The top must clear the underside across the whole footprint.
 */
describe('track supports', () => {
  it('stay under the deck on every supported frame', () => {
    const frames = buildFrames(generateCircuit('support-clearance', 1));
    let checked = 0;

    for (const frame of frames) {
      if (frame.position.y < 0.8 || frame.up.y < 0.3) {
        continue;
      }
      const top = supportTop(frame);
      for (const along of [-1, 1]) {
        for (const across of [-1, 1]) {
          const underside = frame.position
            .clone()
            .addScaledVector(frame.right, across * SUPPORT_HALF)
            .addScaledVector(frame.tangent, along * SUPPORT_HALF)
            .addScaledVector(frame.up, -TRACK_THICKNESS);
          expect(top).toBeLessThan(underside.y);
        }
      }
      checked += 1;
    }

    expect(checked).toBeGreaterThan(10);
  });
});
