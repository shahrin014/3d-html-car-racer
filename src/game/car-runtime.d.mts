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

export interface CarMaterials {
  livery?: THREE.Texture | null;
  mask?: THREE.Texture | null;
  baseLuma?: number;
}

/** Build one car from an already-loaded model root. */
export declare function buildCar(
  root: THREE.Object3D,
  color?: number | null,
  materials?: CarMaterials,
): RuntimeCar;

/** Build one car from the preloaded set for `id`. */
export declare function createCar(
  color?: number | null,
  id?: string,
  baseLuma?: number,
): RuntimeCar;
