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

	// Register static sub-paths before {threadId} to avoid conflict
	huma.Get(api, "/api/v1/threads/hot", h.ListHotThreads)
	huma.Get(api, "/api/v1/threads/bookmarks", h.ListBookmarks)

	huma.Get(api, "/api/v1/threads/{threadId}", h.GetThread)
	huma.Get(api, "/api/v1/threads/{threadId}/posts", h.ListPosts)
	huma.Post(api, "/api/v1/threads/{threadId}/posts", h.CreatePost)
	huma.Get(api, "/api/v1/threads/{threadId}/related", h.ListRelatedThreads)
	huma.Post(api, "/api/v1/threads/{threadId}/bookmark", h.BookmarkThread)
	huma.Delete(api, "/api/v1/threads/{threadId}/bookmark", h.UnbookmarkThread)
	huma.Post(api, "/api/v1/posts/{postId}/helpful", h.HelpfulPost)

	// Removal. Open to the author and to an admin; the handlers decide which, because the
	// two produce different statuses and only one of them is a moderation action.
	huma.Delete(api, "/api/v1/threads/{threadId}", h.DeleteThread)
	huma.Delete(api, "/api/v1/posts/{postId}", h.DeletePost)
}
