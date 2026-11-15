import type * as THREE from 'three';

/** Envelope and running gear of the die-cast hypercar, in metres. */
export interface CarSpec {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wheelbase: number;
  readonly rearWheelRadius: number;
  readonly frontWheelRadius: number;
  readonly rearTyreWidth: number;
  readonly frontTyreWidth: number;
  readonly rearAxle: number;
  readonly frontAxle: number;
}

export interface CarModel {
  group: THREE.Group;
  /** Rear pair first, front pair last: the game steers `wheels.slice(2)`. */
  wheels: THREE.Group[];
  setSteer: (value: number) => void;
}

export declare const CAR: CarSpec;

/** Build the car. Defaults to the candy red of the reference casting. */
export declare function createCar(color?: number): CarModel;