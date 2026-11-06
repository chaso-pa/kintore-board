package services

import (
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

type Workout struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `gorm:"column:user_id"`
	TrainedOn time.Time `gorm:"column:trained_on"`
	Memo      string
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (Workout) TableName() string { return "workouts" }

type WorkoutSet struct {
	ID           string `gorm:"primaryKey;type:varchar(36)"`
	WorkoutID    string `gorm:"column:workout_id"`
	ExerciseName string `gorm:"column:exercise_name"`
	Weight       float64
	Reps         int
	Sets         int
	Memo         string
	Spotted      bool `gorm:"column:spotted;default:false"`
	SortOrder    int  `gorm:"column:sort_order;default:0"`
	// Empty for every row written before the column existed. The server cannot fill it in —
	// custom exercises and custom parts live only on the device that made them — so it stays
	// empty until that device classifies it. See ClassifyExercises.
	BodyPart string `gorm:"column:body_part"`
}

func (WorkoutSet) TableName() string { return "workout_sets" }

// DeletedWorkout is the tombstone of a workout id its owner deleted. See DeleteWorkout.
type DeletedWorkout struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `gorm:"column:user_id"`
	DeletedAt time.Time `gorm:"column:deleted_at"`
}

func (DeletedWorkout) TableName() string { return "deleted_workouts" }

type WorkoutService struct {
	db *gorm.DB
}

func NewWorkoutService(db *gorm.DB) *WorkoutService {
	return &WorkoutService{db: db}
}

func (s *WorkoutService) ListWorkouts(userID, cursor string, limit int) ([]Workout, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := s.db.Where("user_id = ?", userID).Order("trained_on DESC").Limit(limit + 1)
	if cursor != "" {
		q = q.Where("trained_on < ?", cursor)
	}
	var rows []Workout
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		next = rows[limit-1].TrainedOn.Format(time.RFC3339Nano)
		rows = rows[:limit]
	}
	return rows, next, nil
}

// ErrWorkoutIDTaken is returned when a client-chosen id already belongs to another user.
var ErrWorkoutIDTaken = errors.New("workout id is taken")

// ErrWorkoutDeleted is returned when a create or update names a workout its owner already
// deleted. The device treats it as success: the record is gone, which is what it wanted.
var ErrWorkoutDeleted = errors.New("workout was deleted")

// IsLockContention reports whether err is a MySQL deadlock (1213) or lock wait timeout
// (1205). DeleteWorkout and the tombstone check in CreateWorkout/UpdateWorkout lock the
// same rows in opposite orders when they race on one id, and InnoDB resolves that by
// aborting one side. Every one of these writes is idempotent, so the caller answers 503 and
// the device retries.
func IsLockContention(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && (me.Number == 1213 || me.Number == 1205)
}

// checkTombstone refuses a write to an id that has been deleted.
//
// FOR SHARE, not a plain read: under REPEATABLE READ (the InnoDB default, which this relies
// on) a locking read takes a next-key lock even when no row matches, so a DELETE that is
// about to insert this tombstone waits for the write to commit — or the two deadlock and
// one is retried. Either way they serialize: a committed DELETE is always seen by the next
// write, and a write that committed first is removed by the DELETE.
func checkTombstone(tx *gorm.DB, id, userID string) error {
	var row struct{ UserID string }
	res := tx.Raw("SELECT user_id FROM deleted_workouts WHERE id = ? FOR SHARE", id).Scan(&row)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil
	}
	if row.UserID == userID {
		return ErrWorkoutDeleted
	}
	return ErrWorkoutIDTaken
}

