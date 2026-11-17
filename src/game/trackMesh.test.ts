import { describe, expect, it } from 'vitest';
import * as trackMesh from './trackMesh';

/**
 * The deck floats: the support column helpers and their geometry are gone. The
 * mesh itself needs a canvas for its texture, so the browser suite is where the
 * rendered deck is checked; here we pin that the support machinery cannot come
 * back by accident.
 */
describe('floating deck', () => {
  it('exposes no support column helpers', () => {
    expect('supportTop' in trackMesh).toBe(false);
    expect('SUPPORT_HALF' in trackMesh).toBe(false);
  });
});
