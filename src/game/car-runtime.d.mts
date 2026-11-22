import type * as THREE from 'three';

export interface RuntimeCar {
  group: THREE.Group;
  wheels: THREE.Group[];
  setSteer: (value: number) => void;
}

/** Load a car's GLB, livery, and paint mask from `base` (ending in a slash). */
export declare function preloadCarModel(
  base: string,
  id?: string,
): Promise<THREE.Object3D>;

/** Build one car from an already-loaded model root. */
export declare function buildCar(
  root: THREE.Object3D,
  color?: number,
): RuntimeCar;

/** Build one car from the preloaded model. */
export declare function createCar(color?: number): RuntimeCar;