// CreateWorkout writes a new workout, or — when the client supplies an id it has already
// used — updates the one it made before.
//
// The id is how a retried create stays a single record. Autosave sends the first write as a
// create, and on a gym's connection that request can succeed here while the client times
// out waiting for the reply. The client then has no id to update, so its next write was a
// second create, and the day ended up holding two workouts. The calendar opens only one of
// them, picked by id, which is random — so half the time it opened the early copy holding
// little or nothing, and the record looked as though it had not been saved at all.
//
// Everything happens in one transaction. The workout row used to be committed on its own
// before the sets, so a failed set insert left an empty workout behind for the client's
// retry to duplicate.
func (s *WorkoutService) CreateWorkout(id, userID string, trainedOn time.Time, memo string, sets []WorkoutSet) (*Workout, error) {
	var w *Workout
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if id != "" {
			if err := checkTombstone(tx, id, userID); err != nil {
				return err
			}
			var existing Workout
			err := tx.Where("id = ?", id).First(&existing).Error
			if err == nil {
				if existing.UserID != userID {
					return ErrWorkoutIDTaken
				}
				w = &existing
				return writeWorkout(tx, w, trainedOn, memo, sets)
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		} else {
			id = newUUID()
		}
		w = &Workout{ID: id, UserID: userID, TrainedOn: trainedOn, Memo: memo}
		if err := tx.Create(w).Error; err != nil {
			return err
		}
		return replaceSets(tx, w.ID, sets)
	})
	if err != nil {
		return nil, err
	}
	return w, nil
}

func (s *WorkoutService) GetWorkout(id, userID string) (*Workout, []WorkoutSet, error) {
	var w Workout
	if err := s.db.Where("id = ? AND user_id = ?", id, userID).First(&w).Error; err != nil {
		return nil, nil, err
	}
	var sets []WorkoutSet
	s.db.Where("workout_id = ?", id).Order("sort_order ASC").Find(&sets)
	return &w, sets, nil
}

// UpdateWorkout replaces a workout's fields and sets in one transaction.
//
// The old sets are deleted before the new ones are written, so outside a transaction a
// failed insert committed the delete on its own and left the workout empty.
func (s *WorkoutService) UpdateWorkout(id, userID string, trainedOn time.Time, memo string, sets []WorkoutSet) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := checkTombstone(tx, id, userID); err != nil {
			return err
		}
		var w Workout
		if err := tx.Where("id = ? AND user_id = ?", id, userID).First(&w).Error; err != nil {
			return err
		}
		return writeWorkout(tx, &w, trainedOn, memo, sets)
	})
}

func writeWorkout(tx *gorm.DB, w *Workout, trainedOn time.Time, memo string, sets []WorkoutSet) error {
	w.TrainedOn = trainedOn
	w.Memo = memo
	if err := tx.Save(w).Error; err != nil {
		return err
	}
	if err := tx.Where("workout_id = ?", w.ID).Delete(&WorkoutSet{}).Error; err != nil {
		return err
	}
	return replaceSets(tx, w.ID, sets)
}

func replaceSets(tx *gorm.DB, workoutID string, sets []WorkoutSet) error {
	for i := range sets {
		sets[i].ID = newUUID()
		sets[i].WorkoutID = workoutID
		sets[i].SortOrder = i
	}
	if len(sets) == 0 {
		return nil
	}
	return tx.Create(&sets).Error
}

// ExerciseBodyPart is one device's answer for what an exercise name belongs to.
type ExerciseBodyPart struct {
	ExerciseName string
	BodyPart     string
}

// ClassifyExercises fills in body_part for the caller's own unclassified sets.
//
// The server has no way to work this out. It holds no map from an exercise name to a body
// part: the preset list ships inside the app, and anything the user invented — the exercise
// or the part — exists only in a file on their phone. So the phone sends what it knows and
// the rows it owns are updated to match.
//
// Only rows with no body part yet are touched. A row that already carries one was written
// by a client that knew the answer at the time, and a later reclassification of the name
// must not rewrite history that was recorded deliberately.
//
// Returns the number of rows filled in.
func (s *WorkoutService) ClassifyExercises(userID string, mappings []ExerciseBodyPart) (int64, error) {
	var total int64
	for _, m := range mappings {
		name := strings.TrimSpace(m.ExerciseName)
		part := strings.TrimSpace(m.BodyPart)
		if name == "" || part == "" {
			continue
		}
		res := s.db.Model(&WorkoutSet{}).
			Where("exercise_name = ?", name).
			Where("body_part IS NULL OR body_part = ''").
			// Scoped through the parent row: workout_sets carries no user_id of its own, and
			// without this a client could classify — and so silently rewrite — other people's
			// records.
			Where("workout_id IN (?)", s.db.Model(&Workout{}).Select("id").Where("user_id = ?", userID)).
			Update("body_part", part)
		if res.Error != nil {
			return total, res.Error
		}
		total += res.RowsAffected
	}
	return total, nil
}

