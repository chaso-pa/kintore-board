package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// A failed set insert used to be discarded, so both of these returned success with the
// workout row written and no sets attached. The client recorded that as saved; the sets
// were simply absent the next time the record was opened, which is what "it saved but came
// back empty after a restart" looked like from the outside.

func oneSet() []WorkoutSet {
	return []WorkoutSet{{ExerciseName: "ベンチプレス", Weight: 60, Reps: 10, Sets: 1}}
}

func TestCreateWorkoutFailsWhenSetsCannotBeWritten(t *testing.T) {
	db, mock := newMockDB(t)

	boom := errors.New("insert failed")
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workout_sets`")).
		WillReturnError(boom)
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if _, err := svc.CreateWorkout("u1", time.Now(), "", oneSet()); err == nil {
		t.Fatal("CreateWorkout reported success even though no set was written")
	}
}

func TestUpdateWorkoutFailsWhenSetsCannotBeWritten(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}).AddRow("w1", "u1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workout_sets`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workout_sets`")).
		WillReturnError(errors.New("insert failed"))
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.UpdateWorkout("w1", "u1", time.Now(), "", oneSet()); err == nil {
		t.Fatal("UpdateWorkout reported success even though the replacement sets were lost")
	}
}

// Only one workout per day is reachable from the calendar, so when a day holds more than
// one the pick has to be the same on every request. Ordering by trained_on alone left it
// to the storage engine, and a day whose two records shared a timestamp could hand back
// either one — the same edit looked saved, then reverted, then saved again.
func TestGetWorkoutDatesPicksDeterministically(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`ORDER BY trained_on DESC, id DESC`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "trained_on", "memo"}))

	svc := &WorkoutService{db: db}
	if _, err := svc.GetWorkoutDates("u1", 2026, 8); err != nil {
		t.Fatalf("GetWorkoutDates: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the tie-break was dropped from the ordering: %v", err)
	}
}

// workout_sets holds a foreign key to workouts with no cascade, so removing the parent row
// on its own failed with error 1451 for every workout that had a set — which is every
// workout anyone would want to delete. The sets have to go first, in one transaction.
func TestDeleteWorkoutRemovesSetsFirst(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}).AddRow("w1", "u1"))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workout_sets`")).
		WillReturnResult(sqlmock.NewResult(1, 2))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "u1"); err != nil {
		t.Fatalf("DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the sets were not removed before the workout: %v", err)
	}
}

// A workout belonging to someone else must not have its sets deleted on the way to
// discovering that the workout itself is out of reach.
func TestDeleteWorkoutTouchesNothingForAnotherUser(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}))
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "intruder"); err == nil {
		t.Fatal("DeleteWorkout reported success for a workout the user does not own")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}
