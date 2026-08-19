package services

import (
	"encoding/json"
	"os"
	"testing"
)

// e1rmCase mirrors testdata/e1rm_cases.json, which is read by BOTH this test and the
// TypeScript test in expo. Keep the two readers in sync when the shape changes.
type e1rmCase struct {
	Weight   float64 `json:"weight"`
	Reps     int     `json:"reps"`
	Expected float64 `json:"expected"`
	OK       bool    `json:"ok"`
}

// wantE1RMCaseCount guards against the fixture being truncated. Both language test
// suites assert this, so dropping a case fails loudly instead of silently shrinking
// coverage.
const wantE1RMCaseCount = 9

func loadE1RMCases(t *testing.T) []e1rmCase {
	t.Helper()

	raw, err := os.ReadFile("testdata/e1rm_cases.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	var cases []e1rmCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	if len(cases) != wantE1RMCaseCount {
		t.Fatalf("fixture has %d cases, want %d", len(cases), wantE1RMCaseCount)
	}
	return cases
}

// The shared fixture pins Go and TypeScript to identical output. Both implementations
// evaluate the same single expression, so the comparison is exact — no tolerance.
func TestEstimateOneRMMatchesSharedFixture(t *testing.T) {
	for _, c := range loadE1RMCases(t) {
		got, ok := EstimateOneRM(c.Weight, c.Reps)
		if ok != c.OK {
			t.Errorf("EstimateOneRM(%v, %d) ok = %v, want %v", c.Weight, c.Reps, ok, c.OK)
			continue
		}
		if got != c.Expected {
			t.Errorf("EstimateOneRM(%v, %d) = %v, want %v", c.Weight, c.Reps, got, c.Expected)
		}
	}
}

// reps=37 flips the denominator negative (-0.0008), which would otherwise return a
// large negative "1RM". reps=0 would return a positive number from the raw formula.
// Both are rejected by the guard rather than by the caller.
func TestEstimateOneRMRejectsOutOfRange(t *testing.T) {
	for _, c := range []struct {
		name   string
		weight float64
		reps   int
	}{
		{"reps beyond formula range", 100, 37},
		{"zero reps", 100, 0},
		{"negative reps", 100, -1},
		{"zero weight", 0, 5},
		{"negative weight", -100, 5},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got, ok := EstimateOneRM(c.weight, c.reps); ok {
				t.Errorf("got (%v, true), want ok=false", got)
			}
		})
	}
}
