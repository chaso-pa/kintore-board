package services

import (
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// newMockDB wires GORM onto a sqlmock connection.
//
// SkipInitializeWithVersion is required: without it GORM issues SELECT VERSION() when the
// connection opens, which would have to be mocked too and fails in a way that looks
// unrelated to the query under test.
func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()

	conn, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      conn,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}
	return db, mock
}

// AC-1: the query must be scoped to the caller. A dropped user_id predicate would leak
// another user's training log, so it is pinned here rather than left to review.
func TestGetExerciseHistoryScopesToUser(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("workouts.user_id = ?")).
		WithArgs("user-1", "ベンチプレス").
		WillReturnRows(sqlmock.NewRows(
			[]string{"trained_on", "workout_id", "weight", "reps", "sets", "spotted", "sort_order", "memo"}).
			AddRow(time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC), "w1", 100.0, 5, 1, false, 0, ""))

	svc := NewWorkoutService(db)
	points, hasWeight, err := svc.GetExerciseHistory("user-1", "ベンチプレス", ExerciseFilter{})
	if err != nil {
		t.Fatalf("GetExerciseHistory: %v", err)
	}
	if !hasWeight || len(points) != 1 {
		t.Fatalf("got (%d points, hasWeight=%v), want (1, true)", len(points), hasWeight)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// AC-7
func TestListExercisesScopesToUser(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("workouts.user_id = ?")).
		WithArgs("user-1").
		WillReturnRows(sqlmock.NewRows(
			[]string{"exercise_name", "trained_on", "workout_id", "weight", "reps"}).
			AddRow("ベンチプレス", time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC), "w1", 100.0, 5).
			AddRow("ベンチプレス", time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC), "w2", 95.0, 5))

	svc := NewWorkoutService(db)
	rows, err := svc.ListExercises("user-1")
	if err != nil {
		t.Fatalf("ListExercises: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d summaries, want 1", len(rows))
	}
	if rows[0].SessionCount != 2 {
		t.Errorf("sessionCount = %d, want 2 (distinct workouts)", rows[0].SessionCount)
	}
	if rows[0].LastTrainedOn != "2026-08-15" {
		t.Errorf("lastTrainedOn = %q, want 2026-08-15", rows[0].LastTrainedOn)
	}
	want, _ := EstimateOneRM(100, 5)
	if rows[0].BestE1RM != want {
		t.Errorf("bestE1RM = %v, want %v", rows[0].BestE1RM, want)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// AC-24: the stats endpoint must use the same volume formula as the chart. GREATEST guards
// against the nullable sets column zeroing a row out.
func TestGetWorkoutStatsUsesSharedVolumeFormula(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `workouts`")).
		WithArgs("user-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(regexp.QuoteMeta("GREATEST(COALESCE(workout_sets.sets, 1), 1)")).
		WithArgs("user-1").
		WillReturnRows(sqlmock.NewRows([]string{"total_volume"}).AddRow(1500.0))

	svc := NewWorkoutService(db)
	count, volume, err := svc.GetWorkoutStats("user-1")
	if err != nil {
		t.Fatalf("GetWorkoutStats: %v", err)
	}
	if count != 3 || volume != 1500 {
		t.Errorf("got (%d, %v), want (3, 1500)", count, volume)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
