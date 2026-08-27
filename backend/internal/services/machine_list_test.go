package services

import (
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// The machine listings had no runtime test at all, which left the machine half of the
// thumbnail guarantee unheld: deleting `WHERE status = 'active'` from the machine cover
// query broke nothing, so a photo still awaiting review could become the picture shown
// against a machine everywhere it appears. The gym half was covered in gym_near_test.go;
// this is the missing mirror.

func machineListColumns() []string {
	return []string{"id", "name", "status"}
}

// Expectations shared by both listings: the thread count, then the cover photo. Both are
// matched on the clause that constrains them, not merely on the table name.
func expectMachineStats(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM threads WHERE machine_id IN")).
		WillReturnRows(sqlmock.NewRows([]string{"machine_id", "count"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM machine_photos WHERE status = 'active'")).
		WillReturnRows(sqlmock.NewRows([]string{"machine_id", "image_url"}))
}

// A gym's machine list is filtered by the viewer, the same as everything else that reads
// the machines table.
func TestListMachinesAppliesTheVisibilityPredicate(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("machines.status = ?")).
		WithArgs(StatusActive, "gym-1").
		WillReturnRows(sqlmock.NewRows(machineListColumns()).AddRow("m1", "ラットプル", StatusActive))
	expectMachineStats(mock)

	svc := NewGymService(db)
	rows, err := svc.ListMachines(anonViewer, "gym-1", "")
	if err != nil {
		t.Fatalf("ListMachines: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The global catalogue is a separate statement from the gym-scoped one, so proving one is
// filtered says nothing about the other — the same trap as the two gym listings.
func TestListMachinesGlobalAppliesTheVisibilityPredicate(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("machines.status = ?")).
		WithArgs(StatusActive, 50).
		WillReturnRows(sqlmock.NewRows(machineListColumns()).AddRow("m1", "ラットプル", StatusActive))
	expectMachineStats(mock)

	svc := NewGymService(db)
	if _, err := svc.ListMachinesGlobal(anonViewer, "", "", ""); err != nil {
		t.Fatalf("ListMachinesGlobal: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The submitter of a machine sees their own pending row, so their predicate binds their id.
func TestListMachinesGlobalBindsTheCreatorIdForOwnPendingRows(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("machines.created_by_user_id = ?")).
		WithArgs(StatusActive, StatusPending, "creator-1", 50).
		WillReturnRows(sqlmock.NewRows(machineListColumns()))

	svc := NewGymService(db)
	_, err := svc.ListMachinesGlobal(Viewer{UserID: "creator-1"}, "", "", "")
	if err != nil {
		t.Fatalf("ListMachinesGlobal: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// AC-12, machine half: the cover photo comes from approved photos only.
//
// Matching the whole clause rather than "FROM machine_photos" is the point — the looser
// form passed with the clause deleted, which is how this gap survived the first review.
func TestMachineThumbnailsOnlyUseApprovedPhotos(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("machines.status = ?")).
		WithArgs(StatusActive, 50).
		WillReturnRows(sqlmock.NewRows(machineListColumns()).AddRow("m1", "ラットプル", StatusActive))
	mock.ExpectQuery(regexp.QuoteMeta("FROM threads WHERE machine_id IN")).
		WillReturnRows(sqlmock.NewRows([]string{"machine_id", "count"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM machine_photos WHERE status = 'active'")).
		WillReturnRows(sqlmock.NewRows([]string{"machine_id", "image_url"}).AddRow("m1", "u.jpg"))

	svc := NewGymService(db)
	rows, err := svc.ListMachinesGlobal(anonViewer, "", "", "")
	if err != nil {
		t.Fatalf("ListMachinesGlobal: %v", err)
	}
	if len(rows) != 1 || rows[0].ThumbnailURL != "u.jpg" {
		t.Errorf("thumbnail = %+v, want u.jpg", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An explicit filter the caller is not entitled to is refused rather than downgraded.
func TestListMachinesRejectsAForbiddenStatusFilter(t *testing.T) {
	db, _ := newMockDB(t)
	svc := NewGymService(db)

	if _, err := svc.ListMachines(Viewer{UserID: "u1"}, "gym-1", StatusRejected); err == nil {
		t.Fatal("a non-admin asking for rejected machines was allowed")
	}
	if _, err := svc.ListMachinesGlobal(Viewer{UserID: "u1"}, "", "", StatusRejected); err == nil {
		t.Fatal("a non-admin asking for rejected machines was allowed on the global listing")
	}
}
