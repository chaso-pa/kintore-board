package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

var (
	author = Viewer{UserID: "author-1"}
	admin  = Viewer{UserID: "admin-1", IsAdmin: true}
)

func expectOwnerLookup(mock sqlmock.Sqlmock, table, owner, status string) {
	mock.ExpectQuery(regexp.QuoteMeta("FROM `" + table + "`")).
		WillReturnRows(sqlmock.NewRows([]string{"owner", "status"}).AddRow(owner, status))
}

// The author's own removal, and the status it records.
func TestDeletePostByItsAuthor(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", author.UserID, StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `posts` SET `status`=?")).
		WithArgs(PostStatusDeleted, "post-1", StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewThreadService(db, "secret")
	got, err := svc.DeletePost(author, "post-1")
	if err != nil {
		t.Fatalf("DeletePost: %v", err)
	}
	if got != PostStatusDeleted {
		t.Errorf("status = %q, want %q", got, PostStatusDeleted)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A moderator removing someone else's post records a different status. Collapsing the two
// would erase the only record of how much moderation is actually happening.
func TestDeletePostByAdminRecordsRemoved(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", "someone-else", StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `posts`")).
		WithArgs(PostStatusRemoved, "post-1", StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewThreadService(db, "secret")
	got, err := svc.DeletePost(admin, "post-1")
	if err != nil {
		t.Fatalf("DeletePost: %v", err)
	}
	if got != PostStatusRemoved {
		t.Errorf("status = %q, want %q", got, PostStatusRemoved)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An admin deleting their own post is acting as an author, not as a moderator.
func TestAdminDeletingOwnPostIsNotAModerationAction(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", admin.UserID, StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `posts`")).
		WithArgs(PostStatusDeleted, "post-1", StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewThreadService(db, "secret")
	got, err := svc.DeletePost(admin, "post-1")
	if err != nil {
		t.Fatalf("DeletePost: %v", err)
	}
	if got != PostStatusDeleted {
		t.Errorf("status = %q, want %q — an admin is the author here", got, PostStatusDeleted)
	}
}

// Anyone else is refused, and nothing is written. Without this any authenticated user could
// empty the board.
func TestDeletePostRefusesAStranger(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", "someone-else", StatusActive)
	// No Begin/Exec: the update must not be reached.

	svc := NewThreadService(db, "secret")
	_, err := svc.DeletePost(Viewer{UserID: "intruder"}, "post-1")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A signed-out caller has an empty id, which must not match a row whose author column is
// somehow empty too.
func TestDeletePostRefusesAnEmptyViewer(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", "", StatusActive)

	svc := NewThreadService(db, "secret")
	_, err := svc.DeletePost(Viewer{}, "post-1")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
}

// Deleting twice is refused rather than silently succeeding, so a stale list cannot report
// a second removal that never happened.
func TestDeletePostRefusesAnAlreadyDeletedRow(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", author.UserID, PostStatusDeleted)

	svc := NewThreadService(db, "secret")
	_, err := svc.DeletePost(author, "post-1")
	if !errors.Is(err, ErrAlreadyDeleted) {
		t.Fatalf("err = %v, want ErrAlreadyDeleted", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The active requirement is in the WHERE clause as well as the preceding read, so two
// requests racing cannot both report success.
func TestDeletePostDetectsALostRace(t *testing.T) {
	db, mock := newMockDB(t)

	expectOwnerLookup(mock, "posts", author.UserID, StatusActive)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `posts`")).
		WithArgs(PostStatusDeleted, "post-1", StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	svc := NewThreadService(db, "secret")
	_, err := svc.DeletePost(author, "post-1")
	if !errors.Is(err, ErrAlreadyDeleted) {
		t.Fatalf("err = %v, want ErrAlreadyDeleted for a lost race", err)
	}
}

func TestDeletePostReportsAMissingRow(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("FROM `posts`")).WillReturnError(gorm.ErrRecordNotFound)

	svc := NewThreadService(db, "secret")
	_, err := svc.DeletePost(author, "nope")
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want ErrRecordNotFound", err)
	}
}

// Threads use a different author column. Reading the wrong one would compare a user id
// against something that is not a user id, and refuse every legitimate deletion.
func TestDeleteThreadUsesItsOwnAuthorColumn(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT created_by_user_id AS owner, status FROM `threads`")).
		WillReturnRows(sqlmock.NewRows([]string{"owner", "status"}).
			AddRow(author.UserID, StatusActive))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `threads` SET `status`=?")).
		WithArgs(PostStatusDeleted, "thread-1", StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := NewThreadService(db, "secret")
	if _, err := svc.DeleteThread(author, "thread-1"); err != nil {
		t.Fatalf("DeleteThread: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Removal is a status change, never a DELETE. The moderation queue reads the row to show a
// moderator what was complained about, so destroying it would leave every report about it
// pointing at content nobody can review — including the person judging the removal.
func TestRemovalNeverIssuesADelete(t *testing.T) {
	for _, tc := range []struct {
		name  string
		table string
		run   func(*ThreadService) error
	}{
		{"post", "posts", func(s *ThreadService) error {
			_, err := s.DeletePost(author, "post-1")
			return err
		}},
		{"thread", "threads", func(s *ThreadService) error {
			_, err := s.DeleteThread(author, "thread-1")
			return err
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			expectOwnerLookup(mock, tc.table, author.UserID, StatusActive)
			mock.ExpectBegin()
			// An UPDATE is expected. A DELETE would not match and the call would fail.
			mock.ExpectExec(regexp.QuoteMeta("UPDATE `" + tc.table + "`")).
				WillReturnResult(sqlmock.NewResult(0, 1))
			mock.ExpectCommit()

			svc := NewThreadService(db, "secret")
			if err := tc.run(svc); err != nil {
				t.Fatalf("delete: %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet expectations: %v", err)
			}
		})
	}
}
