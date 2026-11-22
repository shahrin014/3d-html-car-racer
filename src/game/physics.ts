import * as THREE from 'three';
import type { ObstacleSpec } from './obstacles';
import {
  advanceTravel,
  circuitLength,
  gradeAt,
  paceAt,
  racingPose,
  type OpponentSpec,
} from './opponents';
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
  PHYSICS_CENTRE_GAIN,
  PHYSICS_CHASSIS_ROUNDING,
  PHYSICS_DESCENT_BOOST,
  PHYSICS_DRAG,
  PHYSICS_DRIFT_SPEED,
  PHYSICS_ENGINE_FORCE,
  PHYSICS_GRIP,
  PHYSICS_HEADING_ASSIST,
  PHYSICS_LATERAL_GAIN,
  PHYSICS_RIDE_HEIGHT,
  PHYSICS_STEER_ANGLE,
  PHYSICS_STICK_DAMPING,
  PHYSICS_STICK_STRENGTH,
  PHYSICS_UP_DAMPING,
  PHYSICS_UP_ALIGNMENT,
  PHYSICS_YAW_DAMPING,
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

/** A rival's pose plus the distance it has covered since the grid. */
export interface OpponentState extends VehicleState {
  travelled: number;
}

export interface PhysicsOptions {
  /** Rivals to drive around the circuit as kinematic bodies. */
  opponents?: OpponentSpec[];
  /** Solid hazard blocks on the obstacle segments. */
  obstacles?: readonly ObstacleSpec[];
}

export interface PhysicsHandle {
  /** Advance the world by one fixed step with the given controls. */
  step: (dt: number, input: VehicleInput, frame: TrackFrame) => void;
  read: () => VehicleState;
  /** Current poses of the opponents, in the order they were created. */
  readOpponents: () => OpponentState[];
  /** Impulse-shaped impact magnitude accumulated since the last call. */
  takeImpact: () => number;
  /** Forward impulse for a boost strip, in newton-seconds. */
  boost: (impulse: number) => void;
  reset: (frame: TrackFrame) => void;
  dispose: () => void;
}

/**
 * Collision groups. One chassis collider touches both the driving surface and
 * the rails; the groups are kept separate so track and rail colliders can still
 * be tuned apart from each other.
 */
const GROUP_TRACK = 1;
const GROUP_RAIL = 2;
const GROUP_CHASSIS = 4;
const GROUP_OPPONENT = 8;
const GROUP_OBSTACLE = 16;
const groups = (membership: number, filter: number): number =>
  (membership << 16) | filter;

function quaternionOf(frame: TrackFrame): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.tangent),
  );
}

/**
 * Rapier-backed vehicle. The car is a real dynamic rigid body: mass, inertia,
 * gravity, friction, and CCD against static track and rail colliders.
 *
 * The body carries one rounded chassis collider and nothing else: the wheel
 * meshes are visual. A sharp chassis edge catches on the seams between tiled
 * surface colliders, and four independent wheel spheres chatter against them
 * because each one is its own point contact. A single rounded box slides over
 * the seams on a broad contact patch, which is both smoother and simpler.
 *
 * A guide assist adds downforce and yaw alignment so a toy car can hold a
 * loop; remove it and the same body slides, spins, and falls.
 *
 * Rapier is loaded lazily (it is a ~1.15 MB WASM payload), so the app shell
 * stays small and the engine arrives before the first race.
 */
