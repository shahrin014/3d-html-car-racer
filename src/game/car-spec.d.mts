import type * as THREE from 'three';

/** Envelope and running gear of the Mach Speeder, in metres. */
export interface CarSpec {
  readonly length: number;
  readonly width: number;
  readonly bodyWidth: number;
  readonly height: number;
  readonly wheelbase: number;
  readonly wheelRadius: number;
  readonly frontWheelRadius: number;
  readonly rearWheelRadius: number;
  readonly frontTyreWidth: number;
  readonly rearTyreWidth: number;
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly frontWheelX: number;
  readonly rearWheelX: number;
}

export interface CarModel {
  group: THREE.Group;
  /** Rear pair first, front pair last: the game steers `wheels.slice(2)`. */
  wheels: THREE.Group[];
  setSteer: (value: number) => void;
}

export declare const CAR: CarSpec;

export declare const DEFAULT_BODY_COLOR: number;
