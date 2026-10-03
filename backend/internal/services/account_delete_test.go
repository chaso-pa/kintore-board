package services

import (
	"errors"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"gorm.io/gorm"
)

const deletingUser = "user-1"

func expectUserTombstone(mock sqlmock.Sqlmock, rows int64) {
	mock.ExpectExec(regexp.QuoteMeta("UPDATE users SET status = ?, role = 'user', device_uuid = CONCAT('deleted:', id)")).
		WithArgs(UserStatusDeleted, deletingUser, UserStatusDeleted).
		WillReturnResult(sqlmock.NewResult(0, rows))
}

// Every step runs inside one transaction, and posts and threads are hidden with the same
// status an author's own delete records rather than being dropped.
func TestDeleteAccountRemovesPersonalDataAndHidesPosts(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	expectUserTombstone(mock, 1)
	mock.ExpectExec(regexp.QuoteMeta("UPDATE posts SET status = ? WHERE user_id = ? AND status = ?")).
		WithArgs(PostStatusDeleted, deletingUser, StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec(regexp.QuoteMeta("UPDATE threads SET status = ? WHERE created_by_user_id = ? AND status = ?")).
		WithArgs(PostStatusDeleted, deletingUser, StatusActive).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM workout_sets WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)")).
		WithArgs(deletingUser).
		WillReturnResult(sqlmock.NewResult(0, 10))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM workouts WHERE user_id = ?")).
		WithArgs(deletingUser).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM thread_bookmarks WHERE user_id = ?")).
		WithArgs(deletingUser).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM gym_favorites WHERE user_id = ?")).
		WithArgs(deletingUser).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM user_blocks WHERE blocker_user_id = ? OR blocked_user_id = ?")).
		WithArgs(deletingUser, deletingUser).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	if err := NewAuthService(db).DeleteAccount(deletingUser); err != nil {
		t.Fatalf("DeleteAccount: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A second delete finds nothing to tombstone and touches nothing else.
func TestDeleteAccountTwiceIsNotFound(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	expectUserTombstone(mock, 0)
	mock.ExpectRollback()

	err := NewAuthService(db).DeleteAccount(deletingUser)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want ErrRecordNotFound", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A failure part-way rolls the whole thing back; a half-deleted account is the one outcome
// that must not happen.
func TestDeleteAccountRollsBackOnFailure(t *testing.T) {
	db, mock := newMockDB(t)
	boom := errors.New("boom")

	mock.ExpectBegin()
	expectUserTombstone(mock, 1)
	mock.ExpectExec(regexp.QuoteMeta("UPDATE posts")).WillReturnError(boom)
	mock.ExpectRollback()

	if err := NewAuthService(db).DeleteAccount(deletingUser); !errors.Is(err, boom) {
		t.Fatalf("err = %v, want %v", err, boom)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// No caller means no account; nothing may run.
func TestDeleteAccountWithoutUserTouchesNothing(t *testing.T) {
	db, mock := newMockDB(t)

	if err := NewAuthService(db).DeleteAccount(""); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("err = %v, want ErrRecordNotFound", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
