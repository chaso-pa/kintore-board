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

func threadToItem(r services.Thread, isBookmarked bool) models.ThreadItem {
	return models.ThreadItem{
		ID:           r.ID,
		Type:         r.Type,
		Title:        r.Title,
		Category:     utils.DerefStr(r.Category),
		GymID:        utils.DerefStr(r.GymID),
		MachineID:    utils.DerefStr(r.MachineID),
		ReplyCount:   r.ReplyCount,
		HelpfulTotal: r.HelpfulTotal,
		IsBookmarked: isBookmarked,
		CreatedAt:    r.CreatedAt,
	}
}

func (h *ThreadHandler) ListThreads(ctx context.Context, input *models.ListThreadsInput) (*models.ListThreadsOutput, error) {
	rows, next, err := h.svc.ListThreads(input.Cursor, input.Sort, input.Category, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, false)
	}
	out := &models.ListThreadsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *ThreadHandler) ListHotThreads(ctx context.Context, input *struct{}) (*models.ListHotThreadsOutput, error) {
	rows, err := h.svc.ListHotThreads(5)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list hot threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, false)
	}
	out := &models.ListHotThreadsOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *ThreadHandler) CreateThread(ctx context.Context, input *models.CreateThreadInput) (*models.CreateThreadOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	t, err := h.svc.CreateThread(userID, input.Body.Type, input.Body.Title, utils.DerefStr(input.Body.Category), utils.DerefStr(input.Body.GymID), utils.DerefStr(input.Body.MachineID))
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create thread")
	}
	out := &models.CreateThreadOutput{}
	out.Body = threadToItem(*t, false)
	return out, nil
}

func (h *ThreadHandler) GetThread(ctx context.Context, input *models.GetThreadInput) (*models.GetThreadOutput, error) {
	t, err := h.svc.GetThread(input.ThreadID)
	if err != nil {
		return nil, huma.Error404NotFound("thread not found")
	}
	userID := middlewares.UserIDFromContext(ctx)
	isBookmarked := userID != "" && h.svc.IsBookmarked(userID, input.ThreadID)
	out := &models.GetThreadOutput{}
	out.Body = threadToItem(*t, isBookmarked)
	return out, nil
}

func (h *ThreadHandler) BookmarkThread(ctx context.Context, input *models.BookmarkThreadInput) (*models.BookmarkThreadOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	if err := h.svc.BookmarkThread(userID, input.ThreadID); err != nil {
		return nil, huma.Error500InternalServerError("failed to bookmark thread")
	}
	out := &models.BookmarkThreadOutput{}
	out.Body.Bookmarked = true
	return out, nil
}

func (h *ThreadHandler) UnbookmarkThread(ctx context.Context, input *models.UnbookmarkThreadInput) (*models.UnbookmarkThreadOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	if err := h.svc.UnbookmarkThread(userID, input.ThreadID); err != nil {
		return nil, huma.Error500InternalServerError("failed to unbookmark thread")
	}
	return &models.UnbookmarkThreadOutput{}, nil
}

func (h *ThreadHandler) ListBookmarks(ctx context.Context, input *models.ListBookmarksInput) (*models.ListBookmarksOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	rows, next, err := h.svc.ListBookmarks(userID, input.Cursor, input.Category, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list bookmarks")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, true)
	}
	out := &models.ListBookmarksOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
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
