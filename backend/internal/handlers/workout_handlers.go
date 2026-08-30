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
		// Someone else's workout, or one that is already gone. Collapsing this into a 500
		// alongside real failures is what let the foreign-key error above hide as "server
		// error" instead of showing up as the bug it was.
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, huma.Error404NotFound("workout not found")
		}
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

func (h *WorkoutHandler) GetWorkoutStats(ctx context.Context, input *models.GetWorkoutStatsInput) (*models.GetWorkoutStatsOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	totalWorkouts, totalVolumeKg, err := h.svc.GetWorkoutStats(userID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get workout stats")
	}
	out := &models.GetWorkoutStatsOutput{}
	out.Body.TotalWorkouts = totalWorkouts
	out.Body.TotalVolumeKg = totalVolumeKg
	return out, nil
}

func (h *WorkoutHandler) GetExerciseMaxE1RM(ctx context.Context, input *models.GetExerciseMaxE1RMInput) (*models.GetExerciseMaxE1RMOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	maxE1RM, err := h.svc.GetExerciseMaxE1RM(userID, input.ExerciseName, input.BeforeWorkoutID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get exercise max e1rm")
	}
	out := &models.GetExerciseMaxE1RMOutput{}
	out.Body.MaxE1RM = maxE1RM
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

func (h *WorkoutHandler) GetExerciseHistory(ctx context.Context, input *models.GetExerciseHistoryInput) (*models.GetExerciseHistoryOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)

	points, hasWeightData, err := h.svc.GetExerciseHistory(userID, input.ExerciseName)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get exercise history")
	}

	out := &models.GetExerciseHistoryOutput{}
	out.Body.ExerciseName = input.ExerciseName
	out.Body.HasWeightData = hasWeightData
	out.Body.Points = make([]models.ExerciseHistoryPointItem, len(points))

	for i, p := range points {
		sets := make([]models.ExerciseHistorySetItem, len(p.Sets))
		for j, s := range p.Sets {
			sets[j] = models.ExerciseHistorySetItem{
				WorkoutID: s.WorkoutID,
				Weight:    s.Weight,
				Reps:      s.Reps,
				Sets:      s.Sets,
				Spotted:   s.Spotted,
				Memo:      s.Memo,
			}
		}
		out.Body.Points[i] = models.ExerciseHistoryPointItem{
			Date:        p.Date,
			WorkoutIDs:  p.WorkoutIDs,
			E1RM:        p.E1RM,
			MaxWeight:   p.MaxWeight,
			TotalVolume: p.TotalVolume,
			MaxReps:     p.MaxReps,
			Sets:        sets,
		}
	}
	return out, nil
}

func (h *WorkoutHandler) ListExercises(ctx context.Context, input *models.ListExercisesInput) (*models.ListExercisesOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)

	rows, err := h.svc.ListExercises(userID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list exercises")
	}

	out := &models.ListExercisesOutput{}
	out.Body.Items = make([]models.ExerciseSummaryItem, len(rows))
	for i, r := range rows {
		out.Body.Items[i] = models.ExerciseSummaryItem{
			ExerciseName:  r.ExerciseName,
			LastTrainedOn: r.LastTrainedOn,
			SessionCount:  r.SessionCount,
			BestE1RM:      r.BestE1RM,
		}
	}
	return out, nil
}
