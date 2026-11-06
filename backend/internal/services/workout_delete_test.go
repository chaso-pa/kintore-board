package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/go-sql-driver/mysql"
)

// Delete is idempotent and always succeeds, because the device retries it until it gets an
// answer. Whatever the id is, a tombstone for it is the caller's own or nothing changes.

const (
	lockWorkoutQuery = "SELECT user_id FROM workouts WHERE id = ? FOR UPDATE"
	insertTombstone  = "INSERT IGNORE INTO deleted_workouts (id, user_id) VALUES (?, ?)"
)

// The tombstone goes in before anything is removed, and the sets before the workout:
// workout_sets.workout_id is a foreign key with no cascade, so deleting the parent first
// fails with error 1451 for every workout that has a set.
func TestDeleteWorkoutTombstonesThenRemovesSetsThenTheWorkout(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(lockWorkoutQuery)).
		WithArgs("w1").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("u1"))
	mock.ExpectExec(regexp.QuoteMeta(insertTombstone)).
		WithArgs("w1", "u1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM workout_sets WHERE workout_id = ?")).
		WithArgs("w1").
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM workouts WHERE id = ? AND user_id = ?")).
		WithArgs("w1", "u1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "u1"); err != nil {
		t.Fatalf("DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// A record deleted on the device before its first upload reached the server. The tombstone
// still goes in, so that upload — possibly still in flight — is refused when it arrives.
func TestDeleteWorkoutForAnUnknownIDLeavesOnlyATombstone(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(lockWorkoutQuery)).
		WithArgs("never-uploaded").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
	mock.ExpectExec(regexp.QuoteMeta(insertTombstone)).
		WithArgs("never-uploaded", "u1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("never-uploaded", "u1"); err != nil {
		t.Fatalf("DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// The retry after a delete whose reply was lost. INSERT IGNORE leaves the first tombstone
// as it was, and the answer is the same success.
func TestDeleteWorkoutTwiceSucceedsBothTimes(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(lockWorkoutQuery)).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
	mock.ExpectExec(regexp.QuoteMeta(insertTombstone)).
		WithArgs("w1", "u1").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "u1"); err != nil {
		t.Fatalf("second DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// Someone else's workout: nothing is written — no tombstone that would block its owner —
// and the answer is the same success, so it does not tell the caller the id exists.
func TestDeleteWorkoutForAnotherUsersWorkoutChangesNothing(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(lockWorkoutQuery)).
		WithArgs("w1").
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow("owner"))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "intruder"); err != nil {
		t.Fatalf("DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("something was written for another user's workout: %v", err)
	}
}

// A deadlock against a racing create aborts the whole transaction, and the error must be
// recognisable so the handler answers 503 and the device retries.
func TestDeleteWorkoutReportsLockContention(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(lockWorkoutQuery)).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
	mock.ExpectExec(regexp.QuoteMeta(insertTombstone)).
		WillReturnError(&mysql.MySQLError{Number: 1213, Message: "Deadlock found"})
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	err := svc.DeleteWorkout("w1", "u1")
	if !IsLockContention(err) {
		t.Fatalf("got %v, want a lock contention error", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

func TestIsLockContention(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{&mysql.MySQLError{Number: 1213}, true},
		{&mysql.MySQLError{Number: 1205}, true},
		{&mysql.MySQLError{Number: 1062}, false},
		{errors.New("boom"), false},
		{nil, false},
	}
	for _, c := range cases {
		if got := IsLockContention(c.err); got != c.want {
			t.Errorf("IsLockContention(%v) = %v, want %v", c.err, got, c.want)
		}
	}
}
