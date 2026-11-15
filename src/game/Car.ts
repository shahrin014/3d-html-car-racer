import { CAR, createCar as buildCar } from './car-model.mjs';
import type { CarModel } from './car-model.mjs';

/**
 * The car the player drives: the candy red die-cast hypercar built in
 * `car-model.mjs`, which the asset preview renders from the same geometry.
 *
 * The model faces +Z, which is the direction of travel on the circuit, so no
 * extra rotation is needed here.
 */
export type Car = CarModel;

/** Paint of the reference casting: candy red with black aero and gold wheels. */
export const PLAYER_PAINT = 0xa30f1d;

export function createCar(): Car {
  return buildCar(PLAYER_PAINT);
}

/** Visual envelope in metres, kept in step with the physics chassis. */
export const CAR_DIMENSIONS = {
  length: CAR.length,
  width: CAR.width,
  height: CAR.height,
};

/** Driven-wheel radius: the game rolls the wheels by this, not by eye. */
export const WHEEL_RADIUS = CAR.rearWheelRadius;