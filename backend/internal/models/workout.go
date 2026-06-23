package models

import "time"

type CreateWorkoutInput struct {
	Body struct {
		TrainedOn time.Time `json:"trained_on"          doc:"Training date"`
		Memo      string    `json:"memo"                doc:"Memo"`
		Sets      []struct {
			ExerciseName string  `json:"exercise_name" minLength:"1" doc:"Exercise name"`
			Weight       float64 `json:"weight"                      doc:"Weight (kg)"`
			Reps         int     `json:"reps"                        doc:"Repetitions"`
			Sets         int     `json:"sets"                        doc:"Sets"`
			Memo         string  `json:"memo"                        doc:"Set memo"`
			Spotted      bool    `json:"spotted"                     doc:"Spotted (assisted)"`
		} `json:"sets"`
	}
}

type WorkoutItem struct {
	ID        string    `json:"id"`
	TrainedOn time.Time `json:"trained_on"`
	Memo      string    `json:"memo,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type ListWorkoutsInput struct {
	Cursor string `query:"cursor" doc:"Pagination cursor"`
	Limit  int    `query:"limit"  default:"20"    doc:"Items per page"`
}

type ListWorkoutsOutput struct {
	Body CursorPage[WorkoutItem]
}

type CreateWorkoutOutput struct {
	Body WorkoutItem
}

type WorkoutSetItem struct {
	ID           string  `json:"id"`
	ExerciseName string  `json:"exercise_name"`
	Weight       float64 `json:"weight"`
	Reps         int     `json:"reps"`
	Sets         int     `json:"sets"`
	Memo         string  `json:"memo,omitempty"`
	Spotted      bool    `json:"spotted"`
}

type WorkoutDetailItem struct {
	ID        string         `json:"id"`
	TrainedOn time.Time      `json:"trained_on"`
	Memo      string         `json:"memo,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	Sets      []WorkoutSetItem `json:"sets"`
}

type GetWorkoutInput struct {
	WorkoutID string `path:"workoutId" doc:"Workout ID"`
}

type GetWorkoutOutput struct {
	Body WorkoutDetailItem
}

type UpdateWorkoutInput struct {
	WorkoutID string `path:"workoutId" doc:"Workout ID"`
	Body      struct {
		TrainedOn time.Time `json:"trained_on"          doc:"Training date"`
		Memo      string    `json:"memo"                doc:"Memo"`
		Sets      []struct {
			ExerciseName string  `json:"exercise_name" minLength:"1" doc:"Exercise name"`
			Weight       float64 `json:"weight"                      doc:"Weight (kg)"`
			Reps         int     `json:"reps"                        doc:"Repetitions"`
			Sets         int     `json:"sets"                        doc:"Sets"`
			Memo         string  `json:"memo"                        doc:"Set memo"`
			Spotted      bool    `json:"spotted"                     doc:"Spotted (assisted)"`
		} `json:"sets"`
	}
}

type UpdateWorkoutOutput struct {
	Body WorkoutItem
}

type DeleteWorkoutInput struct {
	WorkoutID string `path:"workoutId" doc:"Workout ID"`
}

type DeleteWorkoutOutput struct{}

type GetWorkoutDatesInput struct {
	Year  int `query:"year"  minimum:"2020" maximum:"2100" doc:"Year"`
	Month int `query:"month" minimum:"1"    maximum:"12"   doc:"Month"`
}

type WorkoutDateEntry struct {
	Date      string `json:"date"       doc:"Date in YYYY-MM-DD format"`
	WorkoutID string `json:"workout_id" doc:"Workout ID"`
}

type GetWorkoutDatesOutput struct {
	Body struct {
		Workouts []WorkoutDateEntry `json:"workouts" doc:"Workout date entries"`
	}
}

type GetLastSetInput struct {
	ExerciseName string `query:"exercise_name" minLength:"1" doc:"Exercise name"`
}

type GetLastSetOutput struct {
	Body struct {
		Weight float64 `json:"weight" doc:"Weight (kg)"`
		Reps   int     `json:"reps"   doc:"Repetitions"`
	}
}

type GetLastExerciseSetsInput struct {
	ExerciseName string `query:"exercise_name" minLength:"1" doc:"Exercise name"`
}

type LastExerciseSetItem struct {
	Weight float64 `json:"weight" doc:"Weight (kg)"`
	Reps   int     `json:"reps"   doc:"Repetitions"`
}

type GetLastExerciseSetsOutput struct {
	Body struct {
		Date string                `json:"date" doc:"Date of last workout (YYYY-MM-DD)"`
		Sets []LastExerciseSetItem `json:"sets" doc:"All sets from last workout"`
	}
}

type GetWorkoutStatsInput struct{}

type GetWorkoutStatsOutput struct {
	Body struct {
		TotalWorkouts int64   `json:"total_workouts" doc:"Total number of workouts"`
		TotalVolumeKg float64 `json:"total_volume_kg" doc:"Total volume lifted (kg)"`
	}
}

type GetExerciseMaxE1RMInput struct {
	ExerciseName    string `query:"exercise_name"     minLength:"1" doc:"Exercise name"`
	BeforeWorkoutID string `query:"before_workout_id" minLength:"1" doc:"Exclude this workout ID; return max e1RM from all other workouts"`
}

type GetExerciseMaxE1RMOutput struct {
	Body struct {
		MaxE1RM float64 `json:"max_e1rm" doc:"Maximum estimated 1RM (kg) from prior workouts; 0 if no history"`
	}
}

// --- Upload ---

type PresignUploadInput struct {
	Body struct {
		Filename    string `json:"filename"     minLength:"1" doc:"File name"`
		ContentType string `json:"content_type" minLength:"1" doc:"MIME type"`
	}
}

type PresignUploadOutput struct {
	Body struct {
		UploadURL string `json:"upload_url" doc:"Presigned PUT URL"`
		PublicURL string `json:"public_url" doc:"Public access URL after upload"`
	}
}

// --- Report ---

type CreateReportInput struct {
	Body struct {
		TargetType string `json:"target_type" enum:"post,gym,machine" doc:"Report target type"`
		TargetID   string `json:"target_id"   minLength:"1"           doc:"Target ID"`
		Reason     string `json:"reason"      minLength:"1"           doc:"Reason"`
	}
}

type CreateReportOutput struct {
	Body struct {
		ID string `json:"id"`
	}
}
