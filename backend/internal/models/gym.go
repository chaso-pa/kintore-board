package models

import "time"

// --- Gym ---

type CreateGymInput struct {
	Body struct {
		Name             string   `json:"name"              minLength:"1" doc:"Gym name"`
		Address          *string  `json:"address"          required:"false" doc:"Address"`
		Latitude         *float64 `json:"latitude"         required:"false" doc:"Latitude"`
		Longitude        *float64 `json:"longitude"        required:"false" doc:"Longitude"`
		VisitorFee       *int     `json:"visitor_fee"      required:"false" doc:"Visitor fee (yen)"`
		MonthlyFee       *int     `json:"monthly_fee"      required:"false" doc:"Monthly fee (yen)"`
		VisitorAvailable *bool    `json:"visitor_available" required:"false" doc:"Visitor plan available"`
		Description      *string  `json:"description"      required:"false" doc:"Description"`
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
	LastUpdatedAt    time.Time `json:"last_updated_at"`
}

type ListGymsInput struct {
	Cursor string `query:"cursor" doc:"Pagination cursor"`
	Limit  int    `query:"limit"  default:"20"    doc:"Items per page"`
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
	GymID        string `json:"gym_id"`
	Name         string `json:"name"`
	Manufacturer string `json:"manufacturer,omitempty"`
	BodyPart     string `json:"body_part,omitempty"`
	Category     string `json:"category,omitempty"`
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

type GetMachineInput struct {
	MachineID string `path:"machineId" doc:"Machine ID"`
}

type GetMachineOutput struct {
	Body MachineItem
}
