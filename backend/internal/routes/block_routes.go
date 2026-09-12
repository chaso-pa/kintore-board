package routes

import (
	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

// SetupBlockRoutes wires the half of App Store guideline 1.2 that reporting does not cover.
//
// The block service is built with the report service rather than beside it: every block also
// files into the moderation queue, which is what makes blocking "notify the developer of the
// inappropriate content" rather than a private mute.
func SetupBlockRoutes(api huma.API, db *gorm.DB) {
	svc := services.NewBlockService(db, services.NewReportService(db))
	h := handlers.NewBlockHandler(svc)

	// Addressed by post, because a post is the only thing the app can name. See
	// models.BlockUserInput.
	huma.Post(api, "/api/v1/posts/{postId}/block", h.BlockUser)

	huma.Get(api, "/api/v1/users/me/blocks", h.ListBlocks)
	huma.Delete(api, "/api/v1/users/me/blocks/{blockedUserId}", h.Unblock)
}
