import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BRIDGE_CLEARANCE,
  BRIDGE_HEIGHT,
  BRIDGE_LENGTH,
  BRIDGE_RAMP_LENGTH,
  CAR_HEIGHT,
  CAR_WIDTH,
  JUMP_GAP_LENGTH,
  JUMP_HEIGHT,
  JUMP_KICKER_LENGTH,
  JUMP_LANDING_HEIGHT,
  JUMP_LANDING_LENGTH,
  JUMP_LAUNCH_SLOPE,
  JUMP_LENGTH,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
  MIN_TURN_RADIUS,
  RAIL_HEIGHT,
  SPIRAL_HEIGHT,
  SPIRAL_LEVELS,
  SPIRAL_RADIUS,
  SPIRAL_TURNS,
  STEEP_RAMP_ANGLE,
  STEEP_RAMP_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import {
  bridgeDeckPath,
  bridgeRampDownPath,
  bridgeRampUpPath,
  buildFrames,
  gapPath,
  generateCircuit,
  jumpPlanarLength,
  kickerPath,
  landingPath,
  loopPath,
  shiftPath,
  spiralArcLength,
  spiralDownPath,
  spiralInnerRadius,
  spiralUpPath,
  steepRampDownPath,
  steepRampRun,
  steepRampUpPath,
  turnPath,
  validateCircuit,
  type Piece,
  type TrackPath,
} from './track';

/** Local frame at the end of a path, as the piece placement composes it. */
function endFrame(path: TrackPath): THREE.Matrix4 {
  const sample = path(1);
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3().crossVectors(sample.up, sample.tangent).normalize(),
    sample.up,
    sample.tangent,
  ).setPosition(sample.position);
}

const SEED = '2026-11-15';

describe('circuit generation', () => {
  it('is deterministic for the same seed and level', () => {
    const first = buildFrames(generateCircuit(SEED, 1));
    const second = buildFrames(generateCircuit(SEED, 1));
    expect(first.length).toBe(second.length);
    const a = first[Math.floor(first.length / 2)];
    const b = second[Math.floor(second.length / 2)];
    expect(a?.position.x).toBeCloseTo(b?.position.x ?? 0, 6);
    expect(a?.position.z).toBeCloseTo(b?.position.z ?? 0, 6);
  });

  it('produces a different circuit for a different seed', () => {
    const first = buildFrames(generateCircuit(SEED, 1));
    const second = buildFrames(generateCircuit('2026-11-16', 1));
    const a = first[Math.floor(first.length / 2)];
    const b = second[Math.floor(second.length / 2)];
    const differs =
      Math.abs((a?.position.x ?? 0) - (b?.position.x ?? 0)) > 1e-6 ||
      Math.abs((a?.position.z ?? 0) - (b?.position.z ?? 0)) > 1e-6;
    expect(differs).toBe(true);
  });

  it('closes back onto the start line', () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const first = frames[0];
    const last = frames[frames.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(first?.position.distanceTo(last?.position ?? new THREE.Vector3())).toBeLessThan(0.02);
    const dot = first?.tangent.dot(last?.tangent ?? new THREE.Vector3()) ?? 0;
    expect(dot).toBeGreaterThan(0.999);
  });

  it('contains a loop, banked turns, and boost strips', () => {
    const circuit = generateCircuit(SEED, 1);
    expect(circuit.pieces.filter((piece) => piece.kind === 'loop').length).toBeGreaterThan(0);
    expect(circuit.pieces.filter((piece) => piece.kind === 'turn').length).toBeGreaterThanOrEqual(2);
    expect(circuit.pieces.filter((piece) => piece.kind === 'boost').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps frames evenly spaced along the track', () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const gaps: number[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const current = frames[index];
      if (previous && current) {
        gaps.push(previous.position.distanceTo(current.position));
      }
    }
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    expect(average).toBeGreaterThan(0.2);
    expect(average).toBeLessThan(0.9);
  });
});

