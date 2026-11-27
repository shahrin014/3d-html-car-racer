import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BOOST_COOLDOWN,
  BOOST_IMPULSE,
  FIXED_STEP,
  SPIRAL_HEIGHT,
  STEEP_RAMP_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import { opponentSpecs } from './opponents';
import { createPhysics } from './physics';
import { buildFrames, generateCircuit, type TrackFrame } from './track';

const SEED = 'rapier-physics-trace';

/** Advance the nearest-frame search without letting the closing frame win at
 * the start line; this mirrors `Game.nearestTrackIndex`. */
function nextIndex(
  frames: TrackFrame[],
  previous: number,
  position: { x: number; y: number; z: number },
): number {
  let best = previous;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offset = -2; offset <= 40; offset += 1) {
    const candidate = previous + offset;
    if (candidate < 0) {
      continue;
    }
    const index = candidate >= frames.length ? candidate - frames.length : candidate;
    const frame = frames[index];
    if (!frame) {
      continue;
    }
    const dx = frame.position.x - position.x;
    const dy = frame.position.y - position.y;
    const dz = frame.position.z - position.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function lateralOffset(
  frame: TrackFrame,
  position: { x: number; y: number; z: number },
): number {
  return (
    (position.x - frame.position.x) * frame.right.x +
    (position.y - frame.position.y) * frame.right.y +
    (position.z - frame.position.z) * frame.right.z
  );
}

/** World-space angular velocity for a one-step quaternion change. */
function angularVelocity(
  current: THREE.Quaternion,
  previous: THREE.Quaternion,
  out: THREE.Vector3,
): THREE.Vector3 {
  const delta = current.clone().multiply(previous.clone().invert());
  const w = Math.abs(delta.w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  const angle = 2 * Math.acos(Math.min(1, w));
  if (sinHalf < 1e-9) {
    return out.set(0, 0, 0);
  }
  const scale = angle / (sinHalf * FIXED_STEP);
  out.set(delta.x * scale, delta.y * scale, delta.z * scale);
  if (delta.w < 0) {
    out.negate();
  }
  return out;
}

/**
 * RMS of the part of a per-step signal above roughly 1.6 Hz. Slower motion is
 * driving; faster motion is chatter.
 */
function chatterRms(values: number[], tauSeconds = 0.1): number {
  const alpha = 1 - Math.exp(-FIXED_STEP / tauSeconds);
  let low = values[0] ?? 0;
  let sum = 0;
  for (const value of values) {
    low += (value - low) * alpha;
    const high = value - low;
    sum += high * high;
  }
  return Math.sqrt(sum / Math.max(1, values.length));
}

describe('Rapier vehicle', () => {
  it('accelerates from rest and responds to steering', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = 0;

    for (let step = 0; step < 120; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 0 },
        frames[index]!,
      );
    }
    expect(physics.read().speed).toBeGreaterThan(2);

    for (let step = 0; step < 60; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[index]!,
      );
    }
    const state = physics.read();
    const offset = lateralOffset(frames[nextIndex(frames, index, state.position)]!, state.position);
    expect(Math.abs(offset)).toBeGreaterThan(0.1);

    physics.dispose();
  }, 30_000);

  it('holds a loop and a lap without leaving the track or chattering', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = 0;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let maxGap = 0;
    let maxSpeed = 0;
    let crossed = false;
    const rollRates: number[] = [];
    const omega = new THREE.Vector3();
    const forward = new THREE.Vector3();
    let previousQuaternion: THREE.Quaternion | null = null;

    for (let step = 0; step < 120 * 30 && !crossed; step += 1) {
      const state = physics.read();
      if (previousQuaternion) {
        angularVelocity(state.quaternion, previousQuaternion, omega);
        forward.set(0, 0, 1).applyQuaternion(state.quaternion);
        rollRates.push(omega.dot(forward));
      }
      previousQuaternion = state.quaternion;
      const previous = index;
      index = nextIndex(frames, index, state.position);
      if (
        previous > frames.length * 0.75 &&
        index < frames.length * 0.25
      ) {
        crossed = true;
      }
      const frame = frames[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );

      maxHeight = Math.max(maxHeight, state.position.y);
      maxGap = Math.max(maxGap, state.position.distanceTo(frame.position));
      maxSpeed = Math.max(maxSpeed, state.speed);

      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer },
        frame,
      );
    }

    expect(maxSpeed).toBeGreaterThan(10);
    expect(maxHeight).toBeGreaterThan(8);
    expect(maxGap).toBeLessThan(TRACK_WIDTH);
    expect(crossed).toBe(true);

    // Body shake, measured as the high-frequency part of the roll rate about
    // the car's own forward axis. Four separate wheel colliders measured
    // 2.76 rad/s because each sphere was its own contact point; one rounded
    // chassis collider keeps it near 2.0. The faster car now spends more of
    // this one-lap sample at racing speed, where seam contacts are most
    // frequent, so the raw limit is 2.4 (the drawn pose is low-pass filtered).
    // It still sits below the old wheel-sphere shake.
    expect(chatterRms(rollRates)).toBeLessThan(2.4);

    physics.dispose();
  }, 60_000);

  it('climbs a spiral ramp without leaving the deck', async () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    for (let candidateIndex = 0; candidateIndex < 60; candidateIndex += 1) {
      const candidate = generateCircuit(`spiral-drive-${candidateIndex}`, 1);
      if (candidate.pieces.some((piece) => piece.kind === 'spiral-up')) {
        circuit = candidate;
        break;
      }
    }
    expect(circuit).not.toBeNull();

    const frames = buildFrames(circuit!);
    let distance = 0;
    let entryS = 0;
    for (const piece of circuit!.pieces) {
      if (piece.kind === 'spiral-up') {
        entryS = distance;
        break;
      }
      distance += piece.length;
    }
    let index = frames.findIndex((frame) => frame.s >= entryS);
    if (index < 0) {
      index = 0;
    }
    const entry = frames[index]!;
    const physics = await createPhysics(frames);
    physics.reset(entry);

    let maxGap = 0;
    let maxHeight = entry.position.y;
    for (let step = 0; step < 120 * 12; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      const frame = frames[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      maxGap = Math.max(maxGap, state.position.distanceTo(frame.position));
      maxHeight = Math.max(maxHeight, state.position.y);
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
    }

    expect(maxGap).toBeLessThan(TRACK_WIDTH);
    expect(maxHeight - entry.position.y).toBeGreaterThan(SPIRAL_HEIGHT - 1);
    physics.dispose();
  }, 60_000);
});

