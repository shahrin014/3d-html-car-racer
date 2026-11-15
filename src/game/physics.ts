import * as THREE from 'three';
import type { TrackFrame } from './track';
import {
  CAR_LENGTH,
  CAR_WIDTH,
  GRAVITY,
  RAIL_HEIGHT,
  RAIL_WIDTH,
  TRACK_THICKNESS,
  TRACK_WIDTH,
} from './constants';

export interface VehicleInput {
  throttle: number;
  brake: boolean;
  steer: number;
}

export interface VehicleState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  speed: number;
}

export interface PhysicsHandle {
  step: (dt: number, input: VehicleInput, frame: TrackFrame) => void;
  read: () => VehicleState;
  reset: (frame: TrackFrame) => void;
  dispose: () => void;
}

function quaternionOf(frame: TrackFrame): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
  );
}

/**
 * Rapier-backed vehicle. The car is a real dynamic rigid body: mass, inertia,
 * gravity, friction, and CCD against static track and rail colliders. A guide
 * assist adds downforce and yaw alignment so a toy car can hold a loop; remove
 * it and the same body slides, spins, and falls.
 *
 * Rapier is loaded lazily (it is a ~1.15 MB WASM payload), so the app shell
 * stays small and the engine arrives before the first race.
 */
export async function createPhysics(
  frames: TrackFrame[],
): Promise<PhysicsHandle> {
  const RAPIER = await import('@dimforge/rapier3d-compat');
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = 1 / 120;

  const track = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  const step = 4;
  for (let index = step; index < frames.length; index += step) {
    const a = frames[index - step];
    const b = frames[index];
    if (!a || !b) {
      continue;
    }
    const frame = b;
    const length = a.position.distanceTo(b.position);
    if (length < 1e-4) {
      continue;
    }
    const rotation = quaternionOf(frame);
    const rotationJson = {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    };

    const surface = frame.position
      .clone()
      .addScaledVector(frame.up, -TRACK_THICKNESS / 2);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(TRACK_WIDTH / 2, TRACK_THICKNESS / 2, length / 2)
        .setTranslation(surface.x, surface.y, surface.z)
        .setRotation(rotationJson)
        .setFriction(0.35)
        .setRestitution(0.05),
      track,
    );

    for (const side of [-1, 1]) {
      const rail = frame.position
        .clone()
        .addScaledVector(frame.right, side * (TRACK_WIDTH / 2 - RAIL_WIDTH / 2))
        .addScaledVector(frame.up, RAIL_HEIGHT / 2);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          RAIL_WIDTH / 2,
          RAIL_HEIGHT / 2,
          length / 2,
        )
          .setTranslation(rail.x, rail.y, rail.z)
          .setRotation(rotationJson)
          .setFriction(0.2)
          .setRestitution(0.2),
        track,
      );
    }
  }

  const first = frames[0];
  if (!first) {
    throw new Error('Cannot create physics without track frames');
  }

  const start = first.position.clone().addScaledVector(first.up, 0.55);
  const car = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(0.12)
      .setAngularDamping(0.45)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR_WIDTH / 2, 0.3, CAR_LENGTH / 2)
      .setMass(1.2)
      .setFriction(0.55)
      .setRestitution(0.12),
    car,
  );

  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();

  return {
    step: (dt, input, frame) => {
      const rotation = car.rotation();
      const orientation = new THREE.Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      forward.set(0, 0, 1).applyQuaternion(orientation);
      up.set(0, 1, 0).applyQuaternion(orientation);

      car.resetForces(true);
      car.resetTorques(true);

      const engine = input.brake ? -18 : 11 * input.throttle;
      car.addForce(
        { x: forward.x * engine, y: forward.y * engine, z: forward.z * engine },
        true,
      );

      // Steering is a yaw torque around the car's own up vector.
      const steerTorque = input.steer * 2.6;
      car.addTorque(
        { x: up.x * steerTorque, y: up.y * steerTorque, z: up.z * steerTorque },
        true,
      );

      // Guide assist: pull the body onto the track surface and align its
      // heading with the local tangent. This is what lets a toy car hold a
      // loop; it adds no forward energy.
      const toSurface = frame.position.clone().sub(
        new THREE.Vector3().copy(car.translation()),
      );
      const height = toSurface.dot(frame.up);
      const verticalSpeed = new THREE.Vector3()
        .copy(car.linvel())
        .dot(frame.up);
      const stick = height * 60 - verticalSpeed * 12;
      car.addForce(
        {
          x: frame.up.x * stick,
          y: frame.up.y * stick,
          z: frame.up.z * stick,
        },
        true,
      );

      const desired = frame.tangent
        .clone()
        .applyAxisAngle(frame.up, input.steer * 0.22);
      const axis = new THREE.Vector3().crossVectors(forward, desired);
      const angle = Math.asin(THREE.MathUtils.clamp(axis.length(), -1, 1));
      if (axis.lengthSq() > 1e-6) {
        axis.normalize().multiplyScalar(angle * 14);
        car.addTorque({ x: axis.x, y: axis.y, z: axis.z }, true);
      }

      world.timestep = dt;
      world.step();
    },

    read: () => {
      const translation = car.translation();
      const rotation = car.rotation();
      const velocity = car.linvel();
      return {
        position: new THREE.Vector3(
          translation.x,
          translation.y,
          translation.z,
        ),
        quaternion: new THREE.Quaternion(
          rotation.x,
          rotation.y,
          rotation.z,
          rotation.w,
        ),
        speed: Math.hypot(velocity.x, velocity.y, velocity.z),
      };
    },

    reset: (frame) => {
      const position = frame.position.clone().addScaledVector(frame.up, 0.55);
      car.setTranslation(position, true);
      const orientation = quaternionOf(frame);
      car.setRotation(orientation, true);
      car.setLinvel({ x: 0, y: 0, z: 0 }, true);
      car.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },

    dispose: () => {
      world.free();
    },
  };
}
