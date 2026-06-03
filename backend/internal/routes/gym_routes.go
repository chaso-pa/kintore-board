package routes

import (
	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

func SetupGymRoutes(api huma.API, db *gorm.DB) {
	svc := services.NewGymService(db)
	h := handlers.NewGymHandler(svc)

	huma.Get(api, "/api/v1/gyms", h.ListGyms)
	huma.Post(api, "/api/v1/gyms", h.CreateGym)
	huma.Get(api, "/api/v1/gyms/{gymId}", h.GetGym)
	huma.Get(api, "/api/v1/gyms/{gymId}/machines", h.ListMachines)
	huma.Post(api, "/api/v1/gyms/{gymId}/machines", h.CreateMachine)
	huma.Get(api, "/api/v1/machines", h.ListMachinesGlobal)
	huma.Post(api, "/api/v1/machines", h.CreateMachineGlobal)
	huma.Get(api, "/api/v1/machines/{machineId}", h.GetMachine)

	// Photos
	huma.Get(api, "/api/v1/gyms/{gymId}/photos", h.ListGymPhotos)
	huma.Post(api, "/api/v1/gyms/{gymId}/photos/presign", h.PresignGymPhoto)
	huma.Post(api, "/api/v1/gyms/{gymId}/photos", h.SaveGymPhoto)
	huma.Get(api, "/api/v1/machines/{machineId}/photos", h.ListMachinePhotos)
	huma.Post(api, "/api/v1/machines/{machineId}/photos/presign", h.PresignMachinePhoto)
	huma.Post(api, "/api/v1/machines/{machineId}/photos", h.SaveMachinePhoto)

	// Edit requests
	huma.Post(api, "/api/v1/gyms/{gymId}/edit-requests", h.CreateGymEditRequest)
}
