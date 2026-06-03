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
	LastUpdatedAt    time.Time `json:"last_updated_at"`
}

type ListGymsInput struct {
	Cursor string `query:"cursor" doc:"Pagination cursor"`
	Limit  int    `query:"limit"  default:"20"    doc:"Items per page"`
	Search string `query:"search" doc:"Gym name search"`
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
}

type ListMachinesInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
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
}

type ListGymPhotosInput struct {
	GymID string `path:"gymId" doc:"Gym ID"`
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
