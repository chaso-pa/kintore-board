package services

import (
	"errors"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

// A failed set insert used to be discarded, so both of these returned success with the
// workout row written and no sets attached. The client recorded that as saved; the sets
// were simply absent the next time the record was opened, which is what "it saved but came
// back empty after a restart" looked like from the outside.

func oneSet() []WorkoutSet {
	return []WorkoutSet{{ExerciseName: "ベンチプレス", Weight: 60, Reps: 10, Sets: 1}}
}

func TestCreateWorkoutFailsWhenSetsCannotBeWritten(t *testing.T) {
	db, mock := newMockDB(t)

	boom := errors.New("insert failed")
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workout_sets`")).
		WillReturnError(boom)
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if _, err := svc.CreateWorkout("u1", time.Now(), "", oneSet()); err == nil {
		t.Fatal("CreateWorkout reported success even though no set was written")
	}
}

func TestUpdateWorkoutFailsWhenSetsCannotBeWritten(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}).AddRow("w1", "u1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("UPDATE `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workout_sets`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta("INSERT INTO `workout_sets`")).
		WillReturnError(errors.New("insert failed"))
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.UpdateWorkout("w1", "u1", time.Now(), "", oneSet()); err == nil {
		t.Fatal("UpdateWorkout reported success even though the replacement sets were lost")
	}
}

// Only one workout per day is reachable from the calendar, so when a day holds more than
// one the pick has to be the same on every request. Ordering by trained_on alone left it
// to the storage engine, and a day whose two records shared a timestamp could hand back
// either one — the same edit looked saved, then reverted, then saved again.
func TestGetWorkoutDatesPicksDeterministically(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`ORDER BY trained_on DESC, id DESC`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "trained_on", "memo"}))

	svc := &WorkoutService{db: db}
	if _, err := svc.GetWorkoutDates("u1", 2026, 8); err != nil {
		t.Fatalf("GetWorkoutDates: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the tie-break was dropped from the ordering: %v", err)
	}
}

// workout_sets holds a foreign key to workouts with no cascade, so removing the parent row
// on its own failed with error 1451 for every workout that had a set — which is every
// workout anyone would want to delete. The sets have to go first, in one transaction.
func TestDeleteWorkoutRemovesSetsFirst(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}).AddRow("w1", "u1"))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workout_sets`")).
		WillReturnResult(sqlmock.NewResult(1, 2))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM `workouts`")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "u1"); err != nil {
		t.Fatalf("DeleteWorkout: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the sets were not removed before the workout: %v", err)
	}
}