// UnclassifiedExerciseNames lists the caller's exercise names that still have no body part,
// so the app knows which ones to look up in its own catalog and send back.
func (s *WorkoutService) UnclassifiedExerciseNames(userID string) ([]string, error) {
	var names []string
	err := s.db.Model(&WorkoutSet{}).
		Distinct("workout_sets.exercise_name").
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ?", userID).
		Where("workout_sets.body_part IS NULL OR workout_sets.body_part = ''").
		Pluck("workout_sets.exercise_name", &names).Error
	if err != nil {
		return nil, err
	}
	if names == nil {
		names = []string{}
	}
	return names, nil
}

// DeleteWorkout removes a workout and leaves a tombstone for its id. It always succeeds
// unless the database fails, so a device can retry it until it gets an answer:
//
//   - the caller's workout: tombstoned, then its sets and the row removed
//   - an id the server never saw: tombstoned only. The device may delete a record before
//     its first upload went through, and that upload may still be in flight
//   - already deleted: nothing new (INSERT IGNORE)
//   - someone else's workout: nothing at all, and the same success — an id is not a
//     credential, and a different answer would tell the caller the id exists
//
// The tombstone is written first so that a create racing this delete either sees it or is
// already committed and is removed here. See checkTombstone for the locking.
//
// The sets go before the row. workout_sets.workout_id is a foreign key with no cascade, so
// deleting the parent on its own fails with error 1451 once the workout has any set.
func (s *WorkoutService) DeleteWorkout(id, userID string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var row struct{ UserID string }
		res := tx.Raw("SELECT user_id FROM workouts WHERE id = ? FOR UPDATE", id).Scan(&row)
		if res.Error != nil {
			return res.Error
		}
		exists := res.RowsAffected > 0
		if exists && row.UserID != userID {
			return nil
		}
		if err := tx.Exec("INSERT IGNORE INTO deleted_workouts (id, user_id) VALUES (?, ?)", id, userID).Error; err != nil {
			return err
		}
		if !exists {
			return nil
		}
		if err := tx.Exec("DELETE FROM workout_sets WHERE workout_id = ?", id).Error; err != nil {
			return err
		}
		return tx.Exec("DELETE FROM workouts WHERE id = ? AND user_id = ?", id, userID).Error
	})
}

type WorkoutDateEntry struct {
	Date      string
	WorkoutID string
}

func (s *WorkoutService) GetWorkoutDates(userID string, year, month int) ([]WorkoutDateEntry, error) {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0)
	var rows []Workout
	if err := s.db.
		Where("user_id = ? AND trained_on >= ? AND trained_on < ?", userID, start, end).
		// id breaks ties. Only one workout per day is reachable from the calendar, and with
		// trained_on alone two records on the same day could come back in either order, so
		// which one the calendar opened changed between requests — edits made in the other
		// looked like they had been reverted.
		Order("trained_on DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return pickWorkoutDates(rows), nil
}

// pickWorkoutDates keeps the first workout of each calendar day. rows must already be in
// (trained_on DESC, id DESC) order, so a day holding two workouts keeps the later one, and
// of two with the same timestamp the greater id.
func pickWorkoutDates(rows []Workout) []WorkoutDateEntry {
	seen := map[string]bool{}
	entries := []WorkoutDateEntry{}
	for _, r := range rows {
		d := r.TrainedOn.Format("2006-01-02")
		if !seen[d] {
			seen[d] = true
			entries = append(entries, WorkoutDateEntry{Date: d, WorkoutID: r.ID})
		}
	}
	return entries
}

