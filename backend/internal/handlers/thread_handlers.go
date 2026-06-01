package handlers

import (
	"context"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/chaso-pa/gin-template/internal/utils"
	"github.com/danielgtaylor/huma/v2"
)

type ThreadHandler struct {
	svc *services.ThreadService
}

func NewThreadHandler(svc *services.ThreadService) *ThreadHandler {
	return &ThreadHandler{svc: svc}
}

func (h *ThreadHandler) ListThreads(ctx context.Context, input *models.ListThreadsInput) (*models.ListThreadsOutput, error) {
	rows, next, err := h.svc.ListThreads(input.Cursor, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = models.ThreadItem{
			ID: r.ID, Type: r.Type, Title: r.Title,
			Category: utils.DerefStr(r.Category), GymID: utils.DerefStr(r.GymID), MachineID: utils.DerefStr(r.MachineID), CreatedAt: r.CreatedAt,
		}
	}
	out := &models.ListThreadsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *ThreadHandler) CreateThread(ctx context.Context, input *models.CreateThreadInput) (*models.CreateThreadOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	t, err := h.svc.CreateThread(userID, input.Body.Type, input.Body.Title, utils.DerefStr(input.Body.Category), utils.DerefStr(input.Body.GymID), utils.DerefStr(input.Body.MachineID))
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create thread")
	}
	out := &models.CreateThreadOutput{}
	out.Body = models.ThreadItem{ID: t.ID, Type: t.Type, Title: t.Title, Category: utils.DerefStr(t.Category), GymID: utils.DerefStr(t.GymID), MachineID: utils.DerefStr(t.MachineID), CreatedAt: t.CreatedAt}
	return out, nil
}

func (h *ThreadHandler) GetThread(ctx context.Context, input *models.GetThreadInput) (*models.GetThreadOutput, error) {
	t, err := h.svc.GetThread(input.ThreadID)
	if err != nil {
		return nil, huma.Error404NotFound("thread not found")
	}
	out := &models.GetThreadOutput{}
	out.Body = models.ThreadItem{ID: t.ID, Type: t.Type, Title: t.Title, Category: utils.DerefStr(t.Category), GymID: utils.DerefStr(t.GymID), MachineID: utils.DerefStr(t.MachineID), CreatedAt: t.CreatedAt}
	return out, nil
}

func (h *ThreadHandler) ListPosts(ctx context.Context, input *models.ListPostsInput) (*models.ListPostsOutput, error) {
	rows, next, err := h.svc.ListPosts(input.ThreadID, input.Cursor, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list posts")
	}
	items := make([]models.PostItem, len(rows))
	for i, r := range rows {
		items[i] = models.PostItem{
			ID: r.ID, ThreadID: r.ThreadID, AnonymousThreadID: r.AnonymousThreadID,
			Body: r.Body, HelpfulCount: r.HelpfulCount, CreatedAt: r.CreatedAt,
		}
	}
	out := &models.ListPostsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *ThreadHandler) CreatePost(ctx context.Context, input *models.CreatePostInput) (*models.CreatePostOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	p, err := h.svc.CreatePost(input.ThreadID, userID, input.Body.Body)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create post")
	}
	out := &models.CreatePostOutput{}
	out.Body = models.PostItem{
		ID: p.ID, ThreadID: p.ThreadID, AnonymousThreadID: p.AnonymousThreadID,
		Body: p.Body, HelpfulCount: p.HelpfulCount, CreatedAt: p.CreatedAt,
	}
	return out, nil
}

func (h *ThreadHandler) HelpfulPost(ctx context.Context, input *models.HelpfulPostInput) (*models.HelpfulPostOutput, error) {
	count, err := h.svc.IncrementHelpful(input.PostID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to increment helpful")
	}
	out := &models.HelpfulPostOutput{}
	out.Body.HelpfulCount = count
	return out, nil
}
