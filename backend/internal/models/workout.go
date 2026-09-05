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
			BodyPart     string  `json:"body_part,omitempty"         doc:"Body part this exercise was filed under"`
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
	BodyPart     string  `json:"body_part,omitempty"`
}

type WorkoutDetailItem struct {
	ID        string           `json:"id"`
	TrainedOn time.Time        `json:"trained_on"`
	Memo      string           `json:"memo,omitempty"`
	CreatedAt time.Time        `json:"created_at"`
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
			BodyPart     string  `json:"body_part,omitempty"         doc:"Body part this exercise was filed under"`
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
	// Empty with unclassified=false means every part, which is what a client built before
	// this field sends. Those installs keep seeing one combined history rather than nothing.
	BodyPart string `query:"body_part" doc:"Body part to narrow to. Empty means every part."`
	// A separate flag rather than a reserved body_part value: parts are user-defined strings,
	// so any sentinel could collide with one somebody actually made.
	Unclassified bool `query:"unclassified" default:"false" doc:"Only sets with no body part"`
}

type GetLastSetOutput struct {
	Body struct {
		Weight float64 `json:"weight" doc:"Weight (kg)"`
		Reps   int     `json:"reps"   doc:"Repetitions"`
	}
}

type GetLastExerciseSetsInput struct {
	ExerciseName string `query:"exercise_name" minLength:"1" doc:"Exercise name"`
	// Empty with unclassified=false means every part, which is what a client built before
	// this field sends. Those installs keep seeing one combined history rather than nothing.
	BodyPart string `query:"body_part" doc:"Body part to narrow to. Empty means every part."`
	// A separate flag rather than a reserved body_part value: parts are user-defined strings,
	// so any sentinel could collide with one somebody actually made.
	Unclassified bool `query:"unclassified" default:"false" doc:"Only sets with no body part"`
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
	// Empty with unclassified=false means every part, which is what a client built before
	// this field sends. Those installs keep comparing against one combined history.
	BodyPart string `query:"body_part" doc:"Body part to narrow to. Empty means every part."`
	// A separate flag rather than a reserved body_part value: parts are user-defined strings,
	// so any sentinel could collide with one somebody actually made.
	Unclassified bool `query:"unclassified" default:"false" doc:"Only sets with no body part"`
}

type GetExerciseMaxE1RMOutput struct {
	Body struct {
		MaxE1RM float64 `json:"max_e1rm" doc:"Maximum estimated 1RM (kg) from prior workouts; 0 if no history"`
	}
}

// --- Exercise history ---

type GetExerciseHistoryInput struct {
	ExerciseName string `query:"exercise_name" required:"true" minLength:"1" doc:"Exercise name to chart"`
	// Empty with unclassified=false means every part, which is what a client built before
	// this field sends. Those installs keep seeing one combined history rather than nothing.
	BodyPart string `query:"body_part" doc:"Body part to narrow to. Empty means every part."`
	// A separate flag rather than a reserved body_part value: parts are user-defined strings,
	// so any sentinel could collide with one somebody actually made.
	Unclassified bool `query:"unclassified" default:"false" doc:"Only sets with no body part"`
}

type ExerciseHistorySetItem struct {
	WorkoutID string  `json:"workout_id" doc:"Workout this set belongs to"`
	Weight    float64 `json:"weight"     doc:"Weight in kg; 0 for bodyweight sets"`
	Reps      int     `json:"reps"       doc:"Repetitions"`
	Sets      int     `json:"sets"       doc:"Repeated identical sets"`
	Spotted   bool    `json:"spotted"    doc:"Performed with a spotter"`
	Memo      string  `json:"memo"       doc:"Set memo"`
}

type ExerciseHistoryPointItem struct {
	Date        string                   `json:"date"         doc:"YYYY-MM-DD"`
	WorkoutIDs  []string                 `json:"workout_ids"  doc:"Workout IDs on this date, earliest first"`
	E1RM        float64                  `json:"e1rm"         doc:"Best estimated 1RM; weighted sets only"`
	MaxWeight   float64                  `json:"max_weight"   doc:"Heaviest weight; weighted sets only"`
	TotalVolume float64                  `json:"total_volume" doc:"Sum of weight x reps x max(sets,1)"`
	MaxReps     int                      `json:"max_reps"     doc:"Highest rep count across all sets, weighted or not"`
	Sets        []ExerciseHistorySetItem `json:"sets"         doc:"Every set recorded on this date"`
}

type GetExerciseHistoryOutput struct {
	Body struct {
		ExerciseName  string                     `json:"exercise_name"   doc:"Exercise name"`
		HasWeightData bool                       `json:"has_weight_data" doc:"False when the exercise has no weighted set at all; the client then charts max_reps"`
		Points        []ExerciseHistoryPointItem `json:"points"          doc:"One entry per calendar day, oldest first"`
	}
}

type ListExercisesInput struct{}

type ExerciseSummaryItem struct {
	ExerciseName  string  `json:"exercise_name"   doc:"Exercise name"`
	LastTrainedOn string  `json:"last_trained_on" doc:"Most recent date YYYY-MM-DD"`
	SessionCount  int     `json:"session_count"   doc:"Number of workouts containing this exercise"`
	BestE1RM      float64 `json:"best_e1rm"       doc:"Personal best estimated 1RM; 0 when no weighted sets"`
	BodyPart      string  `json:"body_part"`
}

type ListExercisesOutput struct {
	Body struct {
		Items []ExerciseSummaryItem `json:"items" doc:"Exercises, most recently trained first"`
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

// The report models used to sit here as unused scaffolding, under a "--- Report ---"
// heading in the workout file. They now live in report.go alongside a handler that
// actually serves them.

// ClassifyExercisesInput carries the device's own name → body part map.
//
// The mapping has to come from the client: the preset list ships inside the app and custom
// exercises and parts live in a file on the phone, so the server has nothing to look up.
// Named rather than anonymous: Huma derives a schema name per struct, and every anonymous
// slice element ends up called "Item". A second one with a different shape panics at route
// registration with "duplicate name: Item".
type ExerciseBodyPartMapping struct {
	ExerciseName string `json:"exercise_name" minLength:"1" doc:"Exercise name as recorded"`
	BodyPart     string `json:"body_part"     minLength:"1" doc:"Body part it is filed under"`
}

type ClassifyExercisesInput struct {
	Body struct {
		Mappings []ExerciseBodyPartMapping `json:"mappings"`
	}
}

type ClassifyExercisesOutput struct {
	Body struct {
		Updated int64 `json:"updated" doc:"Number of sets filled in"`
	}
}

type GetUnclassifiedExercisesInput struct{}

type GetUnclassifiedExercisesOutput struct {
	Body struct {
		ExerciseNames []string `json:"exercise_names" doc:"Recorded names with no body part yet"`
	}
}