func (s *WorkoutService) GetLastSet(userID, exerciseName string, f ExerciseFilter) (*WorkoutSet, error) {
	var ws WorkoutSet
	q := s.db.
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ?", userID, exerciseName)
	err := scopeToPart(q, f).
		// id breaks ties between two workouts with the same timestamp, which a day recorded
		// twice can hold; without it the answer depended on the storage engine.
		Order("workouts.trained_on DESC, workouts.id DESC").
		First(&ws).Error
	if err != nil {
		return nil, err
	}
	return &ws, nil
}

type LastExerciseSetsResult struct {
	Date string
	Sets []WorkoutSet
}

func (s *WorkoutService) GetWorkoutStats(userID string) (int64, float64, error) {
	var totalWorkouts int64
	if err := s.db.Model(&Workout{}).Where("user_id = ?", userID).Count(&totalWorkouts).Error; err != nil {
		return 0, 0, err
	}
	var result struct {
		TotalVolume float64
	}
	if err := s.db.Model(&WorkoutSet{}).
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ?", userID).
		Select("COALESCE(SUM(workout_sets.weight * workout_sets.reps * GREATEST(COALESCE(workout_sets.sets, 1), 1)), 0) AS total_volume").
		Scan(&result).Error; err != nil {
		return 0, 0, err
	}
	return totalWorkouts, result.TotalVolume, nil
}

// A personal record belongs to one entry in the picker, so the comparison is scoped the same
// way the history is. Without this, beating a pullover done as back work would be reported
// as a record on the chest one.
func (s *WorkoutService) GetExerciseMaxE1RM(userID, exerciseName, beforeWorkoutID string, f ExerciseFilter) (float64, error) {
	var sets []WorkoutSet
	q := s.db.
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ? AND workouts.id != ?",
			userID, exerciseName, beforeWorkoutID).
		Where("workout_sets.weight > 0 AND workout_sets.reps > 0")
	err := scopeToPart(q, f).Find(&sets).Error
	if err != nil {
		return 0, err
	}
	return maxE1RM(sets), nil
}

// maxE1RM is the best estimate over sets, 0 when none of them can be estimated.
func maxE1RM(sets []WorkoutSet) float64 {
	max := 0.0
	for _, ws := range sets {
		e1rm, ok := EstimateOneRM(ws.Weight, ws.Reps)
		if !ok {
			continue
		}
		if e1rm > max {
			max = e1rm
		}
	}
	return max
}

// "Last time" means the last time this entry was trained. Showing the chest pullover's
// numbers while logging the back one would be worse than showing nothing.
func (s *WorkoutService) GetLastExerciseSets(userID, exerciseName string, f ExerciseFilter) (*LastExerciseSetsResult, error) {
	var w Workout
	q := s.db.
		Joins("JOIN workout_sets ON workout_sets.workout_id = workouts.id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ?", userID, exerciseName)
	err := scopeToPart(q, f).
		// Same tie-break as GetWorkoutDates: of two workouts sharing a timestamp, the greater
		// id is "last time", so the device can compute the same answer.
		Order("workouts.trained_on DESC, workouts.id DESC").
		First(&w).Error
	if err != nil {
		return nil, err
	}
	var sets []WorkoutSet
	inner := s.db.
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workout_sets.workout_id = ? AND workout_sets.exercise_name = ?", w.ID, exerciseName)
	if err := scopeToPart(inner, f).
		// Rows written before sort_order existed all hold 0, so the set id settles their order.
		Order("workout_sets.sort_order ASC, workout_sets.id ASC").
		Find(&sets).Error; err != nil {
		return nil, err
	}
	return &LastExerciseSetsResult{
		Date: w.TrainedOn.Format("2006-01-02"),
		Sets: sets,
	}, nil
}

// ExportedSet is a set exactly as stored. The nullable columns stay pointers: the device
// keeps NULL as NULL and applies the same rules the server's aggregates do, and turning
// them into 0 or "" here would make an import differ from what the server computes from.
type ExportedSet struct {
	ID           string
	WorkoutID    string
	ExerciseName string
	Weight       *float64
	Reps         *int
	Sets         *int
	Memo         *string
	Spotted      bool
	BodyPart     *string
	SortOrder    int
}