describe('track pieces', () => {
  it('gives the track seven car widths and a car-height rail', () => {
    expect(TRACK_WIDTH).toBe(CAR_WIDTH * 7);
    expect(RAIL_HEIGHT).toBeGreaterThanOrEqual(CAR_HEIGHT);
  });

  it('turns the car upside down at the top of the loop', () => {
    const top = loopPath()(0.5);
    expect(top.up.y).toBeCloseTo(-1, 6);
    expect(top.position.y).toBeGreaterThan(LOOP_RADIUS * 1.8);
  });

  it('swings the loop exit sideways, then the shift returns to the centreline', () => {
    const path = loopPath();
    const start = path(0);
    const end = path(1);
    expect(end.position.x - start.position.x).toBeCloseTo(LOOP_OFFSET, 5);
    // The exit lane must clear the entry lane by more than a track width.
    expect(end.position.x - start.position.x).toBeGreaterThan(TRACK_WIDTH);
    expect(start.up.dot(end.up)).toBeCloseTo(1, 6);
    const shifted = shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH)(1);
    expect(shifted.position.x).toBeCloseTo(-LOOP_OFFSET, 6);
  });

  it('joins a kicker, gap, and landing into one launch', () => {
    const kicker = kickerPath();
    const gap = gapPath();
    const landing = landingPath();
    // The kicker lifts the car and ends pointing up the launch line; the gap
    // is empty space on that line; the landing ramp enters on the same line
    // and sinks back to a flat deck. Composing the three placed frames proves
    // the module ends flat, at ground height, and facing the way it started.
    const launch = new THREE.Vector3(0, JUMP_LAUNCH_SLOPE, 1).normalize();
    expect(kicker(1).position.y).toBeCloseTo(JUMP_HEIGHT, 6);
    expect(kicker(1).tangent.angleTo(launch)).toBeLessThan(1e-6);
    expect(gap(0).position.y).toBeCloseTo(0, 6);
    expect(gap(1).tangent.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6);
    expect(landing(0).tangent.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(
      1e-6,
    );
    // The landing deck's top edge sits below the kicker lip.
    const landingEntry = landing(0)
      .position.clone()
      .applyMatrix4(endFrame(kicker).multiply(endFrame(gap)));
    expect(landingEntry.y).toBeLessThan(JUMP_HEIGHT - 1e-6);
    expect(landingEntry.y).toBeCloseTo(JUMP_LANDING_HEIGHT, 6);

    const world = new THREE.Matrix4()
      .multiply(endFrame(kicker))
      .multiply(endFrame(gap))
      .multiply(endFrame(landing));
    const end = new THREE.Vector3(0, 0, 0).applyMatrix4(world);
    const heading = new THREE.Vector3(0, 0, 1)
      .transformDirection(world)
      .normalize();
    const up = new THREE.Vector3(0, 1, 0).transformDirection(world).normalize();
    expect(end.y).toBeCloseTo(0, 6);
    expect(heading.dot(new THREE.Vector3(0, 0, 1))).toBeCloseTo(1, 6);
    expect(up.dot(new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 6);

    expect(JUMP_LENGTH).toBe(
      JUMP_KICKER_LENGTH + JUMP_GAP_LENGTH + JUMP_LANDING_LENGTH,
    );
    // The jump is longer than the 30 m slot the flat module used to fill, so a
    // leg must reserve more than a hill's worth of deck for it.
    expect(JUMP_LENGTH).toBe(44);
    // The module's plan advance is what the leg budget must reserve; it is
    // slightly longer than the three piece lengths because of the launch tilt.
    expect(jumpPlanarLength()).toBeGreaterThan(JUMP_LENGTH);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(jumpPlanarLength(), 4);
  });

  it('marks gap frames as non-solid for physics and the guide', () => {
    for (let index = 0; index < 40; index += 1) {
      const circuit = generateCircuit(`jump-check-${index}`, 1);
      if (!circuit.pieces.some((piece) => piece.kind === 'gap')) {
        continue;
      }
      const frames = buildFrames(circuit);
      const inGap = frames.filter((frame) => !frame.solid);
      expect(inGap.length).toBeGreaterThan(0);
      // Closure still holds with a jump in the layout.
      expect(
        frames[0]?.position.distanceTo(frames[frames.length - 1]!.position) ?? 1,
      ).toBeLessThan(0.05);
      return;
    }
    throw new Error('no jump circuit found');
  });

  it('builds a 70 degree steep ramp with flat joins at both ends', () => {
    const height = STEEP_RAMP_HEIGHT;
    const run = steepRampRun(height);
    const path = steepRampUpPath(height);
    const start = path(0);
    const end = path(1);

    expect(run).toBeGreaterThan(height / Math.tan((STEEP_RAMP_ANGLE * Math.PI) / 180));
    expect(end.position.z).toBeCloseTo(run, 6);
    expect(start.position.y).toBeCloseTo(0, 6);
    expect(end.position.y).toBeCloseTo(height, 6);
    // Both joins meet a level deck at zero slope.
    expect(Math.abs(start.tangent.y)).toBeLessThan(1e-6);
    expect(Math.abs(end.tangent.y)).toBeLessThan(1e-6);
    expect(start.up.y).toBeCloseTo(1, 6);
    expect(end.up.y).toBeCloseTo(1, 6);

    let peakPitch = 0;
    let previousY = start.position.y;
    for (let index = 0; index <= 200; index += 1) {
      const sample = path(index / 200);
      const pitch =
        (Math.atan2(sample.tangent.y, sample.tangent.z) * 180) / Math.PI;
      peakPitch = Math.max(peakPitch, pitch);
      expect(sample.position.y).toBeGreaterThanOrEqual(previousY - 1e-9);
      previousY = sample.position.y;
    }
    expect(peakPitch).toBeCloseTo(STEEP_RAMP_ANGLE, 6);
  });

  it('drops the same steep face back to the lower deck', () => {
    const height = STEEP_RAMP_HEIGHT;
    const path = steepRampDownPath(height);
    const start = path(0);
    const end = path(1);

    expect(start.position.y).toBeCloseTo(0, 6);
    expect(end.position.y).toBeCloseTo(-height, 6);
    expect(Math.abs(start.tangent.y)).toBeLessThan(1e-6);
    expect(Math.abs(end.tangent.y)).toBeLessThan(1e-6);
    expect(start.up.y).toBeCloseTo(1, 6);
    expect(end.up.y).toBeCloseTo(1, 6);

    let peakPitch = 0;
    let previousY = start.position.y;
    for (let index = 0; index <= 200; index += 1) {
      const sample = path(index / 200);
      const pitch =
        (Math.atan2(-sample.tangent.y, sample.tangent.z) * 180) / Math.PI;
      peakPitch = Math.max(peakPitch, pitch);
      expect(sample.position.y).toBeLessThanOrEqual(previousY + 1e-9);
      previousY = sample.position.y;
    }
    expect(peakPitch).toBeCloseTo(STEEP_RAMP_ANGLE, 6);
  });

  it('joins the bridge ramps and deck into a level crossing', () => {
    const up = bridgeRampUpPath();
    const deck = bridgeDeckPath();
    const down = bridgeRampDownPath();
    expect(up(1).position.y).toBeCloseTo(BRIDGE_HEIGHT, 6);
    expect(up(1).tangent.y).toBeCloseTo(0, 6);
    expect(deck(0).tangent.y).toBeCloseTo(0, 6);
    expect(down(1).position.y).toBeCloseTo(-BRIDGE_HEIGHT, 6);
    expect(down(1).tangent.y).toBeCloseTo(0, 6);

    const world = new THREE.Matrix4()
      .multiply(endFrame(up))
      .multiply(endFrame(deck))
      .multiply(endFrame(down));
    const end = new THREE.Vector3().setFromMatrixPosition(world);
    expect(end.y).toBeCloseTo(0, 6);
    expect(
      new THREE.Vector3(0, 0, 1).transformDirection(world).z,
    ).toBeCloseTo(1, 6);
    // The ramps are long enough to keep the climb under 35 degrees.
    const climb = Math.atan((1.5 * BRIDGE_HEIGHT) / BRIDGE_RAMP_LENGTH);
    expect(climb).toBeLessThan((35 * Math.PI) / 180);
  });

  it('spirals a full turn up one bridge level and returns overhead', () => {
    const path = spiralUpPath(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1);
    const start = path(0);
    const mid = path(0.5);
    const end = path(1);

    expect(start.position.length()).toBeCloseTo(0, 6);
    expect(end.position.x).toBeCloseTo(0, 6);
    expect(end.position.z).toBeCloseTo(0, 6);
    expect(end.position.y).toBeCloseTo(BRIDGE_HEIGHT, 6);
    expect(start.tangent.dot(end.tangent)).toBeCloseTo(1, 6);
    expect(start.up.dot(end.up)).toBeCloseTo(1, 6);
    // The entry and exit are flat, so the spiral joins a straight cleanly.
    expect(start.tangent.y).toBeCloseTo(0, 6);
    expect(end.tangent.y).toBeCloseTo(0, 6);
    // Halfway round is the far side of the circle, halfway up.
    expect(mid.position.x).toBeCloseTo(SPIRAL_RADIUS * 2, 6);
    expect(mid.position.y).toBeCloseTo(BRIDGE_HEIGHT / 2, 6);
    expect(mid.tangent.z).toBeLessThan(-0.9);
    // Every plan point sits on the circle whose centre is one radius to the
    // right of the approach.
    for (let index = 0; index <= 20; index += 1) {
      const point = path(index / 20).position;
      expect(
        Math.hypot(point.x - SPIRAL_RADIUS, point.z),
      ).toBeCloseTo(SPIRAL_RADIUS, 5);
    }
  });

  it('climbs several levels in one continuous spiral', () => {
    const path = spiralUpPath();
    const start = path(0);
    const end = path(1);

    expect(SPIRAL_TURNS).toBe(SPIRAL_LEVELS);
    expect(SPIRAL_HEIGHT).toBe(BRIDGE_HEIGHT * SPIRAL_LEVELS);
    expect(end.position.x).toBeCloseTo(0, 6);
    expect(end.position.z).toBeCloseTo(0, 6);
    expect(end.position.y).toBeCloseTo(SPIRAL_HEIGHT, 6);
    expect(start.tangent.dot(end.tangent)).toBeCloseTo(1, 6);
    // One full turn returns to the entry point, one bridge level higher.
    for (let turn = 1; turn <= SPIRAL_TURNS; turn += 1) {
      const point = path(turn / SPIRAL_TURNS).position;
      expect(point.x).toBeCloseTo(0, 6);
      expect(point.z).toBeCloseTo(0, 6);
      expect(point.y).toBeCloseTo(BRIDGE_HEIGHT * turn, 6);
    }
  });

  it('drops every level back to the deck', () => {
    const path = spiralDownPath();
    expect(path(0).position.y).toBeCloseTo(0, 6);
    expect(path(1).position.y).toBeCloseTo(-SPIRAL_HEIGHT, 6);
    expect(path(1).position.x).toBeCloseTo(0, 6);
    expect(path(1).position.z).toBeCloseTo(0, 6);
    expect(path(0).tangent.y).toBeCloseTo(0, 6);
    expect(path(1).tangent.y).toBeCloseTo(0, 6);
    expect(spiralArcLength()).toBeGreaterThan(
      SPIRAL_RADIUS * Math.PI * 2 * SPIRAL_TURNS,
    );
  });

  it('leaves a building-sized opening inside the spiral', () => {
    // A square landmark needs a half-diagonal of 8.5 m; keep 2 m of air
    // between it and the inner rail.
    expect(spiralInnerRadius()).toBeGreaterThan(Math.hypot(6, 6) + 2);
    expect(spiralInnerRadius()).toBeGreaterThan(TRACK_WIDTH);
  });

  it('joins the spiral ramps and deck into a level crossing', () => {
    const up = spiralUpPath();
    const deck = bridgeDeckPath(BRIDGE_LENGTH);
    const down = spiralDownPath();
    const world = new THREE.Matrix4()
      .multiply(endFrame(up))
      .multiply(endFrame(deck))
      .multiply(endFrame(down));
    const end = new THREE.Vector3().setFromMatrixPosition(world);
    expect(end.y).toBeCloseTo(0, 6);
    expect(
      new THREE.Vector3(0, 0, 1).transformDirection(world).z,
    ).toBeCloseTo(1, 6);
    expect(
      new THREE.Vector3(0, 1, 0).transformDirection(world).y,
    ).toBeCloseTo(1, 6);
    // The deck is the only part that advances in plan; the spirals return to
    // their own footprint.
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(BRIDGE_LENGTH, 4);
  });

  it('builds the single-crossing bridge from spiral ramps', () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    for (let index = 0; index < 60; index += 1) {
      const candidate = generateCircuit(`spiral-bridge-${index}`, 1);
      if (
        candidate.pieces.some((piece) => piece.kind === 'bridge') &&
        candidate.pieces.some((piece) => piece.kind === 'spiral-up')
      ) {
        circuit = candidate;
        break;
      }
    }
    expect(circuit).not.toBeNull();
    const pieces = circuit!.pieces;
    const up = pieces.find((piece) => piece.kind === 'spiral-up');
    const down = pieces.find((piece) => piece.kind === 'spiral-down');
    const bridge = pieces.find((piece) => piece.kind === 'bridge');
    expect(up).toBeDefined();
    expect(down).toBeDefined();
    expect(bridge).toBeDefined();
    expect(bridge!.length).toBe(BRIDGE_LENGTH);
    expect(up!.length).toBeCloseTo(spiralArcLength(), 3);

    const upStart = up!.path(0).position.clone().applyMatrix4(up!.matrix);
    const upEnd = up!.path(1).position.clone().applyMatrix4(up!.matrix);
    expect(upEnd.y - upStart.y).toBeCloseTo(SPIRAL_HEIGHT, 6);
    expect(Math.hypot(upEnd.x - upStart.x, upEnd.z - upStart.z)).toBeLessThan(
      1e-6,
    );
    expect(up!.spiralCenter).toBeDefined();

    const downStart = down!.path(0).position.clone().applyMatrix4(down!.matrix);
    const downEnd = down!.path(1).position.clone().applyMatrix4(down!.matrix);
    expect(downStart.y - downEnd.y).toBeCloseTo(SPIRAL_HEIGHT, 6);

    // The whole circuit still closes with the taller bridge module.
    const frames = buildFrames(circuit!);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
    expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);
  });

  it('keeps a polygon route elevated between a climb and a descent', () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    for (let index = 0; index < 80; index += 1) {
      const candidate = generateCircuit(`elevated-${index}`, 1);
      const hasBridge = candidate.pieces.some((piece) => piece.kind === 'bridge');
      const hasClimb = candidate.pieces.some(
        (piece) => piece.kind === 'spiral-up' || piece.kind === 'ramp-up',
      );
      const hasDescent = candidate.pieces.some(
        (piece) => piece.kind === 'spiral-down' || piece.kind === 'ramp-down',
      );
      const climbs = candidate.pieces.filter(
        (piece) => piece.kind === 'spiral-up' || piece.kind === 'ramp-up',
      ).length;
      const descents = candidate.pieces.filter(
        (piece) => piece.kind === 'spiral-down' || piece.kind === 'ramp-down',
      ).length;
      if (!hasBridge && hasClimb && hasDescent && climbs === 1 && descents === 1) {
        circuit = candidate;
        break;
      }
    }
    expect(circuit).not.toBeNull();
    const pieces = circuit!.pieces;
    const climbIndex = pieces.findIndex(
      (piece) => piece.kind === 'spiral-up' || piece.kind === 'ramp-up',
    );
    const descentIndex = pieces.findIndex(
      (piece) => piece.kind === 'spiral-down' || piece.kind === 'ramp-down',
    );
    expect(climbIndex).toBeGreaterThanOrEqual(0);
    expect(descentIndex).toBeGreaterThan(climbIndex);

    const climb = pieces[climbIndex]!;
    const descent = pieces[descentIndex]!;
    const climbStart = new THREE.Vector3().setFromMatrixPosition(climb.matrix);
    const descentStart = new THREE.Vector3().setFromMatrixPosition(
      descent.matrix,
    );
    // The descent sits on a different part of the plan.
    expect(
      Math.hypot(
        descentStart.x - climbStart.x,
        descentStart.z - climbStart.z,
      ),
    ).toBeGreaterThan(TRACK_WIDTH);

    // Both joins are flat, so the car is not launched.
    for (const piece of [climb, descent]) {
      expect(Math.abs(piece.path(0).tangent.y)).toBeLessThan(1e-6);
      expect(Math.abs(piece.path(1).tangent.y)).toBeLessThan(1e-6);
    }

    const climbEnd = climb.path(1).position
      .clone()
      .applyMatrix4(climb.matrix);
    const rise = climbEnd.y - climbStart.y;
    expect(rise).toBeGreaterThanOrEqual(BRIDGE_HEIGHT - 1e-3);
    expect(rise).toBeLessThanOrEqual(SPIRAL_HEIGHT + 1e-3);

    // Every piece between the climb and the descent starts at the elevated
    // height; the loop, hill, and jump are relative features on that deck.
    for (let index = climbIndex + 1; index <= descentIndex; index += 1) {
      const piece = pieces[index]!;
      // A jump's gap and landing sit on the launch line above the deck, not on
      // the deck itself.
      if (piece.kind === 'gap' || piece.kind === 'landing') {
        continue;
      }
      const position = new THREE.Vector3().setFromMatrixPosition(piece.matrix);
      expect(position.y - climbStart.y).toBeCloseTo(rise, 3);
    }
    const after = pieces[descentIndex + 1];
    if (after) {
      const position = new THREE.Vector3().setFromMatrixPosition(after.matrix);
      expect(position.y - climbStart.y).toBeCloseTo(0, 3);
    }

    const frames = buildFrames(circuit!);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
    expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);
  });

  it('crosses a lower approach on a polygon spiral climb', () => {
    for (let index = 0; index < 80; index += 1) {
      const candidate = generateCircuit(`elevated-cross-${index}`, 1);
      if (candidate.pieces.some((piece) => piece.kind === 'bridge')) {
        continue;
      }
      const spiral = candidate.pieces.find(
        (piece) => piece.kind === 'spiral-up',
      );
      if (!spiral) {
        continue;
      }
      const entry = spiral.path(0).position
        .clone()
        .applyMatrix4(spiral.matrix);
      const exit = spiral.path(1).position.clone().applyMatrix4(spiral.matrix);
      // The spiral returns over its own entry, so a polygon circuit can carry
      // an elevated deck across a lower approach without a single-crossing layout.
      expect(Math.hypot(exit.x - entry.x, exit.z - entry.z)).toBeLessThan(1e-6);
      expect(exit.y - entry.y).toBeGreaterThanOrEqual(BRIDGE_CLEARANCE);
      expect(validateCircuit(candidate).ok).toBe(true);
      return;
    }
    throw new Error('no polygon spiral crossing found');
  });

  it('passes an elevated section over lower track', () => {
    for (let index = 0; index < 80; index += 1) {
      const circuit = generateCircuit(`elevated-overpass-${index}`, 1);
      const frames = buildFrames(circuit, 0.8);
      const total = frames[frames.length - 1]!.s;
      const starts: { at: number; kind: Piece['kind'] }[] = [];
      let distance = 0;
      for (const piece of circuit.pieces) {
        starts.push({ at: distance, kind: piece.kind });
        distance += piece.length;
      }
      const kindAt = (s: number): Piece['kind'] => {
        let kind: Piece['kind'] = starts[0]?.kind ?? 'straight';
        for (const start of starts) {
          if (start.at <= s + 1e-6) {
            kind = start.kind;
          } else {
            break;
          }
        }
        return kind;
      };

      for (let a = 0; a < frames.length; a += 1) {
        const upper = frames[a]!;
        const upperKind = kindAt(upper.s);
        if (upperKind === 'loop' || upperKind === 'gap') {
          continue;
        }
        for (let b = a + 1; b < frames.length; b += 1) {
          const lower = frames[b]!;
          const lowerKind = kindAt(lower.s);
          if (lowerKind === 'loop' || lowerKind === 'gap') {
            continue;
          }
          const direct = Math.abs(upper.s - lower.s);
          const arc = Math.min(direct, Math.max(0, total - direct));
          if (arc < TRACK_WIDTH * 2) {
            continue;
          }
          const horizontal = Math.hypot(
            upper.position.x - lower.position.x,
            upper.position.z - lower.position.z,
          );
          if (horizontal >= TRACK_WIDTH) {
            continue;
          }
          const separation = Math.abs(upper.position.y - lower.position.y);
          if (separation < BRIDGE_CLEARANCE) {
            continue;
          }
          // An upper deck frame sits over a lower one with real clearance.
          const high =
            upper.position.y >= lower.position.y ? upper : lower;
          const low = high === upper ? lower : upper;
          expect(high.position.y - low.position.y).toBeGreaterThanOrEqual(
            BRIDGE_CLEARANCE,
          );
          expect(validateCircuit(circuit).ok).toBe(true);
          return;
        }
      }
    }
    throw new Error('no elevated-over-lower crossing found');
  });

  it('sometimes keeps a single-crossing bridge elevated past the crossing', () => {
    const patterns = new Set<'near' | 'far'>();
    let farCircuit: ReturnType<typeof generateCircuit> | null = null;
    for (let index = 0; index < 80; index += 1) {
      const candidate = generateCircuit(`figure-eight-hold-${index}`, 1);
      const bridgeIndex = candidate.pieces.findIndex(
        (piece) => piece.kind === 'bridge',
      );
      if (bridgeIndex < 0) {
        continue;
      }
      const descentIndex = candidate.pieces.findIndex(
        (piece, pieceIndex) =>
          pieceIndex > bridgeIndex &&
          (piece.kind === 'spiral-down' || piece.kind === 'ramp-down'),
      );
      const far = descentIndex > bridgeIndex + 2;
      patterns.add(far ? 'far' : 'near');
      if (far) {
        farCircuit ??= candidate;
      }
    }

    // Seeds choose both the immediate descent and a descent after another
    // corner, so the bridge exit no longer always sits over the climb.
    expect(patterns.has('near')).toBe(true);
    expect(patterns.has('far')).toBe(true);
    expect(farCircuit).not.toBeNull();

    const pieces = farCircuit!.pieces;
    const bridgeIndex = pieces.findIndex((piece) => piece.kind === 'bridge');
    const descentIndex = pieces.findIndex(
      (piece, index) =>
        index > bridgeIndex &&
        (piece.kind === 'spiral-down' || piece.kind === 'ramp-down'),
    );
    expect(descentIndex).toBe(bridgeIndex + 3);
    expect(pieces[bridgeIndex + 1]?.kind).toBe('straight');
    expect(pieces[bridgeIndex + 2]?.kind).toBe('turn');

    const bridgeStart = new THREE.Vector3().setFromMatrixPosition(
      pieces[bridgeIndex]!.matrix,
    );
    for (const index of [bridgeIndex + 1, bridgeIndex + 2, descentIndex]) {
      const start = new THREE.Vector3().setFromMatrixPosition(
        pieces[index]!.matrix,
      );
      expect(start.y).toBeCloseTo(bridgeStart.y, 6);
    }
    const descent = pieces[descentIndex]!;
    const descentStart = new THREE.Vector3().setFromMatrixPosition(
      descent.matrix,
    );
    const descentEnd = descent.path(1).position
      .clone()
      .applyMatrix4(descent.matrix);
    expect(descentStart.y - descentEnd.y).toBeCloseTo(SPIRAL_HEIGHT, 6);

    const frames = buildFrames(farCircuit!);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
    expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);
  });

  it('threads a bridge through the loop in a single-crossing circuit', () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    for (let index = 0; index < 40; index += 1) {
      const candidate = generateCircuit(`figure-eight-${index}`, 1);
      if (candidate.pieces.some((piece) => piece.kind === 'bridge')) {
        circuit = candidate;
        break;
      }
    }
    expect(circuit).not.toBeNull();
    const pieces = circuit!.pieces;
    const loop = pieces.find((piece) => piece.kind === 'loop');
    const bridge = pieces.find((piece) => piece.kind === 'bridge');
    expect(loop).toBeDefined();
    expect(bridge).toBeDefined();

    // The loop's ring sits at the deck's midpoint in plan, under the bridge.
    const ring = new THREE.Vector3().setFromMatrixPosition(loop!.matrix);
    const deckStart = new THREE.Vector3().setFromMatrixPosition(
      bridge!.matrix,
    );
    const ahead = new THREE.Vector3(0, 0, bridge!.length / 2)
      .transformDirection(bridge!.matrix)
      .multiplyScalar(bridge!.length / 2);
    const deckMid = deckStart.clone().add(ahead);
    expect(Math.hypot(ring.x - deckMid.x, ring.z - deckMid.z)).toBeLessThan(3);
    expect(deckMid.y - ring.y).toBeGreaterThan(BRIDGE_HEIGHT - 1);

    // The layout still closes as a whole.
    const frames = buildFrames(circuit!);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
    expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);
  });

  it('clamps turn banking to the documented range', () => {
    const bank = turnPath(MIN_TURN_RADIUS, 90, true)(0.5).bank;
    const degrees = Math.abs((bank * 180) / Math.PI);
    expect(degrees).toBeGreaterThanOrEqual(20);
    expect(degrees).toBeLessThanOrEqual(45);
  });
});
