import { describe, expect, it } from 'vitest';
import { SKYBOX_STYLES, skyboxStyleForSeed } from './skybox';

describe('skybox selection', () => {
  it('offers five distinct skies', () => {
    expect(SKYBOX_STYLES).toHaveLength(5);
    expect(new Set(SKYBOX_STYLES.map((style) => style.id)).size).toBe(5);
    expect(new Set(SKYBOX_STYLES.map((style) => style.name)).size).toBe(5);
  });

  it('points every sky at an HDR texture', () => {
    for (const style of SKYBOX_STYLES) {
      expect(style.url).toMatch(/\.hdr(?:\?.*)?$/);
      expect(style.fog).toBeGreaterThan(0);
    }
  });

  it('keys the sky to the circuit seed', () => {
    expect(skyboxStyleForSeed('alpha')).toBe(skyboxStyleForSeed('alpha'));
    expect(skyboxStyleForSeed('alpha').id).toBe(
      skyboxStyleForSeed('alpha').id,
    );
  });

  it('draws every sky across a run of seeds', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      seen.add(skyboxStyleForSeed(`circuit-${index.toString(16)}`).id);
    }
    expect(seen.size).toBe(5);
  });
});
