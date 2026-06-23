package routes

import (
	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

func SetupWorkoutRoutes(api huma.API, db *gorm.DB) {
	workoutSvc := services.NewWorkoutService(db)
	wh := handlers.NewWorkoutHandler(workoutSvc)

	huma.Get(api, "/api/v1/workouts", wh.ListWorkouts)
	huma.Post(api, "/api/v1/workouts", wh.CreateWorkout)
	huma.Get(api, "/api/v1/workouts/dates", wh.GetWorkoutDates)
	huma.Get(api, "/api/v1/workouts/stats", wh.GetWorkoutStats)
	huma.Get(api, "/api/v1/workouts/last-set", wh.GetLastSet)
	huma.Get(api, "/api/v1/workouts/last-exercise-sets", wh.GetLastExerciseSets)
	huma.Get(api, "/api/v1/workouts/exercise-max-e1rm", wh.GetExerciseMaxE1RM)
	huma.Get(api, "/api/v1/workouts/{workoutId}", wh.GetWorkout)
	huma.Put(api, "/api/v1/workouts/{workoutId}", wh.UpdateWorkout)
	huma.Delete(api, "/api/v1/workouts/{workoutId}", wh.DeleteWorkout)

	uploadSvc := services.NewUploadService()
	uh := handlers.NewUploadHandler(uploadSvc)
	huma.Post(api, "/api/v1/upload/presign", uh.PresignUpload)
}
