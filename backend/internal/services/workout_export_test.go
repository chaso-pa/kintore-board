package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// The export is what a device imports its whole history from. A dropped row is a record
// the user never sees again, so the paging and the raw values are pinned here.

var exportHeadCols = []string{"id", "trained_on", "memo", "created_at"}
var exportSetCols = []string{"id", "workout_id", "exercise_name", "weight", "reps", "sets", "memo", "spotted", "body_part", "sort_order"}

func TestExportWorkoutsFirstPageIsScopedOrderedAndCursored(t *testing.T) {
	db, mock := newMockDB(t)

	t1 := time.Date(2026, 9, 2, 10, 0, 0, 0, time.UTC)
	t0 := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	created := time.Date(2026, 9, 2, 11, 0, 0, 0, time.UTC)

	// Scoped to the caller, newest first with id breaking ties, one extra row to learn
	// whether there is a next page.
	mock.ExpectQuery(`SELECT id, trained_on, memo, created_at FROM .workouts. WHERE user_id = \? ORDER BY trained_on DESC, id DESC LIMIT \?`).
		WithArgs("u1", 3).
		WillReturnRows(sqlmock.NewRows(exportHeadCols).
			AddRow("w3", t1, "push day", created).
			AddRow("w2", t1, nil, created).
			AddRow("w1", t0, nil, created))
	mock.ExpectQuery(regexp.QuoteMeta("FROM `workout_sets` WHERE workout_id IN (?,?) ORDER BY workout_id, sort_order, id")).
		WithArgs("w3", "w2").
		WillReturnRows(sqlmock.NewRows(exportSetCols).
			AddRow("s1", "w2", "懸垂", nil, 10, nil, nil, false, nil, 0).
			AddRow("s2", "w3", "ベンチプレス", 100.0, 5, 3, "RPE8", true, "胸", 0).
			AddRow("s3", "w3", "ベンチプレス", 90.0, 8, 0, "", false, "", 1))

	svc := &WorkoutService{db: db}
	rows, next, err := svc.ExportWorkouts("u1", "", 2)
	if err != nil {
		t.Fatalf("ExportWorkouts: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
	if len(rows) != 2 || rows[0].ID != "w3" || rows[1].ID != "w2" {
		t.Fatalf("got %+v, want w3, w2", rows)
	}
	if next != encodeExportCursor(t1, "w2") {
		t.Fatalf("next cursor = %q, want one pointing at (t1, w2)", next)
	}

	// Sets attach to their own workout, in sort_order.
	if len(rows[0].Sets) != 2 || rows[0].Sets[0].ID != "s2" || rows[0].Sets[1].ID != "s3" {
		t.Fatalf("w3 sets = %+v", rows[0].Sets)
	}
	if len(rows[1].Sets) != 1 || rows[1].Sets[0].ID != "s1" {
		t.Fatalf("w2 sets = %+v", rows[1].Sets)
	}

	// NULL stays NULL. 0 and "" stay 0 and "" — the two are not the same to the
	// aggregates (NULL is skipped by SUM; 0 sets counts as 1).
	s1 := rows[1].Sets[0]
	if s1.Weight != nil || s1.Sets != nil || s1.Memo != nil || s1.BodyPart != nil {
		t.Errorf("NULL columns came back as values: %+v", s1)
	}
	if s1.Reps == nil || *s1.Reps != 10 {
		t.Errorf("reps = %v, want 10", s1.Reps)
	}
	s3 := rows[0].Sets[1]
	if s3.Sets == nil || *s3.Sets != 0 || s3.BodyPart == nil || *s3.BodyPart != "" || s3.Memo == nil || *s3.Memo != "" {
		t.Errorf("zero values were turned into NULL: %+v", s3)
	}
	if rows[1].Memo != nil {
		t.Errorf("workout memo = %v, want nil", *rows[1].Memo)
	}
	if rows[0].Memo == nil || *rows[0].Memo != "push day" {
		t.Errorf("workout memo = %v, want push day", rows[0].Memo)
	}
	s2 := rows[0].Sets[0]
	if s2.Weight == nil || *s2.Weight != 100 || !s2.Spotted || s2.BodyPart == nil || *s2.BodyPart != "胸" {
		t.Errorf("s2 = %+v", s2)
	}
}

// The next page continues strictly after (trained_on, id). trained_on alone — what the old
// listing used — skips the rest of a timestamp shared across the page boundary.
func TestExportWorkoutsContinuesAfterTheCursorIncludingTies(t *testing.T) {
	db, mock := newMockDB(t)

	at := time.Date(2026, 9, 2, 10, 0, 0, 123_000_000, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta("WHERE user_id = ? AND (trained_on < ? OR (trained_on = ? AND id < ?)) ORDER BY trained_on DESC, id DESC LIMIT ?")).
		WithArgs("u1", at, at, "w2", 201).
		WillReturnRows(sqlmock.NewRows(exportHeadCols).
			AddRow("w1", at, nil, at))
	mock.ExpectQuery(regexp.QuoteMeta("WHERE workout_id IN (?)")).
		WithArgs("w1").
		WillReturnRows(sqlmock.NewRows(exportSetCols))

	svc := &WorkoutService{db: db}
	rows, next, err := svc.ExportWorkouts("u1", encodeExportCursor(at, "w2"), 0)
	if err != nil {
		t.Fatalf("ExportWorkouts: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
	if len(rows) != 1 || rows[0].ID != "w1" {
		t.Fatalf("got %+v", rows)
	}
	if next != "" {
		t.Errorf("next = %q on the last page, want empty", next)
	}
	// A workout with no sets is still exported, with an empty list rather than null.
	if rows[0].Sets == nil || len(rows[0].Sets) != 0 {
		t.Errorf("sets = %#v, want empty slice", rows[0].Sets)
	}
}

func TestExportWorkoutsClampsTheLimit(t *testing.T) {
	for _, c := range []struct{ in, sent int }{{0, 201}, {-5, 201}, {1000, 501}, {500, 501}, {1, 2}} {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`LIMIT \?`).
			WithArgs("u1", c.sent).
			WillReturnRows(sqlmock.NewRows(exportHeadCols))

		svc := &WorkoutService{db: db}
		rows, next, err := svc.ExportWorkouts("u1", "", c.in)
		if err != nil {
			t.Fatalf("limit %d: %v", c.in, err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("limit %d: %v", c.in, err)
		}
		// No workouts: no set query, an empty list (not null) and no cursor.
		if rows == nil || len(rows) != 0 || next != "" {
			t.Fatalf("limit %d: got (%#v, %q)", c.in, rows, next)
		}
	}
}

func TestExportWorkoutsRejectsAForeignCursor(t *testing.T) {
	db, mock := newMockDB(t)
	svc := &WorkoutService{db: db}

	for _, cursor := range []string{"not base64!", "bm8tc2VwYXJhdG9y", "MjAyNi0wOS0wMnx3MQ"} {
		if _, _, err := svc.ExportWorkouts("u1", cursor, 10); !errors.Is(err, ErrInvalidCursor) {
			t.Errorf("cursor %q: got %v, want ErrInvalidCursor", cursor, err)
		}
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("a query ran for an invalid cursor: %v", err)
	}
}

// The cursor carries trained_on to the millisecond with an explicit offset, so it names
// the same instant whatever time zone the server runs in.
func TestExportCursorRoundTripsAtMillisecondPrecision(t *testing.T) {
	jst := time.FixedZone("JST", 9*3600)
	at := time.Date(2026, 9, 1, 0, 30, 0, 456_000_000, jst)

	c := encodeExportCursor(at, "w9")
	got, id, err := decodeExportCursor(c)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Equal(at) || id != "w9" {
		t.Fatalf("got (%v, %q), want (%v, w9)", got, id, at)
	}
	if got.Location() != time.UTC {
		t.Errorf("decoded in %v, want UTC", got.Location())
	}
}
