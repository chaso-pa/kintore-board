package services

import (
	"errors"
	"regexp"
	"strings"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

// blocker is the account doing the blocking, and the viewer whose feed must end up clean.
var blocker = Viewer{UserID: "u1"}

// expectPostLookup stands in for the first query every block makes: who wrote this post.
func expectPostLookup(mock sqlmock.Sqlmock, postID, authorID, body string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WithArgs(postID, StatusActive, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "body"}).
			AddRow(postID, authorID, body))
}

func expectNoExistingBlock(mock sqlmock.Sqlmock, blockedID string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `user_blocks`")).
		WithArgs(blocker.UserID, blockedID, 1).
		WillReturnError(gorm.ErrRecordNotFound)
}

// The notification that follows every block. Asserted loosely because the point of these
// tests is the block, not the report — the report's own behaviour is pinned next door in
// report_service_test.go.
func expectNotification(mock sqlmock.Sqlmock) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `reports`")).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("p1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `reports`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
}

func newBlockService(db *gorm.DB) *BlockService {
	return NewBlockService(db, NewReportService(db))
}

// The author is resolved from the post rather than supplied. If this ever regressed to
// taking a user id, the app would have to be handed one to call it — and the per-thread
// anonymous id would stop being the only identity on the board.
func TestBlockResolvesAuthorFromPost(t *testing.T) {
	db, mock := newMockDB(t)

	expectPostLookup(mock, "p1", "u2", "ここのハックは深く入る")
	expectNoExistingBlock(mock, "u2")
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `user_blocks`")).
		WithArgs(sqlmock.AnyArg(), blocker.UserID, "u2", "ここのハックは深く入る", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()
	expectNotification(mock)

	b, err := newBlockService(db).BlockAuthorOfPost(blocker, "p1")
	if err != nil {
		t.Fatalf("BlockAuthorOfPost: %v", err)
	}
	if b.BlockedUserID != "u2" {
		t.Errorf("blocked %q, want the post's author u2", b.BlockedUserID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

// A self-block writes a row that hides the account's own posts from itself in both
// directions, and offers to unblock a user the person cannot recognise as themselves.
func TestBlockRefusesSelf(t *testing.T) {
	db, mock := newMockDB(t)
	expectPostLookup(mock, "p1", blocker.UserID, "自分の投稿")

	_, err := newBlockService(db).BlockAuthorOfPost(blocker, "p1")
	if !errors.Is(err, ErrCannotBlockSelf) {
		t.Fatalf("err = %v, want ErrCannotBlockSelf", err)
	}
}

// Tapping block twice is someone confirming a decision, not making a mistake. The second
// call returns the existing row rather than colliding with the unique index.
func TestBlockIsIdempotent(t *testing.T) {
	db, mock := newMockDB(t)

	expectPostLookup(mock, "p1", "u2", "body")
	mock.ExpectQuery(regexp.QuoteMeta("FROM `user_blocks`")).
		WithArgs(blocker.UserID, "u2", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "blocker_user_id", "blocked_user_id"}).
			AddRow("b1", blocker.UserID, "u2"))
	expectNotification(mock)

	b, err := newBlockService(db).BlockAuthorOfPost(blocker, "p1")
	if err != nil {
		t.Fatalf("BlockAuthorOfPost: %v", err)
	}
	if b.ID != "b1" {
		t.Errorf("id = %q, want the existing row b1", b.ID)
	}
}

// The daily report cap exists to stop one account burying the moderation queue. Someone who
// has hit it is also the account most likely to need the next block, so the cap must not be
// able to refuse one — the notification is best-effort, the block is not.
func TestBlockSucceedsWhenNotificationFails(t *testing.T) {
	db, mock := newMockDB(t)

	expectPostLookup(mock, "p1", "u2", "body")
	expectNoExistingBlock(mock, "u2")
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `user_blocks`")).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	// The report path finds no existing report, then reads the day's count as over the cap.
	mock.ExpectQuery(regexp.QuoteMeta("FROM `reports`")).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(regexp.QuoteMeta("SELECT count(*) FROM `reports`")).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(reportsPerDay))

	if _, err := newBlockService(db).BlockAuthorOfPost(blocker, "p1"); err != nil {
		t.Fatalf("block should survive a failed notification, got %v", err)
	}
}

// Unblocking is scoped by blocker. Without the predicate, any account could clear anyone
// else's block list — which is the one write that undoes the protection this feature exists
// to provide.
func TestUnblockIsScopedToTheBlocker(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `user_blocks`")).
		WithArgs(blocker.UserID, "u2").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := newBlockService(db).Unblock(blocker, "u2"); err != nil {
		t.Fatalf("Unblock: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

// The listing shows only what this account blocked. Blocks placed *against* them are theirs
// neither to see nor to lift — surfacing them would tell someone they had been blocked,
// which is the disclosure two-way hiding exists to avoid.
func TestListBlocksOnlyReturnsOwnBlocks(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `user_blocks`")).
		WithArgs(blocker.UserID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "blocker_user_id", "blocked_user_id"}).
			AddRow("b1", blocker.UserID, "u2"))

	rows, err := newBlockService(db).ListBlocks(blocker)
	if err != nil {
		t.Fatalf("ListBlocks: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("got %d rows, want 1", len(rows))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

// The predicate is the whole feature: one direction hides the harassment from the blocker
// while leaving the other person able to read and reply to everything they write.
func TestBlockedPredicateHidesBothDirections(t *testing.T) {
	pred, args := blockedPredicate("u1", "posts.user_id")

	if !strings.Contains(pred, "WHERE blocker_user_id = ?") {
		t.Error("predicate does not exclude people the viewer blocked")
	}
	if !strings.Contains(pred, "WHERE blocked_user_id = ?") {
		t.Error("predicate does not exclude people who blocked the viewer")
	}
	if !strings.Contains(pred, "UNION") {
		t.Error("the two directions must be unioned into one subquery")
	}
	if len(args) != 2 || args[0] != "u1" || args[1] != "u1" {
		t.Errorf("args = %v, want the viewer id bound once per direction", args)
	}
}

// A signed-out reader has blocked nobody. Returning an empty predicate rather than one that
// matches nothing keeps every listing from having to special case the anonymous viewer.
func TestBlockedPredicateIsEmptyForAnonymousViewer(t *testing.T) {
	pred, args := blockedPredicate("", "posts.user_id")
	if pred != "" || args != nil {
		t.Errorf("got (%q, %v), want no predicate", pred, args)
	}
}

// Excerpts are cut by rune. A byte-length cut would slice a Japanese character in half, and
// every post on this board is Japanese.
func TestExcerptCutsOnRuneBoundaries(t *testing.T) {
	long := strings.Repeat("あ", 60)
	got := excerptOf(long)
	if got == nil {
		t.Fatal("excerptOf returned nil for a non-empty body")
	}
	if want := strings.Repeat("あ", excerptRunes) + "…"; *got != want {
		t.Errorf("excerpt = %q, want %q", *got, want)
	}
}

func TestExcerptLeavesShortBodiesAlone(t *testing.T) {
	got := excerptOf("短い")
	if got == nil || *got != "短い" {
		t.Errorf("excerpt = %v, want 短い unchanged", got)
	}
}

// The listings are where the requirement actually lands: App Store guideline 1.2 asks that
// blocked content leave the feed, and a predicate that is built correctly but never reaches
// the query would pass every test above while changing nothing on screen.
//
// Asserted through the real query builders rather than by inspecting the predicate, because
// the failure being guarded against is a missing call, not a wrong string.

func TestListPostsExcludesBlockedAuthors(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WithArgs("t1", "active", blocker.UserID, blocker.UserID, 51).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	svc := NewThreadService(db, "secret")
	if _, _, err := svc.ListPosts(blocker.UserID, "t1", "", 50); err != nil {
		t.Fatalf("ListPosts: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestListThreadsExcludesBlockedAuthors(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `threads`")).
		WithArgs("active", blocker.UserID, blocker.UserID, 21).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	svc := NewThreadService(db, "secret")
	if _, _, err := svc.ListThreads(blocker.UserID, "", "new", "", "", "", 20); err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

// A thread started by someone the viewer blocked is reported as missing, not forbidden.
// Answering differently would confirm that account's authorship across every thread it has
// ever opened — the opposite of what the per-thread anonymous id is for.
func TestGetThreadExcludesBlockedAuthors(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `threads`")).
		WithArgs(blocker.UserID, blocker.UserID, "t1", "active", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	svc := NewThreadService(db, "secret")
	if _, err := svc.GetThread(blocker.UserID, "t1"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want ErrRecordNotFound", err)
	}
}

// A signed-out reader has blocked nobody, so no subquery should be added — and its two bound
// arguments must not appear, or the placeholders would not line up with the values.
func TestListPostsSkipsTheFilterForAnonymousViewers(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).
		WithArgs("t1", "active", 51).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	svc := NewThreadService(db, "secret")
	if _, _, err := svc.ListPosts("", "t1", "", 50); err != nil {
		t.Fatalf("ListPosts: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}
