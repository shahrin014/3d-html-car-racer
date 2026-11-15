import * as THREE from 'three';
import type { TrackFrame } from './track';
import {
  CAR_LENGTH,
  CAR_MASS,
  CAR_WIDTH,
  CHASSIS_HALF_HEIGHT,
  FIXED_STEP,
  GRAVITY,
  IMPACT_THRESHOLD,
  PHYSICS_BRAKE_FORCE,
  PHYSICS_DRAG,
  PHYSICS_ENGINE_FORCE,
  PHYSICS_HEADING_ASSIST,
  PHYSICS_LATERAL_DAMPING,
  PHYSICS_LATERAL_STRENGTH,
  PHYSICS_RIDE_HEIGHT,
  PHYSICS_STEER_TORQUE,
  PHYSICS_STICK_DAMPING,
  PHYSICS_UP_ALIGNMENT,
  PHYSICS_STICK_STRENGTH,
  PHYSICS_WHEEL_MOUNT_Y,
  PHYSICS_WHEEL_RADIUS,
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
  velocity: THREE.Vector3;
  speed: number;
}

export interface PhysicsHandle {
  /** Advance the world by one fixed step with the given controls. */
  step: (dt: number, input: VehicleInput, frame: TrackFrame) => void;
  read: () => VehicleState;
  /** Impulse-shaped impact magnitude accumulated since the last call. */
  takeImpact: () => number;
  /** Forward impulse for a boost strip, in newton-seconds. */
  boost: (impulse: number) => void;
  reset: (frame: TrackFrame) => void;
  dispose: () => void;
}

/** Wheel positions in chassis space, shared by the colliders and the reset pose. */
const WHEEL_MOUNTS = [
  { x: -0.42, z: 0.78 },
  { x: 0.42, z: 0.78 },
  { x: -0.42, z: -0.78 },
  { x: 0.42, z: -0.78 },
] as const;

/**
 * Collision groups: only the wheel colliders touch the driving surface, so a
 * tilted chassis cannot scrape a bank or loop and wedge the car. The chassis
 * still collides with the rails.
 */
const GROUP_TRACK = 1;
const GROUP_RAIL = 2;
const GROUP_CHASSIS = 4;
const GROUP_WHEEL = 8;
const groups = (membership: number, filter: number): number =>
  (membership << 16) | filter;

function quaternionOf(frame: TrackFrame): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
  );
}

