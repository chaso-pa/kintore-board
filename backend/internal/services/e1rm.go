package services

// maxRepsForEstimate is the upper bound of the Brzycki formula. Past this point the
// denominator collapses toward zero and then turns negative, so the estimate is
// meaningless (reps=37 yields a negative 1RM).
const maxRepsForEstimate = 36

// EstimateOneRM returns the Brzycki estimated one-rep max.
// ok is false when the inputs are outside the formula's usable range: non-positive
// weight or reps, or reps beyond maxRepsForEstimate.
//
// This is the single source of truth for e1RM on the Go side. The TypeScript
// counterpart lives in expo/src/utils/rm.ts and is pinned to the same expectations
// via internal/services/testdata/e1rm_cases.json.
func EstimateOneRM(weight float64, reps int) (value float64, ok bool) {
	if weight <= 0 || reps <= 0 || reps > maxRepsForEstimate {
		return 0, false
	}

	// The explicit float64() conversion forces the product to be rounded before the
	// subtraction. Without it Go may fuse the multiply and subtract into a single
	// arm64 instruction (one rounding instead of two), which diverges from the
	// TypeScript implementation on 13 of the 36 valid rep counts. The PR badge in
	// record/[workoutId].tsx compares a TS-computed value against a Go-computed one
	// with a strict >, so the two must round identically.
	denominator := 1.0278 - float64(0.0278*float64(reps))

	return weight / denominator, true
}
