package handlers

import (
	"context"
	"errors"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/chaso-pa/gin-template/internal/utils"
	"github.com/danielgtaylor/huma/v2"
)

type BlockHandler struct {
	svc *services.BlockService
}

func NewBlockHandler(svc *services.BlockService) *BlockHandler {
	return &BlockHandler{svc: svc}
}

func (h *BlockHandler) BlockUser(ctx context.Context, input *models.BlockUserInput) (*models.BlockUserOutput, error) {
	if middlewares.UserIDFromContext(ctx) == "" {
		return nil, huma.Error401Unauthorized("sign in required")
	}

	b, err := h.svc.BlockAuthorOfPost(viewerFrom(ctx), input.PostID)
	if err != nil {
		if errors.Is(err, services.ErrCannotBlockSelf) {
			return nil, huma.Error422UnprocessableEntity("cannot block yourself")
		}
		// A post that is gone, or was never there, is reported the same way the listing
		// would report it. Same reasoning as CreateReport: answering differently would make
		// this a way to test which post ids exist.
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to block user")
	}

	out := &models.BlockUserOutput{}
	out.Body = blockToItem(*b)
	return out, nil
}

func (h *BlockHandler) ListBlocks(ctx context.Context, input *models.ListBlocksInput) (*models.ListBlocksOutput, error) {
	if middlewares.UserIDFromContext(ctx) == "" {
		return nil, huma.Error401Unauthorized("sign in required")
	}

	rows, err := h.svc.ListBlocks(viewerFrom(ctx))
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list blocks")
	}

	items := make([]models.BlockItem, len(rows))
	for i, r := range rows {
		items[i] = blockToItem(r)
	}
	out := &models.ListBlocksOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *BlockHandler) Unblock(ctx context.Context, input *models.UnblockInput) (*models.UnblockOutput, error) {
	if middlewares.UserIDFromContext(ctx) == "" {
		return nil, huma.Error401Unauthorized("sign in required")
	}

	if err := h.svc.Unblock(viewerFrom(ctx), input.BlockedUserID); err != nil {
		return nil, huma.Error500InternalServerError("failed to unblock user")
	}

	out := &models.UnblockOutput{}
	out.Body.OK = true
	return out, nil
}

func blockToItem(b services.UserBlock) models.BlockItem {
	return models.BlockItem{
		BlockedUserID: b.BlockedUserID,
		SourceExcerpt: utils.DerefStr(b.SourceExcerpt),
		CreatedAt:     b.CreatedAt,
	}
}
