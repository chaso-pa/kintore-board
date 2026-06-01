package handlers

import (
	"context"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
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
		sets[i] = services.WorkoutSet{ExerciseName: s.ExerciseName, Weight: s.Weight, Reps: s.Reps, Sets: s.Sets, Memo: s.Memo}
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
	w, err := h.svc.GetWorkout(input.WorkoutID, userID)
	if err != nil {
		return nil, huma.Error404NotFound("workout not found")
	}
	out := &models.GetWorkoutOutput{}
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