/**
 * Rapier-backed vehicle. The car is a real dynamic rigid body: mass, inertia,
 * gravity, friction, and CCD against static track and rail colliders. Four
 * spherical wheel colliders carry the chassis, because a flat box sliding over
 * tiled track colliders catches on every seam.
 *
 * A guide assist adds downforce and yaw alignment so a toy car can hold a
 * loop; remove it and the same body slides, spins, and falls.
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
  world.timestep = FIXED_STEP;

  const track = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const first = frames[0];
  if (!first) {
    throw new Error('Cannot create physics without track frames');
  }

  const addSurface = (
    middle: THREE.Vector3,
    frame: TrackFrame,
    length: number,
  ): void => {
    const position = middle
      .clone()
      .addScaledVector(frame.up, -TRACK_THICKNESS / 2);
    const rotation = quaternionOf(frame);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        TRACK_WIDTH / 2,
        TRACK_THICKNESS / 2,
        length / 2,
      )
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setFriction(0.35)
        .setRestitution(0.05)
        .setCollisionGroups(groups(GROUP_TRACK, GROUP_WHEEL)),
      track,
    );
  };

  // A short apron behind the start line keeps the whole car on a collider
  // while it waits on the line.
  const apron = 3;
  addSurface(
    first.position.clone().addScaledVector(first.tangent, -apron / 2),
    first,
    apron,
  );

  const step = 1;
  for (let index = step; index < frames.length; index += step) {
    const a = frames[index - step];
    const b = frames[index];
    if (!a || !b) {
      continue;
    }
    const length = a.position.distanceTo(b.position);
    if (length < 1e-4) {
      continue;
    }
    const frame = b;
    const middle = a.position.clone().add(b.position).multiplyScalar(0.5);
    const rotation = quaternionOf(frame);
    addSurface(middle, frame, length);

    for (const side of [-1, 1]) {
      const rail = middle
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
          .setRotation(rotation)
          .setFriction(0.2)
          .setRestitution(0.2)
          .setCollisionGroups(groups(GROUP_RAIL, GROUP_CHASSIS | GROUP_WHEEL)),
        track,
      );
    }
  }

  const start = first.position
    .clone()
    .addScaledVector(first.up, PHYSICS_RIDE_HEIGHT);
  const car = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.45)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(
      CAR_WIDTH / 2,
      CHASSIS_HALF_HEIGHT,
      CAR_LENGTH / 2,
    )
      .setMass(CAR_MASS * 0.65)
      .setFriction(0.2)
      .setRestitution(0.1)
      .setCollisionGroups(groups(GROUP_CHASSIS, GROUP_RAIL))
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(IMPACT_THRESHOLD),
    car,
  );
  for (const mount of WHEEL_MOUNTS) {
    world.createCollider(
      RAPIER.ColliderDesc.ball(PHYSICS_WHEEL_RADIUS)
        .setTranslation(mount.x, PHYSICS_WHEEL_MOUNT_Y, mount.z)
        .setMass((CAR_MASS * 0.35) / WHEEL_MOUNTS.length)
        .setFriction(0.2)
        .setRestitution(0.05)
        .setCollisionGroups(groups(GROUP_WHEEL, GROUP_TRACK | GROUP_RAIL))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(IMPACT_THRESHOLD),
      car,
    );
  }

  const events = new RAPIER.EventQueue(true);
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const toSurface = new THREE.Vector3();
  const carPosition = new THREE.Vector3();
  let pendingImpact = 0;

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

      const engine = input.brake
        ? -PHYSICS_BRAKE_FORCE
        : PHYSICS_ENGINE_FORCE * input.throttle;
      car.addForce(
        { x: forward.x * engine, y: forward.y * engine, z: forward.z * engine },
        true,
      );

      const linear = car.linvel();
      velocity.set(linear.x, linear.y, linear.z);
      const speed = velocity.length();
      if (speed > 0.01) {
        const drag = -PHYSICS_DRAG * speed * speed;
        car.addForce(
          {
            x: (velocity.x / speed) * drag,
            y: (velocity.y / speed) * drag,
            z: (velocity.z / speed) * drag,
          },
          true,
        );
      }

      // Steering is a yaw torque around the car's own up vector.
      const steerTorque = input.steer * PHYSICS_STEER_TORQUE;
      car.addTorque(
        { x: up.x * steerTorque, y: up.y * steerTorque, z: up.z * steerTorque },
        true,
      );

      // Guide assist: pull the body onto the track surface and align its
      // heading with the local tangent. This is what lets a toy car hold a
      // loop; it adds no forward energy.
      const translation = car.translation();
      carPosition.set(translation.x, translation.y, translation.z);
      toSurface.copy(frame.position).sub(carPosition);
      // The guide only acts while the car is on the track. Once it is airborne
      // or off the surface, gravity and the rescue timer take over; applying
      // the spring to a distant frame would fling the body across the scene.
      if (toSurface.length() < TRACK_WIDTH) {
        const verticalSpeed = velocity.dot(frame.up);
        const height = toSurface.dot(frame.up) + PHYSICS_RIDE_HEIGHT;
        const stick =
          height * PHYSICS_STICK_STRENGTH -
          verticalSpeed * PHYSICS_STICK_DAMPING;
        car.addForce(
          {
            x: frame.up.x * stick,
            y: frame.up.y * stick,
            z: frame.up.z * stick,
          },
          true,
        );

        const lateralOffset = toSurface.dot(frame.right);
        const lateralSpeed = velocity.dot(frame.right);
        const targetLateral = input.steer * (TRACK_WIDTH / 2 - 0.7);
        const lateral =
          (targetLateral - lateralOffset) * PHYSICS_LATERAL_STRENGTH -
          lateralSpeed * PHYSICS_LATERAL_DAMPING;
        car.addForce(
          {
            x: frame.right.x * lateral,
            y: frame.right.y * lateral,
            z: frame.right.z * lateral,
          },
          true,
        );

        desired.copy(frame.tangent).applyAxisAngle(frame.up, input.steer * 0.22);
        axis.crossVectors(forward, desired);
        const angle = Math.asin(THREE.MathUtils.clamp(axis.length(), -1, 1));
        if (axis.lengthSq() > 1e-6) {
          axis.normalize().multiplyScalar(angle * PHYSICS_HEADING_ASSIST);
          car.addTorque({ x: axis.x, y: axis.y, z: axis.z }, true);
        }

        // Roll and pitch onto the bank or loop surface. Without this the body
        // stays upright while the track tilts, one side of the car loses its
        // wheels, and the guide spring flips it.
        axis.crossVectors(up, frame.up);
        const upAngle = Math.asin(
          THREE.MathUtils.clamp(axis.length(), -1, 1),
        );
        if (axis.lengthSq() > 1e-6) {
          axis.normalize().multiplyScalar(upAngle * PHYSICS_UP_ALIGNMENT);
          car.addTorque({ x: axis.x, y: axis.y, z: axis.z }, true);
        }
      }

      world.timestep = dt;
      world.step(events);
      events.drainContactForceEvents((event) => {
        const impulse = event.totalForceMagnitude() * dt;
        pendingImpact = Math.max(pendingImpact, impulse);
      });
    },

    read: () => {
      const translation = car.translation();
      const rotation = car.rotation();
      const linear = car.linvel();
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
        velocity: new THREE.Vector3(linear.x, linear.y, linear.z),
        speed: Math.hypot(linear.x, linear.y, linear.z),
      };
    },

    takeImpact: () => {
      const impact = pendingImpact;
      pendingImpact = 0;
      return impact;
    },

    boost: (impulse) => {
      const rotation = car.rotation();
      const orientation = new THREE.Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      forward.set(0, 0, 1).applyQuaternion(orientation);
      car.applyImpulse(
        {
          x: forward.x * impulse,
          y: forward.y * impulse,
          z: forward.z * impulse,
        },
        true,
      );
    },

    reset: (frame) => {
      const position = frame.position
        .clone()
        .addScaledVector(frame.up, PHYSICS_RIDE_HEIGHT);
      car.setTranslation(position, true);
      const orientation = quaternionOf(frame);
      car.setRotation(orientation, true);
      car.setLinvel({ x: 0, y: 0, z: 0 }, true);
      car.setAngvel({ x: 0, y: 0, z: 0 }, true);
      pendingImpact = 0;
    },

    dispose: () => {
      events.free();
      world.free();
    },
  };
}
