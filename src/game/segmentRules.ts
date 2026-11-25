import type { Piece } from './track';

/**
 * The rule set behind the preview's minimum-count column and the generator's
 * `minimumCounts` option.
 *
 * A minimum is a positive whole number: "at least this many pieces of this
 * kind". Zero means "0 or more" and is not a rule. The catalog couples a few
 * kinds so the pieces they describe are always built together:
 *
 * - the jump launch, gap, and landing are one jump module;
 * - a loop always returns through its loop return (shift);
 * - a bridge deck needs the loop it threads.
 *
 * Normalizing applies that coupling once, so every consumer agrees on the rule
 * set and no caller has to remember the pairs.
 */
export type SegmentMinimums = Partial<Record<Piece['kind'], number>>;

/** One minimum checked against an assembled piece list. */
export interface SegmentRuleResult {
  kind: Piece['kind'];
  minimum: number;
  actual: number;
  met: boolean;
}

/** The per-kind results rolled up for a requirements note or a test. */
export interface SegmentRuleSummary {
  results: SegmentRuleResult[];
  total: number;
  met: number;
  allMet: boolean;
  failures: SegmentRuleResult[];
}

const JUMP_KINDS = ['kicker', 'gap', 'landing'] as const;
const LOOP_KINDS = ['loop', 'shift'] as const;

/**
 * Turn raw counts into the rule set that must be upheld.
 *
 * Values are floored; zero, negative, and non-finite values are dropped. The
 * jump trio and the loop/return pair take the largest value in their group, and
 * a bridge minimum implies one loop and return. The result contains only
 * positive minimums and is idempotent.
 */
export function normalizeMinimums(input: SegmentMinimums): SegmentMinimums {
  const counts: SegmentMinimums = {};
  for (const [kind, value] of Object.entries(input) as [
    Piece['kind'],
    number | undefined,
  ][]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    const count = Math.floor(value);
    if (count > 0) {
      counts[kind] = count;
    }
  }

  const jumpCount = Math.max(
    0,
    ...JUMP_KINDS.map((kind) => counts[kind] ?? 0),
  );
  if (jumpCount > 0) {
    for (const kind of JUMP_KINDS) {
      counts[kind] = jumpCount;
    }
  }

  const loopCount = Math.max(
    0,
    ...LOOP_KINDS.map((kind) => counts[kind] ?? 0),
  );
  if (loopCount > 0) {
    for (const kind of LOOP_KINDS) {
      counts[kind] = loopCount;
    }
  }

  if ((counts.bridge ?? 0) > 0 && (counts.loop ?? 0) <= 0) {
    counts.loop = 1;
    counts.shift = 1;
  }

  return counts;
}

/**
 * Check every minimum against the assembled pieces.
 *
 * The result follows the order of `minimums` so a caller can present the rules
 * in the order they were chosen. Minimums that are not positive are skipped.
 * This is the only place that recounts pieces for a rule check.
 */
export function evaluateMinimums(
  pieces: readonly Piece[],
  minimums: SegmentMinimums,
): SegmentRuleResult[] {
  const actual = new Map<Piece['kind'], number>();
  for (const piece of pieces) {
    actual.set(piece.kind, (actual.get(piece.kind) ?? 0) + 1);
  }

  const results: SegmentRuleResult[] = [];
  for (const [kind, minimum] of Object.entries(minimums) as [
    Piece['kind'],
    number | undefined,
  ][]) {
    if (minimum === undefined || minimum <= 0) {
      continue;
    }
    const count = actual.get(kind) ?? 0;
    results.push({
      kind,
      minimum,
      actual: count,
      met: count >= minimum,
    });
  }
  return results;
}

/**
 * Roll the results up for a note. A summary with no rules is "all met", which
 * keeps the generator's acceptance path simple: no requested counts means
 * nothing to uphold.
 */
export function describeMinimums(
  results: readonly SegmentRuleResult[],
): SegmentRuleSummary {
  const failures = results.filter((result) => !result.met);
  return {
    results: [...results],
    total: results.length,
    met: results.length - failures.length,
    allMet: failures.length === 0,
    failures,
  };
}