export async function createPhysics(
  frames: TrackFrame[],
  options: PhysicsOptions = {},
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
        frame.halfWidth,
        TRACK_THICKNESS / 2,
        length / 2,
      )
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setFriction(0.35)
        .setRestitution(0.05)
        .setCollisionGroups(groups(GROUP_TRACK, GROUP_CHASSIS)),
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
    // A jump gap has frames for progress and the camera but no deck.
    if (!a.solid || !b.solid) {
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
        .addScaledVector(frame.right, side * (frame.halfWidth - RAIL_WIDTH / 2))
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
          .setCollisionGroups(groups(GROUP_RAIL, GROUP_CHASSIS)),
        track,
      );
    }
  }

  // Hazard blocks are fixed and only touch the player's chassis. They do not
  // collide with the deck or rails, and rivals pass through them along their
  // own lanes (which stay clear of every block).
  for (const obstacle of options.obstacles ?? []) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        obstacle.halfExtents.x,
        obstacle.halfExtents.y,
        obstacle.halfExtents.z,
      )
        .setTranslation(
          obstacle.position.x,
          obstacle.position.y,
          obstacle.position.z,
        )
        .setRotation(obstacle.quaternion)
        .setFriction(0.55)
        .setRestitution(0.1)
        .setCollisionGroups(groups(GROUP_OBSTACLE, GROUP_CHASSIS)),
      track,
    );
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
    RAPIER.ColliderDesc.roundCuboid(
      CAR_WIDTH / 2 - PHYSICS_CHASSIS_ROUNDING,
      CHASSIS_HALF_HEIGHT - PHYSICS_CHASSIS_ROUNDING,
      CAR_LENGTH / 2 - PHYSICS_CHASSIS_ROUNDING,
      PHYSICS_CHASSIS_ROUNDING,
    )
      .setMass(CAR_MASS)
      .setFriction(0.02)
      .setRestitution(0.05)
      .setCollisionGroups(
        groups(
          GROUP_CHASSIS,
          GROUP_TRACK | GROUP_RAIL | GROUP_OPPONENT | GROUP_OBSTACLE,
        ),
      )
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(IMPACT_THRESHOLD),
    car,
  );

  // Opponents are kinematic: they follow the racing line exactly, but the
  // player's chassis still collides with them, so rivals feel solid. They carry
  // the same rounded box as the player so the contact patch is comparable.
  const trackLength = circuitLength(frames);
  const opponents = (options.opponents ?? []).map((spec) => {
    const pose = racingPose(frames, spec.start, spec.lane);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pose.position.x, pose.position.y, pose.position.z)
        .setRotation(pose.quaternion),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        CAR_WIDTH / 2 - PHYSICS_CHASSIS_ROUNDING,
        CHASSIS_HALF_HEIGHT - PHYSICS_CHASSIS_ROUNDING,
        CAR_LENGTH / 2 - PHYSICS_CHASSIS_ROUNDING,
        PHYSICS_CHASSIS_ROUNDING,
      )
        .setFriction(0.08)
        .setRestitution(0.1)
        .setCollisionGroups(groups(GROUP_OPPONENT, GROUP_CHASSIS)),
      body,
    );
    return {
      spec,
      body,
      collider: collider.handle,
      distance: spec.start,
      travelled: spec.start,
    };
  });
  const opponentColliders = new Set(opponents.map((racer) => racer.collider));

  const events = new RAPIER.EventQueue(true);
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const angularRate = new THREE.Vector3();
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

      // The guide only acts while the car is on the track. Once it is airborne
      // or off the surface, gravity and the rescue timer take over; applying
      // the spring to a distant frame would fling the body across the scene.
      const translation = car.translation();
      carPosition.set(translation.x, translation.y, translation.z);
      toSurface.copy(frame.position).sub(carPosition);
      // The guide is off over a jump gap, so the body flies ballistically.
      const onTrack =
        frame.solid && toSurface.length() < TRACK_WIDTH;

      // Thrust follows the racing line while the guide is active. If it were
      // applied along the nose, holding lock at speed would push the car
      // sideways as well as forward, which is what makes the body slide.
      const thrust = onTrack ? frame.tangent : forward;
      const engine = input.brake
        ? -PHYSICS_BRAKE_FORCE
        : PHYSICS_ENGINE_FORCE * input.throttle;
      // Gravity alone adds only a modest amount on a descent. Add a downhill
      // share of the engine force so the player surges through the loop as
      // much as rivals do, but never while braking or flying over a gap.
      const descent =
        onTrack && !input.brake
          ? Math.max(0, -thrust.y) *
            PHYSICS_ENGINE_FORCE *
            input.throttle *
            PHYSICS_DESCENT_BOOST
          : 0;
      const drive = engine + descent;
      car.addForce(
        { x: thrust.x * drive, y: thrust.y * drive, z: thrust.z * drive },
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

      // Steering aims the nose off the track tangent; the guide assist below
      // turns that target into yaw. Positive steer is the driver's right, and
      // `frame.right` is `up x tangent`, which for a car facing +Z points to
      // the driver's left. Hence the negation.
      const steerAngle =
        -input.steer * PHYSICS_STEER_ANGLE * Math.min(1, speed / 6);

      // Guide assist: pull the body onto the track surface and align its
      // heading with the local tangent. This is what lets a toy car hold a
      // loop; it adds no forward energy.
      if (onTrack) {
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

        // `toSurface` points from the car to the frame, so the car's offset
        // from the centreline is the negated projection. Getting this sign
        // wrong turns the centring spring into a spring that pushes the car
        // toward the rails.
        const lateralOffset = -toSurface.dot(frame.right);
        const lateralSpeed = velocity.dot(frame.right);
        // Positive steer is the driver's right, i.e. -frame.right. Cap the
        // sideways acceleration at the grip budget: steering may drift the car
        // across the track, but never fling it further than a tyre could hold.
        const targetLateralSpeed = -input.steer * PHYSICS_DRIFT_SPEED;
        const grip = PHYSICS_GRIP * Math.abs(GRAVITY);
        const lateralAccel = THREE.MathUtils.clamp(
          (targetLateralSpeed - lateralSpeed) * PHYSICS_LATERAL_GAIN -
            lateralOffset * PHYSICS_CENTRE_GAIN,
          -grip,
          grip,
        );
        const lateralForce = lateralAccel * CAR_MASS;
        car.addForce(
          {
            x: frame.right.x * lateralForce,
            y: frame.right.y * lateralForce,
            z: frame.right.z * lateralForce,
          },
          true,
        );

        desired.copy(frame.tangent).applyAxisAngle(frame.up, steerAngle);
        axis.crossVectors(forward, desired);
        const angle = Math.asin(THREE.MathUtils.clamp(axis.length(), -1, 1));
        if (axis.lengthSq() > 1e-6) {
          const angular = car.angvel();
          const yawRate =
            angular.x * up.x + angular.y * up.y + angular.z * up.z;
          axis.normalize().multiplyScalar(angle * PHYSICS_HEADING_ASSIST);
          axis.addScaledVector(up, -yawRate * PHYSICS_YAW_DAMPING);
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
          // Damp roll and pitch. The alignment above is a spring; without a
          // damper any contact bump rings the body at a few hertz, which reads
          // as the car shaking. Only the rate across the up axis is damped;
          // yaw has its own damper above.
          const angular = car.angvel();
          const spin = angular.x * up.x + angular.y * up.y + angular.z * up.z;
          angularRate.set(
            angular.x - up.x * spin,
            angular.y - up.y * spin,
            angular.z - up.z * spin,
          );
          axis.addScaledVector(angularRate, -PHYSICS_UP_DAMPING);
          car.addTorque({ x: axis.x, y: axis.y, z: axis.z }, true);
        }
      }

      for (const racer of opponents) {
        const advanced = advanceTravel(
          racer.spec,
          racer.travelled,
          dt,
          trackLength,
          gradeAt(frames, racer.distance),
        );
        racer.travelled = advanced.travelled;
        racer.distance = advanced.distance;
        const pose = racingPose(frames, racer.distance, racer.spec.lane);
        racer.body.setNextKinematicTranslation(pose.position);
        racer.body.setNextKinematicRotation(pose.quaternion);
      }

      world.timestep = dt;
      world.step(events);
      events.drainContactForceEvents((event) => {
        // Bumping a rival is part of racing, not a crash: kinematic bodies can
        // produce large solver forces, so their contacts never add damage.
        if (
          opponentColliders.has(event.collider1()) ||
          opponentColliders.has(event.collider2())
        ) {
          return;
        }
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

    readOpponents: () =>
      opponents.map((racer) => {
        const translation = racer.body.translation();
        const rotation = racer.body.rotation();
        const pose = racingPose(frames, racer.distance, racer.spec.lane);
        const pace = paceAt(racer.spec, racer.distance, pose.tangent.y);
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
          velocity: pose.tangent.clone().multiplyScalar(pace),
          speed: pace,
          travelled: racer.travelled,
        };
      }),

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
      for (const racer of opponents) {
        racer.distance = racer.spec.start;
        racer.travelled = racer.spec.start;
        const pose = racingPose(frames, racer.distance, racer.spec.lane);
        racer.body.setTranslation(pose.position, true);
        racer.body.setRotation(pose.quaternion, true);
        racer.body.setNextKinematicTranslation(pose.position);
        racer.body.setNextKinematicRotation(pose.quaternion);
      }
    },

    dispose: () => {
      events.free();
      world.free();
    },
  };
}
