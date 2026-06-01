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
	}
	if len(sets) > 0 {
		s.db.Create(&sets)
	}
	return w, nil
}

func (s *WorkoutService) GetWorkout(id, userID string) (*Workout, error) {
	var w Workout
	if err := s.db.Where("id = ? AND user_id = ?", id, userID).First(&w).Error; err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *WorkoutService) DeleteWorkout(id, userID string) error {
	return s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Workout{}).Error
}