// A workout belonging to someone else must not have its sets deleted on the way to
// discovering that the workout itself is out of reach.
func TestDeleteWorkoutTouchesNothingForAnotherUser(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta("SELECT * FROM `workouts`")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id"}))
	mock.ExpectRollback()

	svc := &WorkoutService{db: db}
	if err := svc.DeleteWorkout("w1", "intruder"); err == nil {
		t.Fatal("DeleteWorkout reported success for a workout the user does not own")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// The server cannot work out a body part on its own: the preset list ships inside the app
// and anything the user invented lives in a file on their phone. So the phone sends the
// mapping and these rows get filled in.

func TestClassifyExercisesOnlyTouchesUnclassifiedRows(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(`UPDATE .workout_sets. SET .body_part.=\?.*WHERE exercise_name = \?.*body_part IS NULL OR body_part = ''`).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	n, err := svc.ClassifyExercises("u1", []ExerciseBodyPart{{ExerciseName: "ベンチプレス", BodyPart: "BIG3"}})
	if err != nil {
		t.Fatalf("ClassifyExercises: %v", err)
	}
	if n != 3 {
		t.Fatalf("reported %d rows, want 3", n)
	}
	// A row that already carries a body part was written by a client that knew the answer;
	// reclassifying the name later must not rewrite it.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the already-classified rows were not excluded: %v", err)
	}
}

// workout_sets carries no user_id of its own. Without scoping through the parent workout,
// one client's mapping would rewrite every user's rows for that exercise name.
func TestClassifyExercisesIsScopedToTheCaller(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectBegin()
	mock.ExpectExec(`workout_id IN \(SELECT .id. FROM .workouts. WHERE user_id = \?\)`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	svc := &WorkoutService{db: db}
	if _, err := svc.ClassifyExercises("u1", []ExerciseBodyPart{{ExerciseName: "スクワット", BodyPart: "BIG3"}}); err != nil {
		t.Fatalf("ClassifyExercises: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the update was not scoped to the caller: %v", err)
	}
}

// A blank half is not a classification. Writing it would mark the row as done while leaving
// it as unclassified as before, and it would never be offered for classification again.
func TestClassifyExercisesSkipsBlankMappings(t *testing.T) {
	db, mock := newMockDB(t)

	svc := &WorkoutService{db: db}
	n, err := svc.ClassifyExercises("u1", []ExerciseBodyPart{
		{ExerciseName: "  ", BodyPart: "胸"},
		{ExerciseName: "ベンチプレス", BodyPart: "   "},
	})
	if err != nil {
		t.Fatalf("ClassifyExercises: %v", err)
	}
	if n != 0 {
		t.Fatalf("reported %d rows, want 0", n)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("a query was issued for a blank mapping: %v", err)
	}
}

func TestUnclassifiedExerciseNamesIsScopedToTheCaller(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`JOIN workouts ON workouts.id = workout_sets.workout_id.*workouts.user_id = \?.*body_part IS NULL OR workout_sets.body_part = ''`).
		WillReturnRows(sqlmock.NewRows([]string{"exercise_name"}).AddRow("アブドミナル"))

	svc := &WorkoutService{db: db}
	names, err := svc.UnclassifiedExerciseNames("u1")
	if err != nil {
		t.Fatalf("UnclassifiedExerciseNames: %v", err)
	}
	if len(names) != 1 || names[0] != "アブドミナル" {
		t.Fatalf("got %v", names)
	}
}

// --- Phase 2: an entry in the picker is a name *and* a part ---

// The filter is what keeps two same-named exercises apart. An empty filter must stay
// permissive, because that is what a client built before this field sends: those installs
// have to keep seeing one combined history rather than nothing at all.
func TestExerciseHistoryWithoutAFilterCoversEveryPart(t *testing.T) {
	db, mock := newMockDB(t)

	// Exactly the two bindings the unfiltered query needs. A body_part clause would bind a
	// third and fail here — Go's regexp has no negative lookahead, so the argument list is
	// what pins "no extra predicate" down.
	mock.ExpectQuery(`FROM .workout_sets.`).
		WithArgs("u1", "プルオーバー").
		WillReturnRows(sqlmock.NewRows([]string{"trained_on", "workout_id", "weight", "reps", "sets", "spotted", "sort_order", "memo"}))

	svc := NewWorkoutService(db)
	if _, _, err := svc.GetExerciseHistory("u1", "プルオーバー", ExerciseFilter{}); err != nil {
		t.Fatalf("GetExerciseHistory: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("an unfiltered query was narrowed by body part: %v", err)
	}
}

func TestExerciseHistoryNarrowsToOnePart(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`workout_sets.body_part = \?`).
		WithArgs("u1", "プルオーバー", "背中").
		WillReturnRows(sqlmock.NewRows([]string{"trained_on", "workout_id", "weight", "reps", "sets", "spotted", "sort_order", "memo"}))

	svc := NewWorkoutService(db)
	if _, _, err := svc.GetExerciseHistory("u1", "プルオーバー", ExerciseFilter{BodyPart: "背中"}); err != nil {
		t.Fatalf("GetExerciseHistory: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// Unclassified is a flag rather than a reserved body_part value, because parts are
// user-defined strings and any sentinel could collide with one somebody actually made.
func TestExerciseHistoryCanSelectTheUnclassifiedEntry(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`body_part IS NULL OR workout_sets.body_part = ''`).
		WillReturnRows(sqlmock.NewRows([]string{"trained_on", "workout_id", "weight", "reps", "sets", "spotted", "sort_order", "memo"}))

	svc := NewWorkoutService(db)
	if _, _, err := svc.GetExerciseHistory("u1", "プルオーバー", ExerciseFilter{Unclassified: true}); err != nil {
		t.Fatalf("GetExerciseHistory: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("%v", err)
	}
}

// Beating a pullover done as back work must not be reported as a record on the chest one.
func TestExerciseMaxE1RMIsScopedToThePart(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`workout_sets.body_part = \?`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exercise_name", "weight", "reps"}))

	svc := NewWorkoutService(db)
	if _, err := svc.GetExerciseMaxE1RM("u1", "プルオーバー", "w1", ExerciseFilter{BodyPart: "胸"}); err != nil {
		t.Fatalf("GetExerciseMaxE1RM: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the record comparison ignored the body part: %v", err)
	}
}

// "Last time" means the last time this entry was trained. Showing the chest pullover's
// numbers while logging the back one would be worse than showing nothing.
func TestLastExerciseSetsIsScopedToThePart(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(`workout_sets.body_part = \?`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "trained_on"}).
			AddRow("w9", "u1", time.Now()))
	mock.ExpectQuery(`workout_sets.body_part = \?`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "exercise_name", "weight", "reps"}))

	svc := NewWorkoutService(db)
	if _, err := svc.GetLastExerciseSets("u1", "プルオーバー", ExerciseFilter{BodyPart: "背中"}); err != nil {
		t.Fatalf("GetLastExerciseSets: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("the sets of the day were not scoped to the part: %v", err)
	}
}
