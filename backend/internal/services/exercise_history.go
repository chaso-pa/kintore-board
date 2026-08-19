package services

import (
	"sort"
	"time"
)

// ExerciseHistorySet is one recorded set as returned to the client. It deliberately
// omits DB-only fields (row ID, exercise name) and carries WorkoutID so a day built
// from two sessions can still attribute each set.
type ExerciseHistorySet struct {
	WorkoutID string  `json:"workout_id" doc:"このセットが属するワークアウトID"`
	Weight    float64 `json:"weight"     doc:"重量(kg)。自重種目は0"`
	Reps      int     `json:"reps"       doc:"レップ数"`
	Sets      int     `json:"sets"       doc:"同一内容の反復セット数"`
	Spotted   bool    `json:"spotted"    doc:"補助あり"`
	Memo      string  `json:"memo"       doc:"セットメモ"`
}

// ExerciseHistoryPoint is one day on the chart. Multiple workouts on the same date
// collapse into a single point so the chart never shows two entries for one day.
type ExerciseHistoryPoint struct {
	Date        string               `json:"date"         doc:"YYYY-MM-DD"`
	WorkoutIDs  []string             `json:"workout_ids"  doc:"その日のワークアウトID(trained_on 昇順)"`
	E1RM        float64              `json:"e1rm"         doc:"推定1RMの最大値。重量ありのセットのみ対象"`
	MaxWeight   float64              `json:"max_weight"   doc:"最大重量。重量ありのセットのみ対象"`
	TotalVolume float64              `json:"total_volume" doc:"weight × reps × max(sets,1) の合計"`
	MaxReps     int                  `json:"max_reps"     doc:"最高レップ数。重量の有無を問わず全セット対象"`
	Sets        []ExerciseHistorySet `json:"sets"         doc:"その日の全セット"`
}

// exerciseSetRow is a flat row from a single JOIN of workouts and workout_sets,
// already filtered to one user and one exercise.
type exerciseSetRow struct {
	TrainedOn time.Time
	WorkoutID string
	Weight    float64
	Reps      int
	Sets      int
	Spotted   bool
	SortOrder int
	Memo      string
}

// effectiveSets treats a missing or zero sets count as one. The column is nullable and
// the Go field is not a pointer, so NULL arrives as 0 — multiplying by it would silently
// zero out the volume for that set.
func effectiveSets(sets int) int {
	if sets < 1 {
		return 1
	}
	return sets
}

// aggregateExerciseHistory collapses flat rows into one point per calendar day.
//
// The date key uses TrainedOn as stored (UTC), matching GetWorkoutDates so the chart and
// the calendar agree on which day a workout belongs to. Converting to JST here would fix
// the well-known off-by-one for pre-09:00 JST records but would disagree with every other
// screen, so it is intentionally not done.
//
// hasWeightData reports whether the exercise has any weighted set at all. The client uses
// it to decide between the weight-based metrics and the bodyweight rep-count fallback.
func aggregateExerciseHistory(rows []exerciseSetRow) (points []ExerciseHistoryPoint, hasWeightData bool) {
	if len(rows) == 0 {
		return []ExerciseHistoryPoint{}, false
	}

	ordered := make([]exerciseSetRow, len(rows))
	copy(ordered, rows)
	sort.SliceStable(ordered, func(i, j int) bool {
		if !ordered[i].TrainedOn.Equal(ordered[j].TrainedOn) {
			return ordered[i].TrainedOn.Before(ordered[j].TrainedOn)
		}
		return ordered[i].SortOrder < ordered[j].SortOrder
	})

	byDate := make(map[string]*ExerciseHistoryPoint)
	var dates []string

	for _, r := range ordered {
		date := r.TrainedOn.Format("2006-01-02")

		p, seen := byDate[date]
		if !seen {
			p = &ExerciseHistoryPoint{Date: date, WorkoutIDs: []string{}, Sets: []ExerciseHistorySet{}}
			byDate[date] = p
			dates = append(dates, date)
		}

		if !containsString(p.WorkoutIDs, r.WorkoutID) {
			p.WorkoutIDs = append(p.WorkoutIDs, r.WorkoutID)
		}

		p.Sets = append(p.Sets, ExerciseHistorySet{
			WorkoutID: r.WorkoutID,
			Weight:    r.Weight,
			Reps:      r.Reps,
			Sets:      r.Sets,
			Spotted:   r.Spotted,
			Memo:      r.Memo,
		})

		// Rep count is tracked for every set, including bodyweight ones — this is what
		// the fallback chart plots when the exercise has no weighted sets at all.
		if r.Reps > p.MaxReps {
			p.MaxReps = r.Reps
		}

		if r.Weight <= 0 {
			continue
		}
		hasWeightData = true

		if r.Weight > p.MaxWeight {
			p.MaxWeight = r.Weight
		}
		if e1rm, ok := EstimateOneRM(r.Weight, r.Reps); ok && e1rm > p.E1RM {
			p.E1RM = e1rm
		}
		p.TotalVolume += r.Weight * float64(r.Reps) * float64(effectiveSets(r.Sets))
	}

	sort.Strings(dates)
	points = make([]ExerciseHistoryPoint, 0, len(dates))
	for _, d := range dates {
		points = append(points, *byDate[d])
	}
	return points, hasWeightData
}

