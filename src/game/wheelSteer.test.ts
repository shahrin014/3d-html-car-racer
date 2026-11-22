import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildCar } from './Car';

const MODEL = path.resolve(process.cwd(), 'assets/car/mach.glb');

/** Axle direction of a wheel in car space: the wheel's local +X. */
function axleOf(wheel: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(wheel.quaternion);
}

async function shippedCar() {
  const bytes = await readFile(MODEL);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  return buildCar(gltf.scene);
}

describe('steered wheels', () => {
  it('keeps the axle fixed while the wheel spins', async () => {
    const car = await shippedCar();
    expect(car.wheels).toHaveLength(4);
    const wheel = car.wheels[2]!;
    car.setSteer(-0.4);

    const steered = axleOf(wheel);
    // The steer is not zero, so the axle has swung out of the car's X axis.
    expect(Math.abs(steered.z)).toBeGreaterThan(0.1);

    // Every turn of the wheel must spin the tyre about that same axle. If the
    // spin is applied outside the steer, the axle precesses and the wheel
    // wobbles, which reads as the fronts shaking whenever steering is held.
    for (const spin of [0, 0.7, 1.9, 3.4, 6.1, 12.8, 25.5]) {
      wheel.rotation.x = spin;
      const axle = axleOf(wheel);
      expect(axle.angleTo(steered)).toBeLessThan(1e-6);
    }
  });

  it('steers only the front pair, and in the direction asked for', async () => {
    const car = await shippedCar();
    const before = car.wheels.map(axleOf);
    car.setSteer(-0.5);

    const rear = car.wheels.slice(0, 2).map(axleOf);
    const front = car.wheels.slice(2).map(axleOf);
    for (let index = 0; index < rear.length; index += 1) {
      expect(rear[index]!.angleTo(before[index]!)).toBeLessThan(1e-9);
    }
    for (let index = 0; index < front.length; index += 1) {
      const turned = front[index]!;
      const straight = before[index + 2]!;
      expect(turned.angleTo(straight)).toBeGreaterThan(0.1);
      expect(Math.abs(turned.y)).toBeLessThan(1e-9);
    }
    // Right steer visibly turns the fronts one way and left steer the other.
    const right = axleOf(car.wheels[2]!);
    car.setSteer(0.5);
    const left = axleOf(car.wheels[2]!);
    expect(Math.sign(right.z)).toBe(-Math.sign(left.z));
  });
});
