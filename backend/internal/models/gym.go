package models

import "time"

// --- Gym ---

type CreateGymInput struct {
	Body struct {
		Name             string   `json:"name"              minLength:"1" doc:"Gym name"`
		Address          *string  `json:"address"           required:"false" doc:"Address"`
		Latitude         *float64 `json:"latitude"          required:"false" doc:"Latitude"`
		Longitude        *float64 `json:"longitude"         required:"false" doc:"Longitude"`
		VisitorFee       *int     `json:"visitor_fee"       required:"false" doc:"Visitor fee (yen)"`
		MonthlyFee       *int     `json:"monthly_fee"       required:"false" doc:"Monthly fee (yen)"`
		VisitorAvailable *bool    `json:"visitor_available" required:"false" doc:"Visitor plan available"`
		Description      *string  `json:"description"       required:"false" doc:"Description"`
		Hours            *string  `json:"hours"             required:"false" doc:"Business hours"`
		HasParking       *bool    `json:"has_parking"        required:"false" doc:"Parking available"`
		HasShower        *bool    `json:"has_shower"         required:"false" doc:"Shower available"`
		HasLockerRoom    *bool    `json:"has_locker_room"    required:"false" doc:"Locker room available"`
		DumbbellMaxKg    *int     `json:"dumbbell_max_kg"    required:"false" doc:"Max dumbbell weight (kg)"`
		BarbellType      *string  `json:"barbell_type"       required:"false" enum:"standard,olympic,both" doc:"Barbell type"`
		PowerRackCount   *int     `json:"power_rack_count"   required:"false" doc:"Number of power racks"`
	}
}

type GymItem struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Address          string    `json:"address,omitempty"`
	Latitude         float64   `json:"latitude,omitempty"`
	Longitude        float64   `json:"longitude,omitempty"`
	VisitorFee       int       `json:"visitor_fee,omitempty"`
	MonthlyFee       int       `json:"monthly_fee,omitempty"`
	VisitorAvailable bool      `json:"visitor_available"`
	Hours            string    `json:"hours,omitempty"`
	HasParking       bool      `json:"has_parking"`
	HasShower        bool      `json:"has_shower"`
	HasLockerRoom    bool      `json:"has_locker_room"`
	DumbbellMaxKg    *int      `json:"dumbbell_max_kg,omitempty"`
	BarbellType      *string   `json:"barbell_type,omitempty"`
	PowerRackCount   *int      `json:"power_rack_count,omitempty"`
	MachineCount     int       `json:"machine_count"`
	Rating           float64   `json:"rating"`
	IsFavorited      bool      `json:"is_favorited"`
	LastUpdatedAt    time.Time `json:"last_updated_at"`
	DistanceKm       float64   `json:"distance_km,omitempty" doc:"Distance in km from the searched point; only present in proximity mode"`
	ThumbnailURL     string    `json:"thumbnail_url,omitempty"`
	Status           string    `json:"status,omitempty" doc:"Moderation status. Only ever pending or rejected for rows the caller is entitled to see"`
}

type ListGymsInput struct {
	Cursor string `query:"cursor" doc:"Pagination cursor. Ignored when lat/lng are given"`
	Limit  int    `query:"limit"  default:"20"    doc:"Items per page"`
	Search string `query:"search" doc:"Gym name search"`
	// Supplying both lat and lng switches to proximity mode: results are the nearest
	// gyms first, gyms without coordinates are excluded, and no next cursor is returned.
	//
	// These are plain floats because Huma rejects pointer types for query parameters, so
	// zero doubles as "not supplied". That matches how gym rows already encode a missing
	// location, and 0,0 is open ocean rather than anywhere a gym would be.
	Lat      float64 `query:"lat"       minimum:"-90"  maximum:"90"  doc:"Latitude to search around; requires lng"`
	Lng      float64 `query:"lng"       minimum:"-180" maximum:"180" doc:"Longitude to search around; requires lat"`
	RadiusKm float64 `query:"radius_km" minimum:"0"                 doc:"Optional maximum distance in km; 0 means no limit. Only used in proximity mode"`
	Status   string  `query:"status" enum:"active,pending,rejected" doc:"Moderation status filter. Empty means the default view: active rows, plus your own pending rows, plus every pending row for an admin"`
}

type ListGymsOutput struct {
	Body CursorPage[GymItem]
}

type CreateGymOutput struct {
	Body GymItem
}

type GetGymInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
}

type GetGymOutput struct {
	Body GymItem
}

// --- Machine ---

type CreateMachineInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
	Body  struct {
		Name         string  `json:"name"         minLength:"1" doc:"Machine name"`
		Manufacturer *string `json:"manufacturer" required:"false" doc:"Manufacturer"`
		BodyPart     *string `json:"body_part"    required:"false" doc:"Target body part"`
		Category     *string `json:"category"     required:"false" doc:"Exercise category"`
		Notes        *string `json:"notes"        required:"false" doc:"Notes"`
	}
}