describe('opponents', () => {
  it('drives the field along the circuit and keeps it on the deck', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames, {
      opponents: opponentSpecs(3),
    });
    const start = physics.readOpponents();
    expect(start).toHaveLength(3);

    const guide = frames[0]!;
    for (let step = 0; step < 240; step += 1) {
      physics.step(FIXED_STEP, { throttle: 0, brake: false, steer: 0 }, guide);
    }

    const after = physics.readOpponents();
    expect(after).toHaveLength(3);
    for (let index = 0; index < after.length; index += 1) {
      const before = start[index]!;
      const current = after[index]!;
      // Two seconds of racing moves several car lengths forward.
      expect(current.position.distanceTo(before.position)).toBeGreaterThan(8);
      // The racing line keeps the body above the deck and inside the rails.
      const distanceToTrack = Math.min(
        ...frames.map((frame) => frame.position.distanceTo(current.position)),
      );
      expect(distanceToTrack).toBeLessThan(TRACK_WIDTH);
      expect(current.speed).toBeGreaterThan(0);
      // Placing compares unwrapped distance, so it must grow too.
      expect(current.travelled).toBeGreaterThan(before.travelled);
    }

    physics.dispose();
  }, 60_000);
});

describe('jumps', () => {
  it('launches over the gap and lands on the ramp', async () => {
    let frames: TrackFrame[] | null = null;
    let gapIndex = -1;
    for (let index = 0; index < 40; index += 1) {
      const candidate = buildFrames(generateCircuit(`jump-run-${index}`, 1));
      const gap = candidate.findIndex((frame) => !frame.solid);
      if (gap > 100) {
        frames = candidate;
        gapIndex = gap;
        break;
      }
    }
    expect(frames).not.toBeNull();
    const track = frames!;
    const physics = await createPhysics(track);
    const start = Math.max(0, gapIndex - 90);
    physics.reset(track[start]!);

    let index = start;
    let maxGapVertical = Number.NEGATIVE_INFINITY;
    let lastGapVertical = 0;
    let landedSpeed = 0;
    let sawGap = false;
    let hasLanded = false;

    for (let step = 0; step < 120 * 10; step += 1) {
      const state = physics.read();
      index = nextIndex(track, index, state.position);
      const frame = track[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);

      const after = physics.read();
      if (!frame.solid) {
        const vertical =
          after.velocity.x * frame.up.x +
          after.velocity.y * frame.up.y +
          after.velocity.z * frame.up.z;
        sawGap = true;
        maxGapVertical = Math.max(maxGapVertical, vertical);
        lastGapVertical = vertical;
      }
      if (sawGap && index > gapIndex + 30 && frame.solid && after.speed > 4) {
        hasLanded = true;
        landedSpeed = after.speed;
        break;
      }
    }

    physics.dispose();
    expect(sawGap).toBe(true);
    // The lip launches the car upward and the guide is off over the gap, so
    // gravity bends the flight path down. Engine thrust points along the nose,
    // which softens but never reverses that decay; a fixed magnitude would tie
    // the test to the current top speed.
    expect(maxGapVertical).toBeGreaterThan(0.2);
    expect(lastGapVertical).toBeLessThan(maxGapVertical - 0.3);
    expect(hasLanded).toBe(true);
    expect(landedSpeed).toBeGreaterThan(4);
  }, 60_000);
});