type ExportedWorkout struct {
	ID        string
	TrainedOn time.Time
	Memo      *string
	CreatedAt time.Time
	Sets      []ExportedSet
}

// ErrInvalidCursor is returned for an export cursor this server did not produce.
var ErrInvalidCursor = errors.New("invalid cursor")

const (
	exportDefaultLimit = 200
	exportMaxLimit     = 500
	// Millisecond precision with an explicit offset: trained_on is DATETIME(3), so this
	// round-trips exactly, and a cursor never depends on the server's time zone.
	exportCursorTimeLayout = "2006-01-02T15:04:05.000Z07:00"
)

func encodeExportCursor(trainedOn time.Time, id string) string {
	raw := trainedOn.UTC().Format(exportCursorTimeLayout) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeExportCursor(cursor string) (time.Time, string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", ErrInvalidCursor
	}
	ts, id, ok := strings.Cut(string(raw), "|")
	if !ok || id == "" {
		return time.Time{}, "", ErrInvalidCursor
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return time.Time{}, "", ErrInvalidCursor
	}
	// The driver converts a time argument to the connection's loc before sending it, so an
	// instant in UTC compares correctly whatever loc the DSN names.
	return t.UTC(), id, nil
}

// ExportWorkouts pages through every workout the user has, sets included, newest first.
//
// This is what a device imports from when it has no local copy yet. Newest first, so a
// partial import is complete for every day after the oldest one it has reached; keyed on
// (trained_on, id) rather than trained_on alone, so two workouts sharing a timestamp across
// a page boundary are neither skipped nor repeated.
//
// Deleted workouts are not returned: their rows are gone. Their ids live on only in
// deleted_workouts, which the device has its own copy of.
func (s *WorkoutService) ExportWorkouts(userID, cursor string, limit int) ([]ExportedWorkout, string, error) {
	if limit <= 0 {
		limit = exportDefaultLimit
	}
	if limit > exportMaxLimit {
		limit = exportMaxLimit
	}

	q := s.db.Model(&Workout{}).
		Select("id, trained_on, memo, created_at").
		Where("user_id = ?", userID)
	if cursor != "" {
		t, id, err := decodeExportCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		// GORM parenthesises a condition containing OR, so this cannot widen the user_id
		// predicate; workout_export_test.go pins the rendered SQL.
		q = q.Where("trained_on < ? OR (trained_on = ? AND id < ?)", t, t, id)
	}
	// Scanned into a struct without the Sets slice: GORM would read that field as a
	// relation and refuse the struct for want of a foreign key.
	var heads []struct {
		ID        string
		TrainedOn time.Time
		Memo      *string
		CreatedAt time.Time
	}
	if err := q.Order("trained_on DESC, id DESC").Limit(limit + 1).Scan(&heads).Error; err != nil {
		return nil, "", err
	}

	next := ""
	if len(heads) > limit {
		heads = heads[:limit]
		last := heads[limit-1]
		next = encodeExportCursor(last.TrainedOn, last.ID)
	}
	if len(heads) == 0 {
		return []ExportedWorkout{}, "", nil
	}

	rows := make([]ExportedWorkout, len(heads))
	ids := make([]string, len(heads))
	index := make(map[string]int, len(heads))
	for i, h := range heads {
		rows[i] = ExportedWorkout{ID: h.ID, TrainedOn: h.TrainedOn.UTC(), Memo: h.Memo, CreatedAt: h.CreatedAt.UTC(), Sets: []ExportedSet{}}
		ids[i] = h.ID
		index[h.ID] = i
	}
	var sets []ExportedSet
	if err := s.db.Model(&WorkoutSet{}).
		Select("id, workout_id, exercise_name, weight, reps, sets, memo, spotted, body_part, sort_order").
		Where("workout_id IN ?", ids).
		Order("workout_id, sort_order").
		Scan(&sets).Error; err != nil {
		return nil, "", err
	}
	for _, st := range sets {
		if i, ok := index[st.WorkoutID]; ok {
			rows[i].Sets = append(rows[i].Sets, st)
		}
	}
	return rows, next, nil
}