type MachineItem struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Manufacturer string `json:"manufacturer,omitempty"`
	BodyPart     string `json:"body_part,omitempty"`
	Category     string `json:"category,omitempty"`
	HelpfulTotal int    `json:"helpful_total"`
	ReplyCount   int    `json:"reply_count"`
	ThreadCount  int    `json:"thread_count"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
	Status       string `json:"status,omitempty"`
}

type ListMachinesInput struct {
	GymID  string `path:"gymId" doc:"Gym ID"`
	Status string `query:"status" enum:"active,pending,rejected" doc:"Moderation status filter. Empty means the default view: active rows, plus your own pending rows, plus every pending row for an admin"`
}

type ListMachinesOutput struct {
	Body struct {
		Items []MachineItem `json:"items"`
	}
}

type CreateMachineOutput struct {
	Body MachineItem
}

type ListMachinesGlobalInput struct {
	Q        string `query:"q"         doc:"Search by name or manufacturer"`
	BodyPart string `query:"body_part"  doc:"Filter by body part"`
	Status   string `query:"status" enum:"active,pending,rejected" doc:"Moderation status filter. Empty means the default view: active rows, plus your own pending rows, plus every pending row for an admin"`
}

type ListMachinesGlobalOutput struct {
	Body struct {
		Items []MachineItem `json:"items"`
	}
}

type CreateMachineGlobalInput struct {
	Body struct {
		Name         string  `json:"name"         minLength:"1" doc:"Machine name"`
		Manufacturer *string `json:"manufacturer" required:"false" doc:"Manufacturer"`
		BodyPart     *string `json:"body_part"    required:"false" doc:"Target body part"`
		Category     *string `json:"category"     required:"false" doc:"Exercise category"`
		Notes        *string `json:"notes"        required:"false" doc:"Notes"`
	}
}

type CreateMachineGlobalOutput struct {
	Body MachineItem
}

type LinkMachineInput struct {
	GymID     string `path:"gymId"     doc:"Gym ID"`
	MachineID string `path:"machineId" doc:"Existing machine ID to link"`
}

type LinkMachineOutput struct {
	Body struct {
		GymID     string `json:"gym_id"`
		MachineID string `json:"machine_id"`
	}
}

type UnlinkMachineInput struct {
	GymID     string `path:"gymId"     doc:"Gym ID"`
	MachineID string `path:"machineId" doc:"Machine ID to unlink"`
}

type GetMachineInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
}

type GetMachineOutput struct {
	Body MachineItem
}

// --- Photos ---

type PhotoItem struct {
	ID       string `json:"id"`
	ImageURL string `json:"image_url"`
	Status   string `json:"status,omitempty"`
}

type ListGymPhotosInput struct {
	GymID  string `path:"gymId" doc:"Gym ID"`
	Status string `query:"status" enum:"active,pending,rejected" doc:"Moderation status filter. Empty means the default view: active rows, plus your own pending rows, plus every pending row for an admin"`
}

type ListGymPhotosOutput struct {
	Body struct {
		Items []PhotoItem `json:"items"`
	}
}

type SaveGymPhotoInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
	Body  struct {
		ImageURL string `json:"image_url" doc:"Public URL of uploaded photo"`
	}
}

type SaveGymPhotoOutput struct {
	Body PhotoItem
}

type PresignGymPhotoInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
	Body  struct {
		Filename    string `json:"filename"     doc:"File name"`
		ContentType string `json:"content_type" doc:"MIME type"`
	}
}

type PresignPhotoOutput struct {
	Body struct {
		UploadURL string `json:"upload_url"`
		PublicURL string `json:"public_url"`
	}
}

type ListMachinePhotosInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
	Status    string `query:"status" enum:"active,pending,rejected" doc:"Moderation status filter. Empty means the default view: active rows, plus your own pending rows, plus every pending row for an admin"`
}

type ListMachinePhotosOutput struct {
	Body struct {
		Items []PhotoItem `json:"items"`
	}
}

type PresignMachinePhotoInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
	Body      struct {
		Filename    string `json:"filename"     doc:"File name"`
		ContentType string `json:"content_type" doc:"MIME type"`
	}
}

type SaveMachinePhotoInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
	Body      struct {
		ImageURL string `json:"image_url" doc:"Public URL of uploaded photo"`
	}
}

type SaveMachinePhotoOutput struct {
	Body PhotoItem
}

// --- GymFavorite ---

type AddGymFavoriteInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
}

type AddGymFavoriteOutput struct {
	Body struct {
		GymID string `json:"gym_id"`
	}
}

type RemoveGymFavoriteInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
}

type ListGymFavoritesOutput struct {
	Body struct {
		Items []GymItem `json:"items"`
	}
}

// --- GymEditRequest ---

type CreateGymEditRequestInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
	Body  struct {
		Category string `json:"category" enum:"fee,hours,machines,facilities,other" doc:"Category of correction"`
		Body     string `json:"body"     minLength:"1" doc:"Description of the correction"`
	}
}

type CreateGymEditRequestOutput struct {
	Body struct {
		ID       string `json:"id"`
		GymID    string `json:"gym_id"`
		Category string `json:"category"`
		Status   string `json:"status"`
	}
}

// --- Moderation ---

// SetStatusInput bodies are shared shape-wise but kept as separate types so each route
// documents its own path parameter in the spec.
type moderationStatusBody struct {
	Status string `json:"status" enum:"active,rejected" doc:"Decision to record. Only a pending row can be decided"`
}

type SetGymStatusInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
	Body  moderationStatusBody
}

type SetMachineStatusInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
	Body      moderationStatusBody
}

type SetGymPhotoStatusInput struct {
	GymID   string `path:"gymId"   doc:"Gym ID"`
	PhotoID string `path:"photoId" doc:"Photo ID"`
	Body    moderationStatusBody
}

type SetMachinePhotoStatusInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
	PhotoID   string `path:"photoId"   doc:"Photo ID"`
	Body      moderationStatusBody
}

type SetStatusOutput struct {
	Body struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
}

type QueueDepthItem struct {
	Pending               int64   `json:"pending"`
	OldestPendingAgeHours float64 `json:"oldest_pending_age_hours" doc:"Hours since the oldest pending row was created; 0 when the queue is empty"`
}

type ModerationCountsOutput struct {
	Body struct {
		Gyms          QueueDepthItem `json:"gyms"`
		Machines      QueueDepthItem `json:"machines"`
		GymPhotos     QueueDepthItem `json:"gym_photos"`
		MachinePhotos QueueDepthItem `json:"machine_photos"`
	}
}
