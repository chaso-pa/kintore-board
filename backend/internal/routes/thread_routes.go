package routes

import (
	"os"

	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

func SetupThreadRoutes(api huma.API, db *gorm.DB) {
	secret := os.Getenv("JWT_SECRET")
	svc := services.NewThreadService(db, secret)
	h := handlers.NewThreadHandler(svc)

	huma.Get(api, "/api/v1/threads", h.ListThreads)
	huma.Post(api, "/api/v1/threads", h.CreateThread)
	huma.Get(api, "/api/v1/threads/{threadId}", h.GetThread)
	huma.Get(api, "/api/v1/threads/{threadId}/posts", h.ListPosts)
	huma.Post(api, "/api/v1/threads/{threadId}/posts", h.CreatePost)
	huma.Post(api, "/api/v1/posts/{postId}/helpful", h.HelpfulPost)
}
