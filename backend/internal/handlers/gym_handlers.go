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
	svc    *services.GymService
	upload *services.UploadService
}

func NewGymHandler(svc *services.GymService) *GymHandler {
	return &GymHandler{svc: svc, upload: services.NewUploadService()}
}

func gymToItem(g *services.Gym) models.GymItem {
	return models.GymItem{
		ID: g.ID, Name: g.Name, Address: g.Address,
		Latitude: g.Latitude, Longitude: g.Longitude,
		VisitorFee: g.VisitorFee, MonthlyFee: g.MonthlyFee,
		VisitorAvailable: g.VisitorAvailable,
		Hours:          g.Hours,
		HasParking:     g.HasParking,
		HasShower:      g.HasShower,
		HasLockerRoom:  g.HasLockerRoom,
		DumbbellMaxKg:  g.DumbbellMaxKg,
		BarbellType:    g.BarbellType,
		PowerRackCount: g.PowerRackCount,
		MachineCount:   g.MachineCount,
		Rating:         g.Rating,
		LastUpdatedAt:  g.LastUpdatedAt,
	}
}

func machineToItem(m *services.Machine) models.MachineItem {
	return models.MachineItem{
		ID:           m.ID,
		Name:         m.Name,
		Manufacturer: utils.DerefStr(m.Manufacturer),
		BodyPart:     utils.DerefStr(m.BodyPart),
		Category:     utils.DerefStr(m.Category),
		HelpfulTotal: m.HelpfulTotal,
		ReplyCount:   m.ReplyCount,
		ThreadCount:  m.ThreadCount,
		ThumbnailURL: m.ThumbnailURL,
	}
}

func (h *GymHandler) ListGyms(ctx context.Context, input *models.ListGymsInput) (*models.ListGymsOutput, error) {
	rows, next, err := h.svc.ListGyms(input.Cursor, input.Limit, input.Search)
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
		Hours:            utils.DerefStr(input.Body.Hours),
		HasParking:       utils.DerefBool(input.Body.HasParking),
		HasShower:        utils.DerefBool(input.Body.HasShower),
		HasLockerRoom:    utils.DerefBool(input.Body.HasLockerRoom),
		DumbbellMaxKg:    input.Body.DumbbellMaxKg,
		BarbellType:      input.Body.BarbellType,
		PowerRackCount:   input.Body.PowerRackCount,
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

func (h *GymHandler) ListMachinesGlobal(ctx context.Context, input *models.ListMachinesGlobalInput) (*models.ListMachinesGlobalOutput, error) {
	rows, err := h.svc.ListMachinesGlobal(input.Q, input.BodyPart)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list machines")
	}
	items := make([]models.MachineItem, len(rows))
	for i := range rows {
		items[i] = machineToItem(&rows[i])
	}
	out := &models.ListMachinesGlobalOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *GymHandler) CreateMachineGlobal(ctx context.Context, input *models.CreateMachineGlobalInput) (*models.CreateMachineGlobalOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	m := &services.Machine{
		Name:         input.Body.Name,
		Manufacturer: input.Body.Manufacturer,
		BodyPart:     input.Body.BodyPart,
		Category:     input.Body.Category,
		Notes:        input.Body.Notes,
	}
	created, err := h.svc.CreateMachineGlobal(userID, m)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create machine")
	}
	out := &models.CreateMachineGlobalOutput{}
	out.Body = machineToItem(created)
	return out, nil
}

// --- Photos ---

func (h *GymHandler) ListGymPhotos(ctx context.Context, input *models.ListGymPhotosInput) (*models.ListGymPhotosOutput, error) {
	rows, err := h.svc.ListGymPhotos(input.GymID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list gym photos")
	}
	items := make([]models.PhotoItem, len(rows))
	for i, r := range rows {
		url, err := h.upload.PresignGetURL(r.ImageURL)
		if err != nil {
			url = r.ImageURL
		}
		items[i] = models.PhotoItem{ID: r.ID, ImageURL: url}
	}
	out := &models.ListGymPhotosOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *GymHandler) PresignGymPhoto(ctx context.Context, input *models.PresignGymPhotoInput) (*models.PresignPhotoOutput, error) {
	uploadURL, publicURL, err := h.upload.PresignUpload(input.Body.Filename, input.Body.ContentType)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to generate presigned URL")
	}
	out := &models.PresignPhotoOutput{}
	out.Body.UploadURL = uploadURL
	out.Body.PublicURL = publicURL
	return out, nil
}

func (h *GymHandler) ListMachinePhotos(ctx context.Context, input *models.ListMachinePhotosInput) (*models.ListMachinePhotosOutput, error) {
	rows, err := h.svc.ListMachinePhotos(input.MachineID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list machine photos")
	}
	items := make([]models.PhotoItem, len(rows))
	for i, r := range rows {
		url, err := h.upload.PresignGetURL(r.ImageURL)
		if err != nil {
			url = r.ImageURL
		}
		items[i] = models.PhotoItem{ID: r.ID, ImageURL: url}
	}
	out := &models.ListMachinePhotosOutput{}
	out.Body.Items = items
	return out, nil
}

func (h *GymHandler) PresignMachinePhoto(ctx context.Context, input *models.PresignMachinePhotoInput) (*models.PresignPhotoOutput, error) {
	uploadURL, publicURL, err := h.upload.PresignUpload(input.Body.Filename, input.Body.ContentType)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to generate presigned URL")
	}
	out := &models.PresignPhotoOutput{}
	out.Body.UploadURL = uploadURL
	out.Body.PublicURL = publicURL
	return out, nil
}

func (h *GymHandler) SaveGymPhoto(ctx context.Context, input *models.SaveGymPhotoInput) (*models.SaveGymPhotoOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	photo, err := h.svc.SaveGymPhoto(userID, input.GymID, input.Body.ImageURL)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to save gym photo")
	}
	out := &models.SaveGymPhotoOutput{}
	out.Body = models.PhotoItem{ID: photo.ID, ImageURL: photo.ImageURL}
	return out, nil
}

func (h *GymHandler) SaveMachinePhoto(ctx context.Context, input *models.SaveMachinePhotoInput) (*models.SaveMachinePhotoOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	photo, err := h.svc.SaveMachinePhoto(userID, input.MachineID, input.Body.ImageURL)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to save machine photo")
	}
	out := &models.SaveMachinePhotoOutput{}
	out.Body = models.PhotoItem{ID: photo.ID, ImageURL: photo.ImageURL}
	return out, nil
}

// --- GymEditRequest ---

func (h *GymHandler) CreateGymEditRequest(ctx context.Context, input *models.CreateGymEditRequestInput) (*models.CreateGymEditRequestOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	r, err := h.svc.CreateGymEditRequest(userID, input.GymID, input.Body.Category, input.Body.Body)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create edit request")
	}
	out := &models.CreateGymEditRequestOutput{}
	out.Body.ID = r.ID
	out.Body.GymID = r.GymID
	out.Body.Category = r.Category
	out.Body.Status = r.Status
	return out, nil
}
