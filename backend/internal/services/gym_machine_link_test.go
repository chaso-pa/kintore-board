package services

import (
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func TestLinkMachineInsertsJoinRow(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.LinkMachine("gym-1", "machine-1"); err != nil {
		t.Fatalf("LinkMachine: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The composite primary key (gym_id, machine_id) is what makes a duplicate link
// impossible at the DB level; this only checks that the service surfaces the DB error
// rather than swallowing it, matching the existing AddGymFavorite -> 409 convention.
func TestLinkMachinePropagatesDuplicateKeyError(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnError(&mysqlDuplicateErr{})
	mock.ExpectRollback()

	svc := NewGymService(db)
	if err := svc.LinkMachine("gym-1", "machine-1"); err == nil {
		t.Fatal("LinkMachine returned nil error, want the duplicate-key error to propagate")
	}
}

type mysqlDuplicateErr struct{}

func (e *mysqlDuplicateErr) Error() string {
	return "Error 1062: Duplicate entry 'gym-1-machine-1' for key 'PRIMARY'"
}

func TestUnlinkMachineDeletesJoinRow(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.UnlinkMachine("gym-1", "machine-1"); err != nil {
		t.Fatalf("UnlinkMachine: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Unlinking a machine that was never linked (or already unlinked) must not error — the
// toggle UI calls this idempotently.
func TestUnlinkMachineNoRowsIsNotAnError(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.UnlinkMachine("gym-1", "machine-1"); err != nil {
		t.Fatalf("UnlinkMachine with zero rows affected: %v", err)
	}
}
