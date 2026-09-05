package handlers

import (
	"context"
	"errors"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/chaso-pa/gin-template/internal/utils"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

type ThreadHandler struct {
	svc *services.ThreadService
}

func NewThreadHandler(svc *services.ThreadService) *ThreadHandler {
	return &ThreadHandler{svc: svc}
}

// viewerID is passed rather than read from a context here so the mapping stays a pure
// function: is_mine is the one field whose value depends on who is asking, and hiding that
// dependency inside the mapper is how it ends up wrong on one of the five call sites.
func threadToItem(r services.Thread, isBookmarked bool, viewerID string) models.ThreadItem {
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
		// An empty viewer id must never match an empty author id, or every thread would
		// look like it belonged to a signed-out reader.
		IsMine: viewerID != "" && r.CreatedByUserID == viewerID,
	}
}

func postToItem(r services.Post, viewerID string) models.PostItem {
	return models.PostItem{
		ID: r.ID, ThreadID: r.ThreadID, AnonymousThreadID: r.AnonymousThreadID,
		ReplyToID: r.ReplyToID, Body: r.Body, HelpfulCount: r.HelpfulCount,
		CreatedAt: r.CreatedAt,
		// See PostItem.IsMine. The empty check matters: without it a signed-out reader
		// would match every post whose author id happened to be empty.
		IsMine: viewerID != "" && r.UserID == viewerID,
	}
}

func (h *ThreadHandler) ListThreads(ctx context.Context, input *models.ListThreadsInput) (*models.ListThreadsOutput, error) {
	viewerID := middlewares.UserIDFromContext(ctx)
	rows, next, err := h.svc.ListThreads(input.Cursor, input.Sort, input.Category, input.GymID, input.MachineID, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, false, viewerID)
	}
	out := &models.ListThreadsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *ThreadHandler) ListHotThreads(ctx context.Context, input *struct{}) (*models.ListHotThreadsOutput, error) {
	viewerID := middlewares.UserIDFromContext(ctx)
	rows, err := h.svc.ListHotThreads(5)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list hot threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, false, viewerID)
	}
	out := &models.ListHotThreadsOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *ThreadHandler) CreateThread(ctx context.Context, input *models.CreateThreadInput) (*models.CreateThreadOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	t, _, err := h.svc.CreateThread(viewerFrom(ctx), userID, input.Body.Type, input.Body.Title, utils.DerefStr(input.Body.Category), utils.DerefStr(input.Body.GymID), utils.DerefStr(input.Body.MachineID), input.Body.FirstPost)
	if err != nil {
		// A thread anchored to a gym or machine the author may not see is refused as 404,
		// the same answer that fetching the anchor itself would give.
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to create thread")
	}
	out := &models.CreateThreadOutput{}
	out.Body = threadToItem(*t, false, userID)
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
	out.Body = threadToItem(*t, isBookmarked, userID)
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
		items[i] = threadToItem(r, true, userID)
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
	viewerID := middlewares.UserIDFromContext(ctx)
	items := make([]models.PostItem, len(rows))
	for i, r := range rows {
		items[i] = postToItem(r, viewerID)
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
	out.Body = postToItem(*p, userID)
	return out, nil
}

func (h *ThreadHandler) ListRelatedThreads(ctx context.Context, input *models.ListRelatedThreadsInput) (*models.ListRelatedThreadsOutput, error) {
	viewerID := middlewares.UserIDFromContext(ctx)
	rows, err := h.svc.ListRelatedThreads(input.ThreadID, 5)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list related threads")
	}
	items := make([]models.ThreadItem, len(rows))
	for i, r := range rows {
		items[i] = threadToItem(r, false, viewerID)
	}
	out := &models.ListRelatedThreadsOutput{}
	out.Body.Items = items
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

// deleteContentError maps removal failures.
//
// ErrAlreadyDeleted is a 409 rather than a 404: the row exists and the caller may well be
// looking at a stale list, so "it is already gone" is a more useful answer than "there is
// no such post".
func deleteContentError(err error) error {
	switch {
	case errors.Is(err, services.ErrAlreadyDeleted):
		return huma.Error409Conflict("already deleted")
	case errors.Is(err, services.ErrForbidden):
		return huma.Error403Forbidden("not permitted")
	case errors.Is(err, gorm.ErrRecordNotFound):
		return huma.Error404NotFound("not found")
	default:
		return huma.Error500InternalServerError("failed to delete")
	}
}

func (h *ThreadHandler) DeletePost(ctx context.Context, input *models.DeletePostInput) (*models.DeleteContentOutput, error) {
	status, err := h.svc.DeletePost(viewerFrom(ctx), input.PostID)
	if err != nil {
		return nil, deleteContentError(err)
	}
	// Logged for the same reason approvals are: the row's own status records that it was
	// removed but says nothing about who did it, and a misused admin account would leave no
	// trace at all.
	if status == services.PostStatusRemoved {
		logDecision(ctx, "post", input.PostID, status)
	}
	out := &models.DeleteContentOutput{}
	out.Body.ID = input.PostID
	out.Body.Status = status
	return out, nil
}

func (h *ThreadHandler) DeleteThread(ctx context.Context, input *models.DeleteThreadInput) (*models.DeleteContentOutput, error) {
	status, err := h.svc.DeleteThread(viewerFrom(ctx), input.ThreadID)
	if err != nil {
		return nil, deleteContentError(err)
	}
	if status == services.PostStatusRemoved {
		logDecision(ctx, "thread", input.ThreadID, status)
	}
	out := &models.DeleteContentOutput{}
	out.Body.ID = input.ThreadID
	out.Body.Status = status
	return out, nil
}
