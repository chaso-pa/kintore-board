package services

import (
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func day(y int, m time.Month, d, hour int) time.Time {
	return time.Date(y, m, d, hour, 0, 0, 0, time.UTC)
}

func TestAggregateExerciseHistoryEmptyInput(t *testing.T) {
	points, hasWeight := aggregateExerciseHistory(nil)
	if len(points) != 0 {
		t.Errorf("points = %v, want empty", points)
	}
	if hasWeight {
		t.Error("hasWeightData = true, want false")
	}
}

// Two sessions on one calendar day must produce one point, not two, and the set order
// must follow (trained_on, sort_order) — sort_order alone interleaves because it is
// numbered per workout.
func TestAggregateExerciseHistoryCollapsesSameDayWorkouts(t *testing.T) {
	rows := []exerciseSetRow{
		{TrainedOn: day(2026, 8, 15, 18), WorkoutID: "pm", Weight: 90, Reps: 8, Sets: 1, SortOrder: 0},
		{TrainedOn: day(2026, 8, 15, 18), WorkoutID: "pm", Weight: 85, Reps: 10, Sets: 1, SortOrder: 1},
		{TrainedOn: day(2026, 8, 15, 7), WorkoutID: "am", Weight: 100, Reps: 5, Sets: 1, SortOrder: 0},
		{TrainedOn: day(2026, 8, 15, 7), WorkoutID: "am", Weight: 95, Reps: 6, Sets: 1, SortOrder: 1},
	}

	points, hasWeight := aggregateExerciseHistory(rows)

	if len(points) != 1 {
		t.Fatalf("got %d points, want 1 (same calendar day)", len(points))
	}
	if !hasWeight {
		t.Error("hasWeightData = false, want true")
	}

	p := points[0]
	if p.Date != "2026-08-15" {
		t.Errorf("date = %q, want 2026-08-15", p.Date)
	}
	if len(p.WorkoutIDs) != 2 || p.WorkoutIDs[0] != "am" || p.WorkoutIDs[1] != "pm" {
		t.Errorf("workoutIDs = %v, want [am pm] in trained_on order", p.WorkoutIDs)
	}
	if len(p.Sets) != 4 {
		t.Fatalf("got %d sets, want all 4 from both workouts", len(p.Sets))
	}
	wantOrder := []struct {
		workout string
		weight  float64
	}{{"am", 100}, {"am", 95}, {"pm", 90}, {"pm", 85}}
	for i, w := range wantOrder {
		if p.Sets[i].WorkoutID != w.workout || p.Sets[i].Weight != w.weight {
			t.Errorf("set[%d] = (%s, %v), want (%s, %v)",
				i, p.Sets[i].WorkoutID, p.Sets[i].Weight, w.workout, w.weight)
		}
	}
	if p.MaxWeight != 100 {
		t.Errorf("maxWeight = %v, want 100", p.MaxWeight)
	}
}

// The bodyweight fallback chart plots MaxReps, so rep counts must be tracked even when
// every set has zero weight. If MaxReps were filtered alongside the weight metrics the
// fallback would render a flat zero line.
func TestAggregateExerciseHistoryBodyweightOnly(t *testing.T) {
	rows := []exerciseSetRow{
		{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w1", Weight: 0, Reps: 8, Sets: 1},
		{TrainedOn: day(2026, 8, 15, 10), WorkoutID: "w2", Weight: 0, Reps: 12, Sets: 1},
	}

	points, hasWeight := aggregateExerciseHistory(rows)

	if hasWeight {
		t.Error("hasWeightData = true, want false for an all-bodyweight exercise")
	}
	if len(points) != 2 {
		t.Fatalf("got %d points, want 2 (bodyweight days are not dropped)", len(points))
	}
	if points[0].MaxReps != 8 || points[1].MaxReps != 12 {
		t.Errorf("maxReps = [%d %d], want [8 12]", points[0].MaxReps, points[1].MaxReps)
	}
	for i, p := range points {
		if p.E1RM != 0 || p.MaxWeight != 0 || p.TotalVolume != 0 {
			t.Errorf("point[%d] weight metrics = (%v, %v, %v), want all zero",
				i, p.E1RM, p.MaxWeight, p.TotalVolume)
		}
	}
}

func TestAggregateExerciseHistoryMixedWeights(t *testing.T) {
	rows := []exerciseSetRow{
		{TrainedOn: day(2026, 8, 10, 10), WorkoutID: "w1", Weight: 60, Reps: 5, Sets: 1, SortOrder: 0},
		{TrainedOn: day(2026, 8, 10, 10), WorkoutID: "w1", Weight: 0, Reps: 20, Sets: 1, SortOrder: 1},
	}

	points, hasWeight := aggregateExerciseHistory(rows)

	if !hasWeight {
		t.Error("hasWeightData = false, want true (one weighted set present)")
	}
	p := points[0]
	if p.MaxWeight != 60 {
		t.Errorf("maxWeight = %v, want 60 (bodyweight set excluded)", p.MaxWeight)
	}
	if p.TotalVolume != 300 {
		t.Errorf("totalVolume = %v, want 300 (60*5*1, bodyweight set contributes nothing)", p.TotalVolume)
	}
	if p.MaxReps != 20 {
		t.Errorf("maxReps = %d, want 20 (bodyweight set still counts toward reps)", p.MaxReps)
	}
}

// sets and reps are nullable columns mapped to non-pointer ints, so NULL arrives as 0.
// A zero sets count must not zero out the volume.
func TestAggregateExerciseHistoryZeroSetsAndReps(t *testing.T) {
	for _, c := range []struct {
		name   string
		row    exerciseSetRow
		volume float64
	}{
		{
			"sets zero is treated as one",
			exerciseSetRow{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w", Weight: 50, Reps: 10, Sets: 0},
			500,
		},
		{
			"sets greater than one multiplies",
			exerciseSetRow{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w", Weight: 50, Reps: 10, Sets: 3},
			1500,
		},
		{
			"zero reps contributes no volume",
			exerciseSetRow{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w", Weight: 50, Reps: 0, Sets: 1},
			0,
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			points, _ := aggregateExerciseHistory([]exerciseSetRow{c.row})
			if got := points[0].TotalVolume; got != c.volume {
				t.Errorf("totalVolume = %v, want %v", got, c.volume)
			}
		})
	}
}

func TestAggregateExerciseHistorySortsPointsByDate(t *testing.T) {
	rows := []exerciseSetRow{
		{TrainedOn: day(2026, 8, 20, 10), WorkoutID: "c", Weight: 100, Reps: 5, Sets: 1},
		{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "a", Weight: 90, Reps: 5, Sets: 1},
		{TrainedOn: day(2026, 8, 10, 10), WorkoutID: "b", Weight: 95, Reps: 5, Sets: 1},
	}

	points, _ := aggregateExerciseHistory(rows)

	want := []string{"2026-08-01", "2026-08-10", "2026-08-20"}
	for i, d := range want {
		if points[i].Date != d {
			t.Errorf("points[%d].Date = %q, want %q", i, points[i].Date, d)
		}
	}
}

// e1RM must come from the shared estimator, including its out-of-range guard.
func TestAggregateExerciseHistoryUsesSharedEstimator(t *testing.T) {
	rows := []exerciseSetRow{
		{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w", Weight: 100, Reps: 5, Sets: 1},
		{TrainedOn: day(2026, 8, 1, 10), WorkoutID: "w", Weight: 100, Reps: 40, Sets: 1},
	}

	points, _ := aggregateExerciseHistory(rows)

	want, _ := EstimateOneRM(100, 5)
	if points[0].E1RM != want {
		t.Errorf("e1rm = %v, want %v (reps=40 must be excluded by the guard)", points[0].E1RM, want)
	}
}

// ListExercises groups by name *and* part now. The same name filed under two parts is two
// entries in the picker, and merging their histories here would put one exercise's numbers
// on the other's graph.
func TestListExercisesGroupsByNameAndPart(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`FROM .workout_sets.`).
		WillReturnRows(sqlmock.NewRows([]string{"exercise_name", "body_part", "trained_on", "workout_id", "weight", "reps"}).
			AddRow("プルオーバー", "胸", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), "w1", 20.0, 12).
			AddRow("プルオーバー", "背中", time.Date(2026, 9, 2, 0, 0, 0, 0, time.UTC), "w2", 30.0, 10))

	out, err := NewWorkoutService(db).ListExercises("u1")
	if err != nil {
		t.Fatalf("ListExercises: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("got %d entries, want 2 — the two parts were merged", len(out))
	}
	parts := []string{out[0].BodyPart, out[1].BodyPart}
	// Most recently trained first.
	if parts[0] != "背中" || parts[1] != "胸" {
		t.Fatalf("got parts %v, want [背中 胸]", parts)
	}
}

// A set with no part yet forms its own entry rather than joining one of the others: which
// of them it belongs to is exactly what is unknown. Folding it into either would move
// somebody's numbers onto a graph they do not belong on.
func TestListExercisesKeepsUnclassifiedSetsSeparate(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`FROM .workout_sets.`).
		WillReturnRows(sqlmock.NewRows([]string{"exercise_name", "body_part", "trained_on", "workout_id", "weight", "reps"}).
			AddRow("ベンチプレス", "BIG3", time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC), "w1", 100.0, 5).
			AddRow("ベンチプレス", "", time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), "w2", 90.0, 5))

	out, err := NewWorkoutService(db).ListExercises("u1")
	if err != nil {
		t.Fatalf("ListExercises: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("got %d entries, want 2", len(out))
	}
	if out[0].BodyPart != "BIG3" || out[1].BodyPart != "" {
		t.Fatalf("got %q and %q", out[0].BodyPart, out[1].BodyPart)
	}
}