describe('obstacles', () => {
  it('stops the car at a solid block and records an impact', async () => {
    const frames: TrackFrame[] = [];
    for (let z = 0; z <= 60; z += 1) {
      frames.push({
        position: new THREE.Vector3(0, 0, z),
        tangent: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        s: z,
        solid: true,
        halfWidth: TRACK_WIDTH / 2,
        rails: true,
      });
    }
    const blockZ = 30;
    const physics = await createPhysics(frames, {
      obstacles: [
        {
          position: new THREE.Vector3(0, 0.45, blockZ),
          quaternion: new THREE.Quaternion(),
          halfExtents: new THREE.Vector3(0.5, 0.45, 0.45),
          pieceIndex: 0,
        },
      ],
    });
    physics.reset(frames[0]!);

    let impact = 0;
    let event: ReturnType<typeof physics.takeImpactEvent> = null;
    for (let step = 0; step < 120 * 5; step += 1) {
      const state = physics.read();
      const index = Math.max(
        0,
        Math.min(frames.length - 1, Math.floor(state.position.z)),
      );
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 0 },
        frames[index]!,
      );
      const hit = physics.takeImpactEvent();
      if (hit && hit.magnitude >= impact) {
        impact = hit.magnitude;
        event = hit;
      }
    }

    const end = physics.read();
    physics.dispose();
    // The block is solid: the car cannot drive through it, and the contact
    // force is reported as an impact so the race can add damage. The event
    // carries the contact point so the renderer can put sparks on the hit.
    expect(impact).toBeGreaterThan(0);
    expect(event).not.toBeNull();
    expect(Number.isFinite(event!.position.x)).toBe(true);
    expect(Number.isFinite(event!.position.y)).toBe(true);
    expect(event!.position.z).toBeGreaterThan(20);
    expect(event!.position.z).toBeLessThan(blockZ);
    expect(event!.normal.length()).toBeCloseTo(1, 3);
    expect(end.position.z).toBeLessThan(blockZ);
  }, 30_000);
});

