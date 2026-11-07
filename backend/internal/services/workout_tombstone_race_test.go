//go:build integration

package services

import (
	"errors"
	"sync"
	"testing"
	"time"
)

// A DELETE and a create for the same id, racing. sqlmock cannot show this: the guarantee
// comes from InnoDB's locks (the FOR UPDATE / FOR SHARE reads and the next-key locks they
// take on a missing row), so it is checked against a real MySQL.
//
// Whatever the interleaving, once both have finished the workout must not exist and the
// tombstone must. The create either committed first and was removed by the delete, or saw
// the tombstone and was refused with ErrWorkoutDeleted. A deadlock or lock wait timeout
// aborts one side; the device retries those (the handler answers 503), and so does this.
func TestDeleteAndCreateRaceNeverLeavesTheWorkout(t *testing.T) {
	db := openIntegrationDB(t)
	const user = "it-race-u1"
	resetIntegrationUsers(t, db, user)
	svc := NewWorkoutService(db)

	retry := func(f func() error) error {
		for {
			err := f()
			if !IsLockContention(err) {
				return err
			}
			time.Sleep(time.Millisecond)
		}
	}

	const rounds = 200
	var contention int
	for i := 0; i < rounds; i++ {
		id := newUUID()
		var wg sync.WaitGroup
		var createErr, deleteErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			createErr = retry(func() error {
				_, err := svc.CreateWorkout(id, user, time.Now(), "", oneSet())
				if IsLockContention(err) {
					contention++
				}
				return err
			})
		}()
		go func() {
			defer wg.Done()
			deleteErr = retry(func() error { return svc.DeleteWorkout(id, user) })
		}()
		wg.Wait()

		if deleteErr != nil {
			t.Fatalf("round %d: delete: %v", i, deleteErr)
		}
		if createErr != nil && !errors.Is(createErr, ErrWorkoutDeleted) {
			t.Fatalf("round %d: create: %v", i, createErr)
		}
		var workouts, sets, tombstones int64
		db.Raw("SELECT COUNT(*) FROM workouts WHERE id = ?", id).Scan(&workouts)
		db.Raw("SELECT COUNT(*) FROM workout_sets WHERE workout_id = ?", id).Scan(&sets)
		db.Raw("SELECT COUNT(*) FROM deleted_workouts WHERE id = ? AND user_id = ?", id, user).Scan(&tombstones)
		if workouts != 0 || sets != 0 || tombstones != 1 {
			t.Fatalf("round %d (create err %v): workouts=%d sets=%d tombstones=%d, want 0/0/1",
				i, createErr, workouts, sets, tombstones)
		}

		// And it stays deleted: a late retry of the create is refused.
		if _, err := svc.CreateWorkout(id, user, time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutDeleted) {
			t.Fatalf("round %d: late create got %v, want ErrWorkoutDeleted", i, err)
		}
		if err := svc.UpdateWorkout(id, user, time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutDeleted) {
			t.Fatalf("round %d: late update got %v, want ErrWorkoutDeleted", i, err)
		}
	}
	t.Logf("%d rounds, %d create attempts aborted by lock contention and retried", rounds, contention)
}

// Delete is idempotent end to end, and someone else's id is left alone.
func TestDeleteWorkoutAgainstMySQL(t *testing.T) {
	db := openIntegrationDB(t)
	const owner, intruder = "it-del-owner", "it-del-intruder"
	resetIntegrationUsers(t, db, owner, intruder)
	svc := NewWorkoutService(db)

	id := newUUID()
	if _, err := svc.CreateWorkout(id, owner, time.Now(), "", oneSet()); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteWorkout(id, intruder); err != nil {
		t.Fatalf("intruder delete: %v", err)
	}
	var n int64
	db.Raw("SELECT COUNT(*) FROM workouts WHERE id = ?", id).Scan(&n)
	if n != 1 {
		t.Fatal("another user's delete removed the workout")
	}
	db.Raw("SELECT COUNT(*) FROM deleted_workouts WHERE id = ?", id).Scan(&n)
	if n != 0 {
		t.Fatal("another user's delete left a tombstone")
	}
	for i := 0; i < 2; i++ {
		if err := svc.DeleteWorkout(id, owner); err != nil {
			t.Fatalf("delete #%d: %v", i+1, err)
		}
	}
	if _, err := svc.CreateWorkout(id, intruder, time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutIDTaken) {
		t.Fatalf("intruder create on owner's tombstone: got %v, want ErrWorkoutIDTaken", err)
	}
	// Never-created id.
	ghost := newUUID()
	if err := svc.DeleteWorkout(ghost, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateWorkout(ghost, owner, time.Now(), "", oneSet()); !errors.Is(err, ErrWorkoutDeleted) {
		t.Fatalf("create after delete of an unseen id: got %v, want ErrWorkoutDeleted", err)
	}
}

// Paging the export with ties across page boundaries returns every workout exactly once.
func TestExportWorkoutsAgainstMySQL(t *testing.T) {
	db := openIntegrationDB(t)
	const user, other = "it-export-u1", "it-export-u2"
	resetIntegrationUsers(t, db, user, other)
	svc := NewWorkoutService(db)

	at := time.Date(2026, 8, 20, 10, 0, 0, 123_000_000, time.UTC)
	want := map[string]bool{}
	for i := 0; i < 7; i++ {
		id := newUUID()
		ts := at
		if i >= 4 {
			ts = at.Add(-time.Hour)
		}
		if _, err := svc.CreateWorkout(id, user, ts, "", oneSet()); err != nil {
			t.Fatal(err)
		}
		want[id] = true
	}
	gone := newUUID()
	if _, err := svc.CreateWorkout(gone, user, at, "", oneSet()); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteWorkout(gone, user); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateWorkout(newUUID(), other, at, "", oneSet()); err != nil {
		t.Fatal(err)
	}

	seen := map[string]bool{}
	cursor := ""
	for pages := 0; ; pages++ {
		rows, next, err := svc.ExportWorkouts(user, cursor, 3)
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range rows {
			if seen[r.ID] {
				t.Fatalf("%s exported twice", r.ID)
			}
			if !want[r.ID] {
				t.Fatalf("%s is not one of the user's live workouts", r.ID)
			}
			if len(r.Sets) != 1 || r.Sets[0].Weight == nil || *r.Sets[0].Weight != 60 {
				t.Fatalf("%s sets = %+v", r.ID, r.Sets)
			}
			seen[r.ID] = true
		}
		if next == "" {
			break
		}
		cursor = next
		if pages > 10 {
			t.Fatal("export did not terminate")
		}
	}
	if len(seen) != len(want) {
		t.Fatalf("exported %d workouts, want %d", len(seen), len(want))
	}
}
