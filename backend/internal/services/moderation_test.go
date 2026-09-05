package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// Only a decision may be recorded. "pending" is rejected as a destination because nothing
// in the product can find a rejected row again, so undoing a decision would be a button
// with no screen behind it.
func TestSetStatusRejectsANonDecision(t *testing.T) {
	db, _ := newMockDB(t)
	svc := NewGymService(db)

	for _, to := range []string{StatusPending, "deleted", "", "ACTIVE"} {
		t.Run(to, func(t *testing.T) {
			err := svc.SetGymStatus("gym-1", to)
			if !errors.Is(err, ErrInvalidStatusTransition) {
				t.Errorf("SetGymStatus(to=%q) = %v, want ErrInvalidStatusTransition", to, err)
			}
		})
	}
	// sqlmock would flag an unexpected query, so reaching the DB at all fails the test.
}

// The source state is pinned in the WHERE clause. This is what keeps the deferred
// "take down something already published" behaviour out of the API: an active row simply
// matches nothing.
func TestSetStatusOnlyAffectsPendingRows(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `gyms` SET `status`=?")).
		WithArgs(StatusRejected, "gym-1", StatusPending).
		WillReturnResult(sqlmock.NewResult(0, 0)) // already active: nothing matched
	mock.ExpectCommit()

	svc := NewGymService(db)
	err := svc.SetGymStatus("gym-1", StatusRejected)
	if !errors.Is(err, ErrNotPending) {
		t.Fatalf("rejecting an already-active gym = %v, want ErrNotPending", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestSetStatusApprovesAPendingRow(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `gyms` SET `status`=?")).
		WithArgs(StatusActive, "gym-1", StatusPending).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewGymService(db)
	if err := svc.SetGymStatus("gym-1", StatusActive); err != nil {
		t.Fatalf("SetGymStatus: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Each wrapper must address its own table; crossing them would decide the wrong row.
func TestSetStatusTargetsTheRightTable(t *testing.T) {
	cases := []struct {
		name  string
		table string
		call  func(*GymService) error
	}{
		{"gym", "gyms", func(s *GymService) error { return s.SetGymStatus("id-1", StatusActive) }},
		{"machine", "machines", func(s *GymService) error { return s.SetMachineStatus("id-1", StatusActive) }},
		{"gym photo", "gym_photos", func(s *GymService) error { return s.SetGymPhotoStatus("id-1", StatusActive) }},
		{"machine photo", "machine_photos", func(s *GymService) error { return s.SetMachinePhotoStatus("id-1", StatusActive) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectBegin()
			mock.ExpectExec(regexp.QuoteMeta("UPDATE `"+tc.table+"` SET `status`=?")).
				WithArgs(StatusActive, "id-1", StatusPending).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()

			if err := tc.call(NewGymService(db)); err != nil {
				t.Fatalf("set status: %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet expectations: %v", err)
			}
		})
	}
}

// The queue summary has to read every moderated table, including the photo ones — those
// had no created_at until this work added it, which is what made the age figure possible.
func TestModerationCountsReadsEveryQueue(t *testing.T) {
	db, mock := newMockDB(t)

	for _, table := range []string{"gyms", "machines", "gym_photos", "machine_photos"} {
		mock.ExpectQuery(regexp.QuoteMeta("FROM " + table + " WHERE status = ?")).
			WithArgs(StatusPending).
			WillReturnRows(sqlmock.NewRows([]string{"cnt", "oldest"}).AddRow(2, nil))
	}

	svc := NewGymService(db)
	q, err := svc.ModerationCounts()
	if err != nil {
		t.Fatalf("ModerationCounts: %v", err)
	}
	for name, got := range map[string]int64{
		"gyms": q.Gyms.Pending, "machines": q.Machines.Pending,
		"gym_photos": q.GymPhotos.Pending, "machine_photos": q.MachinePhotos.Pending,
	} {
		if got != 2 {
			t.Errorf("%s pending = %d, want 2", name, got)
		}
	}
	// An empty queue has no oldest row, and must report 0 rather than an age measured
	// from the zero time.
	if q.Gyms.OldestPendingAgeHours != 0 {
		t.Errorf("age with a NULL oldest = %v, want 0", q.Gyms.OldestPendingAgeHours)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
