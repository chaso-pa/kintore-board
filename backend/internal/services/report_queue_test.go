package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func groupRows(targets ...[2]string) *sqlmock.Rows {
	r := sqlmock.NewRows([]string{
		"target_type", "target_id", "report_count", "first_reported_at", "last_reported_at",
	})
	now := time.Now()
	for _, t := range targets {
		r.AddRow(t[0], t[1], int64(1), now, now)
	}
	return r
}

// The queue is grouped by target. Listing per report would show the same post once per
// complainant, and a moderator could "handle" it while four identical rows stayed pending.
func TestListReportGroupsGroupsByTarget(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("GROUP BY target_type, target_id")).
		WithArgs(StatusPending, 20).
		WillReturnRows(groupRows([2]string{ReportTargetPost, "post-1"}))
	// Details for the listed targets.
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).
		WillReturnRows(sqlmock.NewRows(
			[]string{"target_type", "target_id", "reason", "detail", "created_at"}).
			AddRow(ReportTargetPost, "post-1", ReasonSpam, "宣伝・スパム", time.Now()).
			AddRow(ReportTargetPost, "post-1", ReasonHarassment, "ひどい", time.Now()))
	// The preview pass.
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "thread_id", "body", "status"}).
			AddRow("post-1", "thread-9", "問題のある本文", StatusActive))

	svc := NewReportService(db)
	groups, err := svc.ListReportGroups(StatusPending, 20)
	if err != nil {
		t.Fatalf("ListReportGroups: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("groups = %d, want 1", len(groups))
	}
	g := groups[0]
	if len(g.Reports) != 2 {
		t.Errorf("reports = %d, want both complaints attached", len(g.Reports))
	}
	if g.TargetPreview != "問題のある本文" {
		t.Errorf("preview = %q, want the post body", g.TargetPreview)
	}
	// Without this a moderator can read the post but not reach the thread it is in.
	if g.ThreadID != "thread-9" {
		t.Errorf("thread id = %q, want thread-9", g.ThreadID)
	}
	if !g.TargetExists {
		t.Error("target should be marked as existing")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Oldest first. Sorting by report count would let one old complaint sit forever behind a
// steady trickle of busier ones — the exact failure OldestPendingAgeHours reports on.
func TestListReportGroupsOrdersOldestFirst(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("ORDER BY first_reported_at ASC")).
		WithArgs(StatusPending, 20).
		WillReturnRows(groupRows([2]string{ReportTargetThread, "thread-1"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).
		WillReturnRows(sqlmock.NewRows(
			[]string{"target_type", "target_id", "reason", "detail", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `threads`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "status"}).
			AddRow("thread-1", "タイトル", StatusActive))

	svc := NewReportService(db)
	if _, err := svc.ListReportGroups(StatusPending, 20); err != nil {
		t.Fatalf("ListReportGroups: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A report about content that is already gone is the ordinary case once removal exists.
// The queue has to say so, because an empty preview otherwise reads as a broken screen.
func TestListReportGroupsMarksMissingTargets(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("GROUP BY")).
		WithArgs(StatusPending, 20).
		WillReturnRows(groupRows([2]string{ReportTargetPost, "gone"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).
		WillReturnRows(sqlmock.NewRows(
			[]string{"target_type", "target_id", "reason", "detail", "created_at"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "thread_id", "body", "status"}))

	svc := NewReportService(db)
	groups, err := svc.ListReportGroups(StatusPending, 20)
	if err != nil {
		t.Fatalf("ListReportGroups: %v", err)
	}
	if groups[0].TargetExists {
		t.Error("a target with no row must be reported as missing")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An empty queue must not run the follow-up queries. Beyond the wasted round trips, an
// `IN ()` with no values is a syntax error in MySQL.
func TestListReportGroupsSkipsFollowUpsWhenEmpty(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("GROUP BY")).
		WithArgs(StatusPending, 20).
		WillReturnRows(groupRows())
	// Nothing else expected.

	svc := NewReportService(db)
	groups, err := svc.ListReportGroups(StatusPending, 20)
	if err != nil {
		t.Fatalf("ListReportGroups: %v", err)
	}
	if groups == nil {
		t.Error("want an empty slice rather than nil, so the response serialises as []")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Only the three real states are readable. An unknown filter is refused rather than
// silently treated as pending, which would show a moderator the wrong queue.
func TestListReportGroupsRejectsUnknownStatus(t *testing.T) {
	db, mock := newMockDB(t)

	svc := NewReportService(db)
	_, err := svc.ListReportGroups("deleted", 20)
	if !errors.Is(err, ErrInvalidReportResolution) {
		t.Fatalf("err = %v, want ErrInvalidReportResolution", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("a query ran for an invalid filter: %v", err)
	}
}

// Deciding closes every pending complaint about the target in one statement. Resolving one
// row would leave the rest pending and the post would return to the queue already handled.
func TestResolveReportsClosesEveryPendingComplaint(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `reports` SET `status`=?")).
		WithArgs(ReportStatusReviewed, ReportTargetPost, "post-1", StatusPending).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	svc := NewReportService(db)
	n, err := svc.ResolveReports(ReportTargetPost, "post-1", ReportStatusReviewed)
	if err != nil {
		t.Fatalf("ResolveReports: %v", err)
	}
	if n != 3 {
		t.Errorf("resolved = %d, want all 3", n)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The pending requirement is in the WHERE clause, not a preceding SELECT, so two moderators
// acting at once cannot both believe they made the decision.
func TestResolveReportsReportsAnAlreadyHandledTarget(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `reports`")).
		WithArgs(ReportStatusDismissed, ReportTargetGym, "gym-1", StatusPending).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	svc := NewReportService(db)
	_, err := svc.ResolveReports(ReportTargetGym, "gym-1", ReportStatusDismissed)
	if !errors.Is(err, ErrNoPendingReports) {
		t.Fatalf("err = %v, want ErrNoPendingReports", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Both allowlists reject before any statement runs. pending is not a resolution: re-opening
// a decided report is not something any screen offers.
func TestResolveReportsRejectsBadInputWithoutWriting(t *testing.T) {
	cases := []struct {
		name       string
		targetType string
		to         string
		want       error
	}{
		{"unknown target", "user", ReportStatusReviewed, ErrUnknownReportTarget},
		{"unknown status", ReportTargetPost, "closed", ErrInvalidReportResolution},
		{"reopening", ReportTargetPost, StatusPending, ErrInvalidReportResolution},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			svc := NewReportService(db)
			_, err := svc.ResolveReports(tc.targetType, "x", tc.to)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("a statement ran for invalid input: %v", err)
			}
		})
	}
}

// The badge counts things to look at, not complaints received. Ten reports about one post
// is one decision, and a badge that climbed to ten during a pile-on would misdescribe the
// work outstanding.
func TestPendingReportQueueCountsTargetsNotRows(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("COUNT(DISTINCT target_type, target_id)")).
		WithArgs(StatusPending).
		WillReturnRows(sqlmock.NewRows([]string{"cnt", "oldest"}).
			AddRow(int64(2), time.Now().Add(-3*time.Hour)))

	svc := NewReportService(db)
	d, err := svc.PendingReportQueue()
	if err != nil {
		t.Fatalf("PendingReportQueue: %v", err)
	}
	if d.Pending != 2 {
		t.Errorf("pending = %d, want 2", d.Pending)
	}
	// The age is what turns a count into something you can notice going wrong: three items
	// that arrived this morning read the same as three that have waited a fortnight.
	if d.OldestPendingAgeHours < 2.5 || d.OldestPendingAgeHours > 3.5 {
		t.Errorf("oldest age = %v, want about 3 hours", d.OldestPendingAgeHours)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An empty queue has no oldest entry, and MIN() over no rows is NULL. Scanning that into a
// non-pointer time would fail, so the nil case is pinned.
func TestPendingReportQueueHandlesAnEmptyQueue(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM reports")).
		WithArgs(StatusPending).
		WillReturnRows(sqlmock.NewRows([]string{"cnt", "oldest"}).AddRow(int64(0), nil))

	svc := NewReportService(db)
	d, err := svc.PendingReportQueue()
	if err != nil {
		t.Fatalf("PendingReportQueue: %v", err)
	}
	if d.Pending != 0 || d.OldestPendingAgeHours != 0 {
		t.Errorf("got %+v, want a zero depth", d)
	}
}

func TestTruncateRunesCountsCharactersNotBytes(t *testing.T) {
	// Byte slicing would cut a Japanese post mid-character and produce mojibake, which is
	// the only text a moderator has to judge the report by.
	long := "あ" + string(make([]rune, 0)) + string([]rune("いうえお"))
	if got := truncateRunes(long, 3); got != "あいう…" {
		t.Errorf("truncateRunes = %q, want %q", got, "あいう…")
	}
	if got := truncateRunes("短い", 140); got != "短い" {
		t.Errorf("short text must be returned unchanged, got %q", got)
	}
}
