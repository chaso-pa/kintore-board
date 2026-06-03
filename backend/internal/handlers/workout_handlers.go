package handlers

import (
	"context"
	"errors"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

type WorkoutHandler struct {
	svc *services.WorkoutService
}

func NewWorkoutHandler(svc *services.WorkoutService) *WorkoutHandler {
	return &WorkoutHandler{svc: svc}
}

func (h *WorkoutHandler) ListWorkouts(ctx context.Context, input *models.ListWorkoutsInput) (*models.ListWorkoutsOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	rows, next, err := h.svc.ListWorkouts(userID, input.Cursor, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list workouts")
	}
	items := make([]models.WorkoutItem, len(rows))
	for i, r := range rows {
		items[i] = models.WorkoutItem{ID: r.ID, TrainedOn: r.TrainedOn, Memo: r.Memo, CreatedAt: r.CreatedAt}
	}
	out := &models.ListWorkoutsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *WorkoutHandler) CreateWorkout(ctx context.Context, input *models.CreateWorkoutInput) (*models.CreateWorkoutOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	sets := make([]services.WorkoutSet, len(input.Body.Sets))
	for i, s := range input.Body.Sets {
		sets[i] = services.WorkoutSet{ExerciseName: s.ExerciseName, Weight: s.Weight, Reps: s.Reps, Sets: s.Sets, Memo: s.Memo, Spotted: s.Spotted}
	}
	w, err := h.svc.CreateWorkout(userID, input.Body.TrainedOn, input.Body.Memo, sets)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create workout")
	}
	out := &models.CreateWorkoutOutput{}
	out.Body = models.WorkoutItem{ID: w.ID, TrainedOn: w.TrainedOn, Memo: w.Memo, CreatedAt: w.CreatedAt}
	return out, nil
}

func (h *WorkoutHandler) GetWorkout(ctx context.Context, input *models.GetWorkoutInput) (*models.GetWorkoutOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	w, sets, err := h.svc.GetWorkout(input.WorkoutID, userID)
	if err != nil {
		return nil, huma.Error404NotFound("workout not found")
	}
	setItems := make([]models.WorkoutSetItem, len(sets))
	for i, s := range sets {
		setItems[i] = models.WorkoutSetItem{
			ID: s.ID, ExerciseName: s.ExerciseName,
			Weight: s.Weight, Reps: s.Reps, Sets: s.Sets, Memo: s.Memo, Spotted: s.Spotted,
		}
	}
	out := &models.GetWorkoutOutput{}
	out.Body = models.WorkoutDetailItem{
		ID: w.ID, TrainedOn: w.TrainedOn, Memo: w.Memo, CreatedAt: w.CreatedAt,
		Sets: setItems,
	}
	return out, nil
}

func (h *WorkoutHandler) UpdateWorkout(ctx context.Context, input *models.UpdateWorkoutInput) (*models.UpdateWorkoutOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	sets := make([]services.WorkoutSet, len(input.Body.Sets))
	for i, s := range input.Body.Sets {
		sets[i] = services.WorkoutSet{ExerciseName: s.ExerciseName, Weight: s.Weight, Reps: s.Reps, Sets: s.Sets, Memo: s.Memo, Spotted: s.Spotted}
	}
	if err := h.svc.UpdateWorkout(input.WorkoutID, userID, input.Body.TrainedOn, input.Body.Memo, sets); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, huma.Error404NotFound("workout not found")
		}
		return nil, huma.Error500InternalServerError("failed to update workout")
	}
	w, _, err := h.svc.GetWorkout(input.WorkoutID, userID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to fetch updated workout")
	}
	out := &models.UpdateWorkoutOutput{}
	out.Body = models.WorkoutItem{ID: w.ID, TrainedOn: w.TrainedOn, Memo: w.Memo, CreatedAt: w.CreatedAt}
	return out, nil
}

func (h *WorkoutHandler) DeleteWorkout(ctx context.Context, input *models.DeleteWorkoutInput) (*models.DeleteWorkoutOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	if err := h.svc.DeleteWorkout(input.WorkoutID, userID); err != nil {
		return nil, huma.Error500InternalServerError("failed to delete workout")
	}
	return &models.DeleteWorkoutOutput{}, nil
}

func (h *WorkoutHandler) GetWorkoutDates(ctx context.Context, input *models.GetWorkoutDatesInput) (*models.GetWorkoutDatesOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	entries, err := h.svc.GetWorkoutDates(userID, input.Year, input.Month)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get workout dates")
	}
	out := &models.GetWorkoutDatesOutput{}
	out.Body.Workouts = make([]models.WorkoutDateEntry, len(entries))
	for i, e := range entries {
		out.Body.Workouts[i] = models.WorkoutDateEntry{Date: e.Date, WorkoutID: e.WorkoutID}
	}
	return out, nil
}

func (h *WorkoutHandler) GetLastExerciseSets(ctx context.Context, input *models.GetLastExerciseSetsInput) (*models.GetLastExerciseSetsOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	result, err := h.svc.GetLastExerciseSets(userID, input.ExerciseName)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, huma.Error404NotFound("no previous workout found")
		}
		return nil, huma.Error500InternalServerError("failed to get last exercise sets")
	}
	out := &models.GetLastExerciseSetsOutput{}
	out.Body.Date = result.Date
	out.Body.Sets = make([]models.LastExerciseSetItem, len(result.Sets))
	for i, s := range result.Sets {
		out.Body.Sets[i] = models.LastExerciseSetItem{Weight: s.Weight, Reps: s.Reps}
	}
	return out, nil
}

func (h *WorkoutHandler) GetLastSet(ctx context.Context, input *models.GetLastSetInput) (*models.GetLastSetOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	ws, err := h.svc.GetLastSet(userID, input.ExerciseName)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, huma.Error404NotFound("no previous set found")
		}
		return nil, huma.Error500InternalServerError("failed to get last set")
	}
	out := &models.GetLastSetOutput{}
	out.Body.Weight = ws.Weight
	out.Body.Reps = ws.Reps
	return out, nil
}

type UploadHandler struct {
	svc *services.UploadService
}

func NewUploadHandler(svc *services.UploadService) *UploadHandler {
	return &UploadHandler{svc: svc}
}

func (h *UploadHandler) PresignUpload(ctx context.Context, input *models.PresignUploadInput) (*models.PresignUploadOutput, error) {
	uploadURL, publicURL, err := h.svc.PresignUpload(input.Body.Filename, input.Body.ContentType)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to generate presigned URL")
	}
	out := &models.PresignUploadOutput{}
	out.Body.UploadURL = uploadURL
	out.Body.PublicURL = publicURL
	return out, nil
}
