package services

import (
	"time"

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
	ID           string  `gorm:"primaryKey;type:varchar(36)"`
	WorkoutID    string  `gorm:"column:workout_id"`
	ExerciseName string  `gorm:"column:exercise_name"`
	Weight       float64
	Reps         int
	Sets         int
	Memo         string
	Spotted      bool    `gorm:"column:spotted;default:false"`
	SortOrder    int     `gorm:"column:sort_order;default:0"`
}

func (WorkoutSet) TableName() string { return "workout_sets" }

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

func (s *WorkoutService) CreateWorkout(userID string, trainedOn time.Time, memo string, sets []WorkoutSet) (*Workout, error) {
	w := &Workout{
		ID:        newUUID(),
		UserID:    userID,
		TrainedOn: trainedOn,
		Memo:      memo,
	}
	if err := s.db.Create(w).Error; err != nil {
		return nil, err
	}
	for i := range sets {
		sets[i].ID = newUUID()
		sets[i].WorkoutID = w.ID
		sets[i].SortOrder = i
	}
	if len(sets) > 0 {
		s.db.Create(&sets)
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

func (s *WorkoutService) UpdateWorkout(id, userID string, trainedOn time.Time, memo string, sets []WorkoutSet) error {
	var w Workout
	if err := s.db.Where("id = ? AND user_id = ?", id, userID).First(&w).Error; err != nil {
		return err
	}
	w.TrainedOn = trainedOn
	w.Memo = memo
	if err := s.db.Save(&w).Error; err != nil {
		return err
	}
	if err := s.db.Where("workout_id = ?", id).Delete(&WorkoutSet{}).Error; err != nil {
		return err
	}
	for i := range sets {
		sets[i].ID = newUUID()
		sets[i].WorkoutID = id
		sets[i].SortOrder = i
	}
	if len(sets) > 0 {
		s.db.Create(&sets)
	}
	return nil
}

func (s *WorkoutService) DeleteWorkout(id, userID string) error {
	return s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Workout{}).Error
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
		Order("trained_on DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var entries []WorkoutDateEntry
	for _, r := range rows {
		d := r.TrainedOn.Format("2006-01-02")
		if !seen[d] {
			seen[d] = true
			entries = append(entries, WorkoutDateEntry{Date: d, WorkoutID: r.ID})
		}
	}
	if entries == nil {
		entries = []WorkoutDateEntry{}
	}
	return entries, nil
}

func (s *WorkoutService) GetLastSet(userID, exerciseName string) (*WorkoutSet, error) {
	var ws WorkoutSet
	err := s.db.
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ?", userID, exerciseName).
		Order("workouts.trained_on DESC").
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

func (s *WorkoutService) GetExerciseMaxE1RM(userID, exerciseName, beforeWorkoutID string) (float64, error) {
	var sets []WorkoutSet
	err := s.db.
		Joins("JOIN workouts ON workouts.id = workout_sets.workout_id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ? AND workouts.id != ?",
			userID, exerciseName, beforeWorkoutID).
		Where("workout_sets.weight > 0 AND workout_sets.reps > 0").
		Find(&sets).Error
	if err != nil {
		return 0, err
	}
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
	return max, nil
}

func (s *WorkoutService) GetLastExerciseSets(userID, exerciseName string) (*LastExerciseSetsResult, error) {
	var w Workout
	err := s.db.
		Joins("JOIN workout_sets ON workout_sets.workout_id = workouts.id").
		Where("workouts.user_id = ? AND workout_sets.exercise_name = ?", userID, exerciseName).
		Order("workouts.trained_on DESC").
		First(&w).Error
	if err != nil {
		return nil, err
	}
	var sets []WorkoutSet
	if err := s.db.
		Where("workout_id = ? AND exercise_name = ?", w.ID, exerciseName).
		Order("sort_order ASC").
		Find(&sets).Error; err != nil {
		return nil, err
	}
	return &LastExerciseSetsResult{
		Date: w.TrainedOn.Format("2006-01-02"),
		Sets: sets,
	}, nil
}
