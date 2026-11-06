package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// A deleted workout must stay deleted. The device deletes, and a create it sent earlier for
// the same id may still be in flight — retried after a timeout, or queued while offline.
// Without the tombstone check that late create would bring the record back.

const tombstoneQuery = "SELECT user_id FROM deleted_workouts WHERE id = ? FOR SHARE"

func expectNoTombstone(mock sqlmock.Sqlmock, id string) {
	mock.ExpectQuery(regexp.QuoteMeta(tombstoneQuery)).
		WithArgs(id).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}))
}

func expectTombstone(mock sqlmock.Sqlmock, id, owner string) {
	mock.ExpectQuery(regexp.QuoteMeta(tombstoneQuery)).
		WithArgs(id).
		WillReturnRows(sqlmock.NewRows([]string{"user_id"}).AddRow(owner))
}

func TestCreateWorkoutRefusesTheOwnersDeletedID(t *testing.T) {
	db, mock := newMockDB(t)

	// The check is the first statement of the transaction, so nothing is read or written
	// for a deleted id.
	mock.ExpectBegin()
	expectTombstone(mock, clientID, "u1")
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if _, err := svc.CreateWorkout(clientID, "u1", time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutDeleted) {
		t.Fatalf("got %v, want ErrWorkoutDeleted", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

func TestUpdateWorkoutRefusesTheOwnersDeletedID(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	expectTombstone(mock, clientID, "u1")
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.UpdateWorkout(clientID, "u1", time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutDeleted) {
		t.Fatalf("got %v, want ErrWorkoutDeleted", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// Someone else's tombstone is someone else's id: the same 409 as their live workout, and
// not 410, which would say the id had been used and deleted.
func TestCreateWorkoutTreatsAnotherUsersDeletedIDAsTaken(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	expectTombstone(mock, clientID, "someone-else")
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if _, err := svc.CreateWorkout(clientID, "u1", time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutIDTaken) {
		t.Fatalf("got %v, want ErrWorkoutIDTaken", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

func TestUpdateWorkoutTreatsAnotherUsersDeletedIDAsTaken(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	expectTombstone(mock, clientID, "someone-else")
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.UpdateWorkout(clientID, "u1", time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutIDTaken) {
		t.Fatalf("got %v, want ErrWorkoutIDTaken", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// A create without an id gets a fresh server-made UUID, which no tombstone can name, so it
// is not checked.
func TestCreateWorkoutWithoutAnIDSkipsTheTombstoneCheck(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workout_sets`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if _, err := svc.CreateWorkout("", "u1", time.Now(), "", oneSet()); err != nil {
		t.Fatalf("CreateWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}
