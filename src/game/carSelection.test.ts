import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { CARS } from './car-spec.mjs';
import { PLAYER_CAR } from './Car';

describe('selectable cars', () => {
  it('lists the catalog cars with unique ids and names', () => {
    expect(CARS.length).toBeGreaterThan(1);
    expect(new Set(CARS.map((car) => car.id)).size).toBe(CARS.length);
    expect(new Set(CARS.map((car) => car.name)).size).toBe(CARS.length);
    expect(CARS[0]!.id).toBe(PLAYER_CAR);
  });

  it('has a published model, livery, and mask for every car', async () => {
    const files = await readdir(path.resolve(process.cwd(), 'public/models'));
    for (const car of CARS) {
      expect(files, car.id).toContain(`${car.id}.glb`);
      expect(files, car.id).toContain(`${car.id}-livery.png`);
      expect(files, car.id).toContain(`${car.id}-paint-mask.png`);
    }
  });
});
