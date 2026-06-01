package handlers

import (
	"context"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/chaso-pa/gin-template/internal/utils"
	"github.com/danielgtaylor/huma/v2"
)

type GymHandler struct {
	svc *services.GymService
}

func NewGymHandler(svc *services.GymService) *GymHandler {
	return &GymHandler{svc: svc}
}

func gymToItem(g *services.Gym) models.GymItem {
	return models.GymItem{
		ID: g.ID, Name: g.Name, Address: g.Address,
		Latitude: g.Latitude, Longitude: g.Longitude,
		VisitorFee: g.VisitorFee, MonthlyFee: g.MonthlyFee,
		VisitorAvailable: g.VisitorAvailable, LastUpdatedAt: g.LastUpdatedAt,
	}
}

func machineToItem(m *services.Machine) models.MachineItem {
	return models.MachineItem{
		ID: m.ID, GymID: m.GymID, Name: m.Name,
		Manufacturer: utils.DerefStr(m.Manufacturer), BodyPart: utils.DerefStr(m.BodyPart), Category: utils.DerefStr(m.Category),
	}
}

func (h *GymHandler) ListGyms(ctx context.Context, input *models.ListGymsInput) (*models.ListGymsOutput, error) {
	rows, next, err := h.svc.ListGyms(input.Cursor, input.Limit)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list gyms")
	}
	items := make([]models.GymItem, len(rows))
	for i := range rows {
		items[i] = gymToItem(&rows[i])
	}
	out := &models.ListGymsOutput{}
	out.Body.Items = items
	out.Body.NextCursor = next
	return out, nil
}

func (h *GymHandler) CreateGym(ctx context.Context, input *models.CreateGymInput) (*models.CreateGymOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	g := &services.Gym{
		Name:             input.Body.Name,
		Address:          utils.DerefStr(input.Body.Address),
		Latitude:         utils.DerefFloat(input.Body.Latitude),
		Longitude:        utils.DerefFloat(input.Body.Longitude),
		VisitorFee:       utils.DerefInt(input.Body.VisitorFee),
		MonthlyFee:       utils.DerefInt(input.Body.MonthlyFee),
		VisitorAvailable: utils.DerefBool(input.Body.VisitorAvailable),
		Description:      utils.DerefStr(input.Body.Description),
	}
	created, err := h.svc.CreateGym(userID, g)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create gym")
	}
	out := &models.CreateGymOutput{}
	out.Body = gymToItem(created)
	return out, nil
}

func (h *GymHandler) GetGym(ctx context.Context, input *models.GetGymInput) (*models.GetGymOutput, error) {
	g, err := h.svc.GetGym(input.GymID)
	if err != nil {
		return nil, huma.Error404NotFound("gym not found")
	}
	out := &models.GetGymOutput{}
	out.Body = gymToItem(g)
	return out, nil
}

func (h *GymHandler) ListMachines(ctx context.Context, input *models.ListMachinesInput) (*models.ListMachinesOutput, error) {
	rows, err := h.svc.ListMachines(input.GymID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list machines")
	}
	items := make([]models.MachineItem, len(rows))
	for i := range rows {
		items[i] = machineToItem(&rows[i])
	}
	out := &models.ListMachinesOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *GymHandler) CreateMachine(ctx context.Context, input *models.CreateMachineInput) (*models.CreateMachineOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	m := &services.Machine{
		Name:         input.Body.Name,
		Manufacturer: input.Body.Manufacturer,
		BodyPart:     input.Body.BodyPart,
		Category:     input.Body.Category,
		Notes:        input.Body.Notes,
	}
	created, err := h.svc.CreateMachine(userID, input.GymID, m)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create machine")
	}
	out := &models.CreateMachineOutput{}
	out.Body = machineToItem(created)
	return out, nil
}

func (h *GymHandler) GetMachine(ctx context.Context, input *models.GetMachineInput) (*models.GetMachineOutput, error) {
	m, err := h.svc.GetMachine(input.MachineID)
	if err != nil {
		return nil, huma.Error404NotFound("machine not found")
	}
	out := &models.GetMachineOutput{}
	out.Body = machineToItem(m)
	return out, nil
}