describe('impact filtering', () => {
  const straightFrames = (): TrackFrame[] => {
    const frames: TrackFrame[] = [];
    for (let z = 0; z <= 60; z += 1) {
      frames.push({
        position: new THREE.Vector3(0, 0, z),
        tangent: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        s: z,
        solid: true,
        halfWidth: TRACK_WIDTH / 2,
        rails: true,
      });
    }
    return frames;
  };

  it('does not report deck contact as an impact while driving straight', async () => {
    const frames = straightFrames();
    const physics = await createPhysics(frames);
    physics.reset(frames[0]!);

    let impacts = 0;
    for (let step = 0; step < 120 * 5; step += 1) {
      const state = physics.read();
      const index = Math.max(
        0,
        Math.min(frames.length - 1, Math.floor(state.position.z)),
      );
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 0 },
        frames[index]!,
      );
      if (physics.takeImpactEvent()) {
        impacts += 1;
      }
    }

    const end = physics.read();
    physics.dispose();
    expect(end.position.z).toBeGreaterThan(20);
    expect(impacts).toBe(0);
  }, 30_000);

  it('does not report deck contact while weaving without drift', async () => {
    const frames = straightFrames();
    const physics = await createPhysics(frames);
    physics.reset(frames[0]!);

    let impacts = 0;
    for (let step = 0; step < 120 * 5; step += 1) {
      const state = physics.read();
      const index = Math.max(
        0,
        Math.min(frames.length - 1, Math.floor(state.position.z)),
      );
      const steer = Math.sin(step / 60) * 0.35;
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer },
        frames[index]!,
      );
      if (physics.takeImpactEvent()) {
        impacts += 1;
      }
    }

    const end = physics.read();
    physics.dispose();
    expect(end.position.z).toBeGreaterThan(20);
    expect(impacts).toBe(0);
  }, 30_000);

  it('reports a rail hit as an impact', async () => {
    const frames = straightFrames();
    const physics = await createPhysics(frames);
    physics.reset(frames[0]!);

    let hit: ReturnType<typeof physics.takeImpactEvent> = null;
    for (let step = 0; step < 120 * 4 && !hit; step += 1) {
      const state = physics.read();
      const index = Math.max(
        0,
        Math.min(frames.length - 1, Math.floor(state.position.z)),
      );
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[index]!,
      );
      hit = physics.takeImpactEvent();
    }

    physics.dispose();
    expect(hit).not.toBeNull();
    expect(hit!.magnitude).toBeGreaterThan(0);
  }, 30_000);
});

