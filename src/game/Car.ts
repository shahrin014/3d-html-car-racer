import type * as THREE from 'three';
import { CAR, DEFAULT_BODY_COLOR } from './car-spec.mjs';
import {
  buildCar as buildCarRuntime,
  createCar as createCarRuntime,
  preloadCarModel as preloadRuntime,
} from './car-runtime.mjs';

/**
 * The car the player drives: the Mach Speeder, loaded once from a binary glTF
 * and cloned per car.
 *
 * The model, its transform, its re-paint shader, and its wheel pivots all live
 * in `car-runtime.mjs`, which the asset catalog imports too - the render and
 * the game are guaranteed to show the same car.
 */
export type Car = {
  group: THREE.Group;
  wheels: THREE.Group[];
  setSteer: (value: number) => void;
};

/** Paint of the reference casting. */
export const PLAYER_PAINT = DEFAULT_BODY_COLOR;

const MODELS = `${import.meta.env.BASE_URL}models/`;

/** Fetch the car model ahead of the first race. */
export async function preloadCarModel(): Promise<void> {
  await preloadRuntime(MODELS);
}

/** Build one car from an already-loaded root (used by tests). */
export function buildCar(root: THREE.Object3D, color = PLAYER_PAINT): Car {
  return buildCarRuntime(root, color) as Car;
}

/** Build one car. Throws until `preloadCarModel()` resolves. */
export function createCar(color = PLAYER_PAINT): Car {
  return createCarRuntime(color) as Car;
}

/** Visual envelope in metres, kept in step with the physics chassis. */
export const CAR_DIMENSIONS = {
  length: CAR.length,
  width: CAR.width,
  height: CAR.height,
};

/** Driven-wheel radius: the game rolls the wheels by this, not by eye. */
export const WHEEL_RADIUS = CAR.rearWheelRadius;
