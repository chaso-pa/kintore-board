package routes

import (
	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

func SetupAuthRoutes(api huma.API, db *gorm.DB) {
	svc := services.NewAuthService(db)
	h := handlers.NewAuthHandler(svc)

	huma.Post(api, "/api/v1/auth/anonymous", h.AnonymousAuth)
	huma.Get(api, "/api/v1/users/me", h.Me)
}
