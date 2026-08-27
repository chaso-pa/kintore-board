package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

// Linking now runs two lookups before the insert: the gym must be visible to the caller,
// and the machine must be visible *and* approved. Both are expected explicitly below,
// because the point of the change is that the insert no longer happens on its own.

// A signed-in, non-admin caller. Their visibility predicate binds active, pending and
// their own id, in that order.
var linker = Viewer{UserID: "u1"}

func expectGymVisible(mock sqlmock.Sqlmock, gymID string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, gymID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(gymID))
}

func expectMachineLinkable(mock sqlmock.Sqlmock, machineID, status string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `machines`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, machineID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status"}).AddRow(machineID, status))
}

func TestLinkMachineInsertsJoinRow(t *testing.T) {
	db, mock := newMockDB(t)

	expectGymVisible(mock, "gym-1")
	expectMachineLinkable(mock, "machine-1", StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.LinkMachine(linker, "gym-1", "machine-1"); err != nil {
		t.Fatalf("LinkMachine: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A machine still awaiting review is visible to the person who submitted it, which is
// exactly what makes this reachable: they could otherwise attach it to any gym and have
// it counted there before anyone looked at it. Approval, not authorship, is the gate.
func TestLinkMachineRefusesAPendingMachine(t *testing.T) {
	db, mock := newMockDB(t)

	expectGymVisible(mock, "gym-1")
	expectMachineLinkable(mock, "machine-1", StatusPending)
	// No Begin/Exec: the insert must not be reached.

	svc := NewGymService(db)
	err := svc.LinkMachine(linker, "gym-1", "machine-1")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("LinkMachine on a pending machine = %v, want ErrForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A gym the caller cannot see is reported as missing, and the machine is never looked up.
func TestLinkMachineStopsAtAnInvisibleGym(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, "gym-hidden", 1).
		WillReturnError(gorm.ErrRecordNotFound)

	svc := NewGymService(db)
	err := svc.LinkMachine(linker, "gym-hidden", "machine-1")
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("LinkMachine against a hidden gym = %v, want ErrRecordNotFound", err)
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

	expectGymVisible(mock, "gym-1")
	expectMachineLinkable(mock, "machine-1", StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnError(&mysqlDuplicateErr{})
	mock.ExpectRollback()

	svc := NewGymService(db)
	if err := svc.LinkMachine(linker, "gym-1", "machine-1"); err == nil {
		t.Fatal("LinkMachine returned nil error, want the duplicate-key error to propagate")
	}
}

type mysqlDuplicateErr struct{}

func (e *mysqlDuplicateErr) Error() string {
	return "Error 1062: Duplicate entry 'gym-1-machine-1' for key 'PRIMARY'"
}

// Unlinking is the destructive half, and until this change any authenticated user could
// empty any gym's machine list. Ownership is checked before the delete.
func TestUnlinkMachineDeletesJoinRowForTheOwner(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, "gym-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"created_by_user_id"}).AddRow(linker.UserID))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.UnlinkMachine(linker, "gym-1", "machine-1"); err != nil {
		t.Fatalf("UnlinkMachine: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The vulnerability this closes: a third party stripping equipment off someone else's gym.
func TestUnlinkMachineRefusesANonOwner(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, "gym-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"created_by_user_id"}).AddRow("someone-else"))
	// No Begin/Exec: the delete must not be reached.

	svc := NewGymService(db)
	err := svc.UnlinkMachine(linker, "gym-1", "machine-1")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("UnlinkMachine by a non-owner = %v, want ErrForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An admin moderates gyms they did not create, so ownership is skipped for them — and
// with it the lookup, which is why no query is expected here.
func TestUnlinkMachineAllowsAnAdminWithoutAnOwnershipLookup(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.UnlinkMachine(Viewer{UserID: "admin-1", IsAdmin: true}, "gym-1", "machine-1"); err != nil {
		t.Fatalf("UnlinkMachine as admin: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Unlinking a machine that was never linked (or already unlinked) must not error — the
// toggle UI calls this idempotently.
func TestUnlinkMachineNoRowsIsNotAnError(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, linker.UserID, "gym-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"created_by_user_id"}).AddRow(linker.UserID))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `gym_machines`")).
		WithArgs("gym-1", "machine-1").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.UnlinkMachine(linker, "gym-1", "machine-1"); err != nil {
		t.Fatalf("UnlinkMachine with zero rows affected: %v", err)
	}
}
