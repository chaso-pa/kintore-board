//go:build integration

package services

import (
	"errors"
	"testing"

	"gorm.io/gorm"
)

// TestGoldenAgainstMySQL loads every golden case into a real MySQL and answers it with the
// WorkoutService methods themselves. TestGoldenAggregates reproduces the SQL in Go; this is
// what proves that reproduction — and so the TS port built from the same files — matches
// the queries that actually run.
func TestGoldenAgainstMySQL(t *testing.T) {
	db := openIntegrationDB(t)
	svc := NewWorkoutService(db)

	// Case user ids are short ("u1"); they never appear in an expected body, so they are
	// namespaced here to keep clear of real rows.
	uid := func(id string) string { return "it-golden-" + id }

	for _, kind := range goldenKinds {
		for _, c := range loadGolden(t, kind).Cases {
			t.Run(kind+"/"+c.Name, func(t *testing.T) {
				resetIntegrationUsers(t, db, uid("u1"), uid("u2"), uid("u3"))
				loadGoldenCase(t, db, c, uid)
				assertGolden(t, kind, c, goldenQueryService(t, svc, kind, c, uid(c.UserID)))
			})
		}
	}
}

func loadGoldenCase(t *testing.T, db *gorm.DB, c goldenCase, uid func(string) string) {
	t.Helper()
	for _, w := range c.Workouts {
		// Workout and set ids are PKs; clear any left from a run with a different user.
		if err := db.Exec("DELETE FROM workout_sets WHERE workout_id = ?", w.ID).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Exec("DELETE FROM workouts WHERE id = ?", w.ID).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Exec("INSERT INTO workouts (id, user_id, trained_on, memo) VALUES (?, ?, ?, ?)",
			w.ID, uid(w.UserID), w.TrainedOn.UTC(), w.Memo).Error; err != nil {
			t.Fatalf("insert workout %s: %v", w.ID, err)
		}
		for _, s := range w.Sets {
			if err := db.Exec(`INSERT INTO workout_sets
				(id, workout_id, exercise_name, weight, reps, sets, memo, spotted, sort_order, body_part)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				s.ID, w.ID, s.ExerciseName, s.Weight, s.Reps, s.Sets, s.Memo, s.Spotted, s.SortOrder, s.BodyPart).Error; err != nil {
				t.Fatalf("insert set %s: %v", s.ID, err)
			}
		}
	}
}

func goldenQueryService(t *testing.T, svc *WorkoutService, kind string, c goldenCase, userID string) any {
	t.Helper()
	q := c.Query
	var (
		out any
		err error
	)
	switch kind {
	case "workout_dates":
		var e []WorkoutDateEntry
		e, err = svc.GetWorkoutDates(userID, q.Year, q.Month)
		out = datesBody(e)
	case "workout_stats":
		var n int64
		var v float64
		n, v, err = svc.GetWorkoutStats(userID)
		out = statsBody(n, v)
	case "last_sets":
		var r *LastExerciseSetsResult
		r, err = svc.GetLastExerciseSets(userID, q.ExerciseName, q.filter())
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err == nil {
			out = lastSetsBody(r)
		}
	case "max_e1rm":
		var v float64
		v, err = svc.GetExerciseMaxE1RM(userID, q.ExerciseName, q.BeforeWorkoutID, q.filter())
		out = maxE1RMBody(v)
	case "exercise_history":
		var p []ExerciseHistoryPoint
		var has bool
		p, has, err = svc.GetExerciseHistory(userID, q.ExerciseName, q.filter())
		out = historyBody(q.ExerciseName, p, has)
	case "exercise_list":
		var r []ExerciseSummary
		r, err = svc.ListExercises(userID)
		out = listBody(r)
	case "unclassified":
		var n []string
		n, err = svc.UnclassifiedExerciseNames(userID)
		out = unclassifiedBody(n)
	default:
		t.Fatalf("unknown kind %s", kind)
	}
	if err != nil {
		t.Fatalf("%s: %v", kind, err)
	}
	return out
}