func containsString(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}

// ExerciseSummary is one row of the "by exercise" list on the record tab.
type ExerciseSummary struct {
	ExerciseName  string  `json:"exercise_name"   doc:"種目名"`
	LastTrainedOn string  `json:"last_trained_on" doc:"最終実施日 YYYY-MM-DD"`
	SessionCount  int     `json:"session_count"   doc:"この種目を含むワークアウト数"`
	BestE1RM      float64 `json:"best_e1rm"       doc:"推定1RMの自己ベスト。重量記録が無ければ0"`
}

const exerciseHistorySelect = `
	workouts.trained_on        AS trained_on,
	workout_sets.workout_id    AS workout_id,
	workout_sets.weight        AS weight,
	workout_sets.reps          AS reps,
	workout_sets.sets          AS sets,
	workout_sets.spotted       AS spotted,
	workout_sets.sort_order    AS sort_order,
	workout_sets.memo          AS memo`

// GetExerciseHistory returns every recorded day for one exercise, newest last.
// The whole history is returned in one response: the client filters by period locally so
// switching the range never triggers a refetch.
func (s *WorkoutService) GetExerciseHistory(userID, exerciseName string) ([]ExerciseHistoryPoint, bool, error) {
	var rows []exerciseSetRow

	err := s.db.Model(&WorkoutSet{}).
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ?", userID, exerciseName).
		Select(exerciseHistorySelect).
		Scan(&rows).Error
	if err != nil {
		return nil, false, err
	}

	points, hasWeightData := aggregateExerciseHistory(rows)
	return points, hasWeightData, nil
}

// ListExercises summarises every exercise the user has recorded.
//
// The best e1RM is computed in Go rather than SQL: the Brzycki denominator depends on the
// rep count, so the maximum estimate is not the row with MAX(weight) and cannot be
// expressed as a plain aggregate.
func (s *WorkoutService) ListExercises(userID string) ([]ExerciseSummary, error) {
	var rows []struct {
		ExerciseName string
		TrainedOn    time.Time
		WorkoutID    string
		Weight       float64
		Reps         int
	}

	err := s.db.Model(&WorkoutSet{}).
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ?", userID).
		Select(`workout_sets.exercise_name AS exercise_name,
			workouts.trained_on          AS trained_on,
			workout_sets.workout_id      AS workout_id,
			workout_sets.weight          AS weight,
			workout_sets.reps            AS reps`).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	type acc struct {
		summary  *ExerciseSummary
		lastTime time.Time
		workouts map[string]struct{}
	}

	byName := make(map[string]*acc)
	var names []string

	for _, r := range rows {
		a, seen := byName[r.ExerciseName]
		if !seen {
			a = &acc{
				summary:  &ExerciseSummary{ExerciseName: r.ExerciseName},
				workouts: make(map[string]struct{}),
			}
			byName[r.ExerciseName] = a
			names = append(names, r.ExerciseName)
		}

		a.workouts[r.WorkoutID] = struct{}{}
		if r.TrainedOn.After(a.lastTime) {
			a.lastTime = r.TrainedOn
			a.summary.LastTrainedOn = r.TrainedOn.Format("2006-01-02")
		}
		if e1rm, ok := EstimateOneRM(r.Weight, r.Reps); ok && e1rm > a.summary.BestE1RM {
			a.summary.BestE1RM = e1rm
		}
	}

	out := make([]ExerciseSummary, 0, len(names))
	for _, n := range names {
		a := byName[n]
		a.summary.SessionCount = len(a.workouts)
		out = append(out, *a.summary)
	}

	// Most recently trained first — the record tab lists what the user is actually doing.
	sort.SliceStable(out, func(i, j int) bool {
		return byName[out[i].ExerciseName].lastTime.After(byName[out[j].ExerciseName].lastTime)
	})
	return out, nil
}
