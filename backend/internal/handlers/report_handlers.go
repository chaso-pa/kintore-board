package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
)

type ReportHandler struct {
	svc *services.ReportService
}

func NewReportHandler(svc *services.ReportService) *ReportHandler {
	return &ReportHandler{svc: svc}
}

func (h *ReportHandler) CreateReport(ctx context.Context, input *models.CreateReportInput) (*models.CreateReportOutput, error) {
	r, err := h.svc.CreateReport(
		viewerFrom(ctx),
		input.Body.TargetType,
		input.Body.TargetID,
		input.Body.Reason,
		input.Body.Detail,
	)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUnknownReportTarget):
			return nil, huma.Error422UnprocessableEntity("unknown target type")
		case errors.Is(err, services.ErrUnknownReportReason):
			return nil, huma.Error422UnprocessableEntity("unknown reason")
		case errors.Is(err, services.ErrReportLimitReached):
			// 429 rather than 403: the answer is "not now", and the app says so instead of
			// telling the user they are not allowed to report things.
			return nil, huma.NewError(http.StatusTooManyRequests,
				"too many reports; try again later")
		}
		// A target the reporter cannot see is reported as missing, the same answer fetching
		// it directly would give. Diverging here would make this endpoint a way to test
		// which ids exist.
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to create report")
	}

	out := &models.CreateReportOutput{}
	out.Body = models.ReportItem{
		ID:         r.ID,
		TargetType: r.TargetType,
		TargetID:   r.TargetID,
		Reason:     r.Reason,
		Status:     r.Status,
		CreatedAt:  r.CreatedAt,
	}
	return out, nil
}

// ListReports serves the moderation queue.
func (h *ReportHandler) ListReports(ctx context.Context, input *models.ListReportsInput) (*models.ListReportsOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	groups, err := h.svc.ListReportGroups(input.Status, input.Limit)
	if err != nil {
		if errors.Is(err, services.ErrInvalidReportResolution) {
			return nil, huma.Error422UnprocessableEntity("unknown status filter")
		}
		return nil, huma.Error500InternalServerError("failed to list reports")
	}

	items := make([]models.ReportGroupItem, len(groups))
	for i, g := range groups {
		entries := make([]models.ReportEntryItem, len(g.Reports))
		for j, e := range g.Reports {
			entries[j] = models.ReportEntryItem{
				Reason: e.Reason, Detail: e.Detail, CreatedAt: e.CreatedAt,
			}
		}
		items[i] = models.ReportGroupItem{
			TargetType:      g.TargetType,
			TargetID:        g.TargetID,
			ReportCount:     g.ReportCount,
			FirstReportedAt: g.FirstReportedAt,
			LastReportedAt:  g.LastReportedAt,
			Reports:         entries,
			TargetPreview:   g.TargetPreview,
			TargetStatus:    g.TargetStatus,
			TargetExists:    g.TargetExists,
			ThreadID:        g.ThreadID,
		}
	}
	out := &models.ListReportsOutput{}
	out.Body.Items = items
	return out, nil
}

// ResolveReports closes every pending complaint about one target.
//
// Note what this does not do: it does not touch the reported content. Removing a post is a
// separate capability that does not exist yet, so "reviewed" currently records that a
// moderator looked and dealt with it by whatever means they had. The decision is logged for
// the same reason approvals are — the row's own status says nothing about who changed it.
func (h *ReportHandler) ResolveReports(ctx context.Context, input *models.ResolveReportsInput) (*models.ResolveReportsOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	n, err := h.svc.ResolveReports(input.Body.TargetType, input.Body.TargetID, input.Body.Status)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUnknownReportTarget):
			return nil, huma.Error422UnprocessableEntity("unknown target type")
		case errors.Is(err, services.ErrInvalidReportResolution):
			return nil, huma.Error422UnprocessableEntity("status must be reviewed or dismissed")
		case errors.Is(err, services.ErrNoPendingReports):
			// 409, matching the approval flow: the target exists, someone else simply got
			// there first.
			return nil, huma.Error409Conflict("no pending reports for this target")
		}
		return nil, huma.Error500InternalServerError("failed to resolve reports")
	}
	logDecision(ctx, "report:"+input.Body.TargetType, input.Body.TargetID, input.Body.Status)

	out := &models.ResolveReportsOutput{}
	out.Body.TargetType = input.Body.TargetType
	out.Body.TargetID = input.Body.TargetID
	out.Body.Status = input.Body.Status
	out.Body.Resolved = n
	return out, nil
}
