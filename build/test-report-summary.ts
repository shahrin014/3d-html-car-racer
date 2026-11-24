/**
 * Publish a short unit-test summary in the GitHub Actions job summary.
 *
 * Vitest writes test-results/vitest-junit.xml when CI is set (see
 * vitest.config.ts). The checks workflow calls this script with `if: always()`
 * so a failing test still leaves a visible summary, and the raw XML is uploaded
 * as an artifact.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const reportPath = 'test-results/vitest-junit.xml';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function numberAttribute(tag: string, name: string): number {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  const value = Number(match?.[1] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildSummary(): string {
  if (!existsSync(reportPath)) {
    return [
      '## Unit tests',
      '',
      'No JUnit report was produced. The run may have failed before the unit tests started.',
      '',
    ].join('\n');
  }

  const xml = readFileSync(reportPath, 'utf8');
  const root = xml.match(/<testsuites\b[^>]*>/)?.[0] ?? '';
  const suites = [...xml.matchAll(/<testsuite\b[^>]*>/g)].map(
    (match) => match[0],
  );
  const sum = (name: string): number =>
    suites.reduce((total, tag) => total + numberAttribute(tag, name), 0);
  const tests = root ? numberAttribute(root, 'tests') : sum('tests');
  const failures = root ? numberAttribute(root, 'failures') : sum('failures');
  const errors = root ? numberAttribute(root, 'errors') : sum('errors');
  const skipped = root ? numberAttribute(root, 'skipped') : sum('skipped');
  const time = root ? numberAttribute(root, 'time') : sum('time');

  const failedTests = [
    ...xml.matchAll(
      /<testcase\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g,
    ),
  ]
    .filter((match) => /<failure\b|<error\b/.test(match[2] ?? ''))
    .map((match) => match[1] ?? 'unknown test');

  const passed = failures === 0 && errors === 0;
  const lines = [
    '## Unit tests',
    '',
    `- Result: ${passed ? '✅ passed' : '❌ failed'}`,
    `- Tests: ${tests}`,
    `- Failures: ${failures}`,
    `- Errors: ${errors}`,
    `- Skipped: ${skipped}`,
    `- Duration: ${time.toFixed(2)} s`,
    `- Report: \`${reportPath}\``,
    '',
  ];

  if (failedTests.length > 0) {
    lines.push('### Failed tests', '');
    for (const test of failedTests.slice(0, 20)) {
      lines.push(`- ${test}`);
    }
    if (failedTests.length > 20) {
      lines.push(`- …and ${failedTests.length - 20} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

const summary = buildSummary();
if (summaryPath) {
  appendFileSync(summaryPath, summary);
} else {
  process.stdout.write(summary);
}