describe('bridges', () => {
  it('drives up the ramp and across the raised deck', async () => {
    let frames: TrackFrame[] | null = null;
    let deckIndex = -1;
    for (let index = 0; index < 40; index += 1) {
      const candidate = buildFrames(generateCircuit(`bridge-run-${index}`, 1));
      const deck = candidate.findIndex(
        (frame) =>
          frame.position.y > 8 &&
          Math.abs(frame.tangent.y) < 0.2 &&
          frame.up.y > 0.9,
      );
      if (deck > 60) {
        frames = candidate;
        deckIndex = deck;
        break;
      }
    }
    expect(frames).not.toBeNull();
    const track = frames!;
    const physics = await createPhysics(track);
    const start = Math.max(0, deckIndex - 110);
    physics.reset(track[start]!);

    let index = start;
    let peak = 0;
    let finishedSpeed = 0;
    for (let step = 0; step < 120 * 12; step += 1) {
      const state = physics.read();
      index = nextIndex(track, index, state.position);
      const frame = track[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
      peak = Math.max(peak, physics.read().position.y);
      if (index > deckIndex + 40) {
        finishedSpeed = physics.read().speed;
        break;
      }
    }

    physics.dispose();
    // The deck sits eight metres above the base; reaching it proves the car
    // climbed the ramp rather than stopping at its foot.
    expect(peak).toBeGreaterThan(8);
    expect(finishedSpeed).toBeGreaterThan(4);
  }, 60_000);

  it('climbs the steep boost ramp and flies onto the raised deck', async () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    let rampStart = 0;
    let rampEnd = 0;
    let gapStart = 0;
    let landingEnd = 0;
    let boostZones: { from: number; to: number }[] = [];
    for (let index = 0; index < 400; index += 1) {
      const candidate = generateCircuit(`steep-drive-${index}`, 3);
      const rampIndex = candidate.pieces.findIndex(
        (piece) => piece.kind === 'steep-ramp',
      );
      if (rampIndex < 0) {
        continue;
      }
      let candidateStart = 0;
      let candidateEnd = 0;
      let candidateGap = 0;
      let candidateLanding = 0;
      let distance = 0;
      const zones: { from: number; to: number }[] = [];
      candidate.pieces.forEach((piece, pieceIndex) => {
        if (pieceIndex === rampIndex) {
          candidateStart = distance;
          candidateEnd = distance + piece.length;
        }
        if (pieceIndex > rampIndex && piece.kind === 'gap') {
          candidateGap = distance;
        }
        if (pieceIndex > rampIndex && piece.kind === 'landing' && candidateGap > 0) {
          candidateLanding = distance + piece.length;
        }
        if (piece.boost) {
          zones.push({ from: distance, to: distance + piece.length });
        }
        distance += piece.length;
      });
      // Give the car a real approach; the stock level-1 rotation can place the
      // steep ramp near the start line, which is not a useful drive-through.
      if (candidateStart < 24) {
        continue;
      }
      circuit = candidate;
      rampStart = candidateStart;
      rampEnd = candidateEnd;
      gapStart = candidateGap;
      landingEnd = candidateLanding;
      boostZones = zones;
      break;
    }
    expect(circuit).not.toBeNull();
    expect(gapStart).toBeGreaterThan(rampEnd);
    expect(landingEnd).toBeGreaterThan(gapStart);
    expect(
      boostZones.some(
        (zone) => zone.from === rampStart && zone.to === rampEnd,
      ),
    ).toBe(true);

    const frames = buildFrames(circuit!);
    const entryIndex = Math.max(
      0,
      frames.findIndex((frame) => frame.s >= rampStart - 14),
    );
    const entry = frames[entryIndex]!;
    const physics = await createPhysics(frames);
    physics.reset(entry);

    let index = entryIndex;
    let cooldown = 0;
    let boosts = 0;
    let rampBoosts = 0;
    let peak = entry.position.y;
    let maxSolidGap = 0;
    let sawGap = false;
    let landed = false;
    for (let step = 0; step < 120 * 12; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      const frame = frames[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);

      cooldown = Math.max(0, cooldown - FIXED_STEP);
      const overBoost = boostZones.some(
        (zone) => frame.s >= zone.from && frame.s < zone.to,
      );
      if (overBoost && cooldown === 0) {
        physics.boost(BOOST_IMPULSE);
        cooldown = BOOST_COOLDOWN;
        boosts += 1;
        if (frame.s >= rampStart && frame.s < rampEnd) {
          rampBoosts += 1;
        }
      }

      const after = physics.read();
      peak = Math.max(peak, after.position.y);
      if (!frame.solid) {
        sawGap = true;
      } else if (frame.s < gapStart - 1 || frame.s > landingEnd + 1) {
        maxSolidGap = Math.max(
          maxSolidGap,
          after.position.distanceTo(frame.position),
        );
      }
      if (
        sawGap &&
        frame.s > gapStart &&
        frame.solid &&
        after.position.y >
          entry.position.y + STEEP_RAMP_HEIGHT - 2 &&
        after.speed > 4
      ) {
        landed = true;
      }
      if (landed && frame.s > landingEnd + 12) {
        break;
      }
    }

    physics.dispose();
    expect(boosts).toBeGreaterThan(0);
    expect(rampBoosts).toBeGreaterThan(0);
    expect(sawGap).toBe(true);
    expect(landed).toBe(true);
    // The ramp climbs four bridge levels and launches the car over the gap
    // onto the wide landing deck at the same height.
    expect(peak - entry.position.y).toBeGreaterThan(STEEP_RAMP_HEIGHT - 1);
    expect(maxSolidGap).toBeLessThan(TRACK_WIDTH);
  }, 60_000);

  it('rides the matching steep descent back to the lower deck', async () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    let descentStart = 0;
    let descentEnd = 0;
    let boostZones: { from: number; to: number }[] = [];
    for (let index = 0; index < 400; index += 1) {
      const candidate = generateCircuit(`steep-descent-${index}`, 3);
      const descentIndex = candidate.pieces.findIndex(
        (piece) => piece.kind === 'steep-ramp-down',
      );
      if (descentIndex < 0) {
        continue;
      }
      circuit = candidate;
      let distance = 0;
      const zones: { from: number; to: number }[] = [];
      candidate.pieces.forEach((piece, pieceIndex) => {
        if (pieceIndex === descentIndex) {
          descentStart = distance;
          descentEnd = distance + piece.length;
        }
        if (piece.boost) {
          zones.push({ from: distance, to: distance + piece.length });
        }
        distance += piece.length;
      });
      boostZones = zones;
      break;
    }
    expect(circuit).not.toBeNull();

    const frames = buildFrames(circuit!);
    const entryIndex = frames.findIndex(
      (frame) => frame.s >= descentStart - 16,
    );
    expect(entryIndex).toBeGreaterThan(0);
    const entry = frames[entryIndex]!;
    const physics = await createPhysics(frames);
    physics.reset(entry);

    let index = entryIndex;
    let cooldown = 0;
    let maxGap = 0;
    let endSpeed = 0;
    for (let step = 0; step < 120 * 12; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      const frame = frames[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);

      cooldown = Math.max(0, cooldown - FIXED_STEP);
      const overBoost = boostZones.some(
        (zone) => frame.s >= zone.from && frame.s < zone.to,
      );
      if (overBoost && cooldown === 0) {
        physics.boost(BOOST_IMPULSE);
        cooldown = BOOST_COOLDOWN;
      }

      const after = physics.read();
      if (frame.solid) {
        maxGap = Math.max(
          maxGap,
          after.position.distanceTo(frame.position),
        );
      }
      endSpeed = after.speed;
      if (frame.s > descentEnd + 12) {
        break;
      }
    }

    const end = physics.read();
    physics.dispose();
    expect(entry.position.y - end.position.y).toBeGreaterThan(
      STEEP_RAMP_HEIGHT - 1,
    );
    expect(maxGap).toBeLessThan(TRACK_WIDTH);
    expect(endSpeed).toBeGreaterThan(4);
  }, 60_000);
});

describe('two-crossing layout', () => {
  it('drives the double-crossing circuit without leaving the deck', async () => {
    const circuit = generateCircuit('cross-drive', 1, { crossovers: 2 });
    const track = buildFrames(circuit);
    const physics = await createPhysics(track);
    physics.reset(track[0]!);

    let index = 0;
    let maxGap = 0;
    let maxSpeed = 0;
    for (let step = 0; step < 120 * 20; step += 1) {
      const state = physics.read();
      index = nextIndex(track, index, state.position);
      const frame = track[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
      const after = physics.read();
      if (frame.solid) {
        maxGap = Math.max(maxGap, after.position.distanceTo(frame.position));
      }
      maxSpeed = Math.max(maxSpeed, after.speed);
    }

    physics.dispose();
    // The curve's own height separates its two crossings, so a car that holds
    // the line stays on the deck all the way round.
    expect(maxGap).toBeLessThan(TRACK_WIDTH);
    expect(maxSpeed).toBeGreaterThan(20);
  }, 60_000);
});
