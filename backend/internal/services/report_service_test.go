package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

// A signed-in, non-admin reporter. Their visibility predicate binds active, pending and
// their own id, in that order — the same shape the link tests rely on.
var reporter = Viewer{UserID: "u1"}

// The lookup that runs first on every call: has this person already reported this target?
func expectNoExistingReport(mock sqlmock.Sqlmock, targetType, targetID string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).
		WithArgs(reporter.UserID, targetType, targetID, 1).
		WillReturnError(gorm.ErrRecordNotFound)
}

func expectUnderDailyLimit(mock sqlmock.Sqlmock, n int64) {
	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `reports`")).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(n))
}

// A report against a gym must go through the same visibility filter as reading one, or the
// endpoint becomes a way to confirm that an id exists. The bound arguments are asserted in
// full rather than the SQL text, because the predicate's shape is the thing under test.
func TestCreateReportChecksGymVisibility(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetGym, "gym-1")
	expectUnderDailyLimit(mock, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, reporter.UserID, "gym-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("gym-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewReportService(db)
	r, err := svc.CreateReport(reporter, ReportTargetGym, "gym-1", ReasonFalseInfo, "")
	if err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	if r.Status != StatusPending {
		t.Errorf("status = %q, want %q", r.Status, StatusPending)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A gym the reporter may not see answers the same way GetGym does. Without this the
// reports table fills with rows pointing at nothing, and each one costs a moderator time.
func TestCreateReportRefusesAnInvisibleTarget(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetGym, "gym-1")
	expectUnderDailyLimit(mock, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM `gyms`")).
		WithArgs(StatusActive, StatusPending, reporter.UserID, "gym-1", 1).
		WillReturnError(gorm.ErrRecordNotFound)
	// No Begin/Exec: the insert must not be reached.

	svc := NewReportService(db)
	_, err := svc.CreateReport(reporter, ReportTargetGym, "gym-1", ReasonSpam, "")
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want ErrRecordNotFound", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Posts and threads are not moderated rows, so they are checked against status directly —
// and that check has to be there, or a deleted post stays reportable forever.
func TestCreateReportChecksPostIsActive(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetPost, "post-1")
	expectUnderDailyLimit(mock, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WithArgs("post-1", StatusActive, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("post-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewReportService(db)
	if _, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonHarassment, ""); err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Reporting the same thing twice returns the first report rather than failing. The reporter
// has no screen showing what they filed, so an error here would be a dead end — and the
// second attempt must not reach the insert, or the count stops meaning "how many people".
func TestCreateReportIsIdempotentPerTarget(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).
		WithArgs(reporter.UserID, ReportTargetPost, "post-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status"}).AddRow("report-1", StatusPending))
	// Nothing else: no limit count, no target lookup, no insert.

	svc := NewReportService(db)
	r, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonSpam, "")
	if err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	if r.ID != "report-1" {
		t.Errorf("id = %q, want the existing report", r.ID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The unique index stops repetition; this stops breadth. One account filing against every
// post on the board would bury the queue moderation depends on.
func TestCreateReportEnforcesTheDailyLimit(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetPost, "post-1")
	expectUnderDailyLimit(mock, reportsPerDay)
	// No target lookup and no insert: the cap is checked before either, so a capped account
	// cannot keep using this endpoint to find out which ids exist.

	svc := NewReportService(db)
	_, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonSpam, "")
	if !errors.Is(err, ErrReportLimitReached) {
		t.Fatalf("err = %v, want ErrReportLimitReached", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The window has to be a window. Counting every report the account ever filed would turn
// the daily cap into a lifetime one, and the difference is invisible until someone hits it.
func TestDailyLimitCountsOnlyTheLastDay(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetPost, "post-1")

	// Two bound arguments, the second a time. A count bound to the user id alone — the
	// lifetime-cap bug — fails here on the argument count before anything else runs.
	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `reports`")).
		WithArgs(reporter.UserID, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("post-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewReportService(db)
	if _, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonSpam, ""); err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	// The assertion that matters is on the argument list above: the count is bound to the
	// user *and* a timestamp. A query with only the user id would fail WithArgs.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Both allowlists must reject before any query runs. A value that reaches the table is a
// report no moderation screen knows how to display.
func TestCreateReportRejectsUnknownValuesWithoutQuerying(t *testing.T) {
	cases := []struct {
		name       string
		targetType string
		reason     string
		want       error
	}{
		{"unknown target", "user", ReasonSpam, ErrUnknownReportTarget},
		{"unknown reason", ReportTargetPost, "because", ErrUnknownReportReason},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			// No expectations at all: any query is an unmet-expectation failure.

			svc := NewReportService(db)
			_, err := svc.CreateReport(reporter, tc.targetType, "x", tc.reason, "")
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("a query was issued for an invalid input: %v", err)
			}
		})
	}
}

// Detail is optional, and an empty string must reach the column as NULL rather than "".
// Otherwise "no detail given" and "detail deliberately left blank" become the same row, and
// a later NOT NULL check or count would read the wrong thing.
func TestCreateReportLeavesEmptyDetailNull(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetPost, "post-1")
	expectUnderDailyLimit(mock, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("post-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewReportService(db)
	r, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonSpam, "")
	if err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	if r.Detail != nil {
		t.Errorf("detail = %q, want nil for an empty string", *r.Detail)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The other half of the same rule: text the reporter actually typed has to survive.
func TestCreateReportKeepsDetail(t *testing.T) {
	db, mock := newMockDB(t)

	expectNoExistingReport(mock, ReportTargetPost, "post-1")
	expectUnderDailyLimit(mock, 0)
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("post-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewReportService(db)
	r, err := svc.CreateReport(reporter, ReportTargetPost, "post-1", ReasonOther, "常連の悪口が書かれている")
	if err != nil {
		t.Fatalf("CreateReport: %v", err)
	}
	if r.Detail == nil || *r.Detail != "常連の悪口が書かれている" {
		t.Errorf("detail = %v, want the submitted text", r.Detail)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
