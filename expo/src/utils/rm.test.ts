import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { estimateOneRM } from '@/utils/rm';

interface E1RMCase {
  weight: number;
  reps: number;
  expected: number;
  ok: boolean;
}

// The same fixture drives backend/internal/services/e1rm_test.go. Reading the one file
// from both languages is what actually pins the two implementations together — a
// hand-copied expectation table in each language could drift in lockstep and stay green.
const FIXTURE = join(
  __dirname,
  '../../../backend/internal/services/testdata/e1rm_cases.json'
);

// Mirrors wantE1RMCaseCount in the Go test. Truncating the fixture fails both suites.
const WANT_CASE_COUNT = 9;

function loadCases(): E1RMCase[] {
  const cases = JSON.parse(readFileSync(FIXTURE, 'utf8')) as E1RMCase[];
  expect(cases).toHaveLength(WANT_CASE_COUNT);
  return cases;
}

describe('estimateOneRM', () => {
  it('matches the shared fixture exactly', () => {
    for (const c of loadCases()) {
      const got = estimateOneRM(c.weight, c.reps);
      // Go returns (value, ok); TS returns number | null. ok:false maps to null.
      expect({ weight: c.weight, reps: c.reps, got }).toEqual({
        weight: c.weight,
        reps: c.reps,
        got: c.ok ? c.expected : null,
      });
    }
  });

  it('rejects inputs outside the formula range', () => {
    expect(estimateOneRM(100, 37)).toBeNull();
    expect(estimateOneRM(100, 0)).toBeNull();
    expect(estimateOneRM(100, -1)).toBeNull();
    expect(estimateOneRM(0, 5)).toBeNull();
    expect(estimateOneRM(-100, 5)).toBeNull();
  });
});
