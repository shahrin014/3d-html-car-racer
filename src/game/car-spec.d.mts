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

/** Three tones derived from the one colour the player picks. */
export interface Livery {
  readonly body: number;
  readonly deep: number;
  readonly stripe: number;
}

export declare const CAR: CarSpec;

export declare const CAR_MATERIALS: {
  readonly paint: string;
  readonly paintDeep: string;
  readonly stripe: string;
  readonly accent: string;
  readonly trim: string;
  readonly glass: string;
  readonly tyre: string;
  readonly brake: string;
  readonly headlight: string;
  readonly taillight: string;
};

export declare const ACCENT_COLOR: number;
export declare const DEFAULT_BODY_COLOR: number;

export declare function liveryFor(color: number): Livery;
