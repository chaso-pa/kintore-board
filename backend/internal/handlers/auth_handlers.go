package handlers

import (
	"context"

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
	token, userID, err := h.svc.AnonymousAuth(input.Body.DeviceUUID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to authenticate")
	}
	out := &models.AnonymousAuthOutput{}
	out.Body.Token = token
	out.Body.UserID = userID
	return out, nil
}
