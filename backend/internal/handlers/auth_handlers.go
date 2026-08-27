package handlers

import (
	"context"

	"github.com/chaso-pa/gin-template/internal/middlewares"

	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
)

type AuthHandler struct {
	svc *services.AuthService
}

func NewAuthHandler(svc *services.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

func (h *AuthHandler) AnonymousAuth(ctx context.Context, input *models.AnonymousAuthInput) (*models.AnonymousAuthOutput, error) {
	token, userID, role, err := h.svc.AnonymousAuth(input.Body.DeviceUUID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to authenticate")
	}
	out := &models.AnonymousAuthOutput{}
	out.Body.Token = token
	out.Body.UserID = userID
	out.Body.Role = role
	return out, nil
}

// Me is how an already-installed client learns its role.
//
// Returning the role from the auth endpoint alone would never reach them: the app only
// calls that when it has no token, and the token survives in the keychain — including
// across a reinstall. The account most likely to be promoted is the developer's own, on a
// device that has held a token for months.
func (h *AuthHandler) Me(ctx context.Context, _ *struct{}) (*models.MeOutput, error) {
	u, err := h.svc.GetMe(middlewares.UserIDFromContext(ctx))
	if err != nil {
		return nil, huma.Error404NotFound("user not found")
	}
	out := &models.MeOutput{}
	out.Body.UserID = u.ID
	out.Body.Role = u.Role
	out.Body.Status = u.Status
	return out, nil
}
