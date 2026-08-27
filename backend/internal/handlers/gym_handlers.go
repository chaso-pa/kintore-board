package handlers

import (
	"context"
	"errors"
	"log"

	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/models"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/chaso-pa/gin-template/internal/utils"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

type GymHandler struct {
	svc    *services.GymService
	upload *services.UploadService
}

func NewGymHandler(svc *services.GymService) *GymHandler {
	return &GymHandler{svc: svc, upload: services.NewUploadService()}
}

// viewerFrom packages up everything the service layer needs to decide what this caller
// may see. The role comes from the middleware's DB lookup, never from the token.
func viewerFrom(ctx context.Context) services.Viewer {
	return services.Viewer{
		UserID:  middlewares.UserIDFromContext(ctx),
		IsAdmin: middlewares.IsAdmin(ctx),
	}
}

// moderationError maps the service layer's refusals onto status codes, returning nil for
// anything it does not recognise so the caller can apply its own fallback.
//
// Without this the handlers flatten every failure into one code. LinkMachine used to
// answer 409 "machine already linked" no matter what went wrong, so adding an
// authorisation check to the service would have produced that message for a permission
// error — the check would have worked and been invisible.
//
// A row the caller may not see is reported as 404 rather than 403, matching GetGym: the
// two answers must agree, or the pair of them reveals which ids exist.
func moderationError(err error) error {
	switch {
	case errors.Is(err, services.ErrForbiddenStatusFilter):
		return huma.Error403Forbidden("status filter not permitted")
	case errors.Is(err, services.ErrInvalidStatusFilter):
		return huma.Error422UnprocessableEntity("unknown status filter")
	case errors.Is(err, services.ErrForbidden):
		return huma.Error403Forbidden("not permitted")
	case errors.Is(err, services.ErrForeignImageURL):
		return huma.Error422UnprocessableEntity("image_url must point at an uploaded object")
	case errors.Is(err, gorm.ErrRecordNotFound):
		return huma.Error404NotFound("not found")
	default:
		return nil
	}
}

func gymToItem(g *services.Gym) models.GymItem {
	return models.GymItem{
		ID: g.ID, Name: g.Name, Address: g.Address, Status: g.Status,
		Latitude: g.Latitude, Longitude: g.Longitude,
		VisitorFee: g.VisitorFee, MonthlyFee: g.MonthlyFee,
		VisitorAvailable: g.VisitorAvailable,
		Hours:            g.Hours,
		HasParking:       g.HasParking,
		HasShower:        g.HasShower,
		HasLockerRoom:    g.HasLockerRoom,
		DumbbellMaxKg:    g.DumbbellMaxKg,
		BarbellType:      g.BarbellType,
		PowerRackCount:   g.PowerRackCount,
		MachineCount:     g.MachineCount,
		Rating:           g.Rating,
		IsFavorited:      g.IsFavorited,
		LastUpdatedAt:    g.LastUpdatedAt,
		DistanceKm:       g.DistanceKm,
		ThumbnailURL:     g.ThumbnailURL,
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
		Status:       m.Status,
	}
}

func (h *GymHandler) ListGyms(ctx context.Context, input *models.ListGymsInput) (*models.ListGymsOutput, error) {
	// Proximity mode needs both halves of the coordinate; one alone is meaningless.
	// Zero stands for "not supplied" since query parameters cannot be pointers here.
	var near *services.NearQuery
	if input.Lat != 0 && input.Lng != 0 {
		near = &services.NearQuery{Lat: input.Lat, Lng: input.Lng}
		if input.RadiusKm > 0 {
			near.RadiusKm = &input.RadiusKm
		}
	}

	rows, next, err := h.svc.ListGyms(viewerFrom(ctx), input.Cursor, input.Limit, input.Search, input.Status, near)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list gyms")
	}
	items := make([]models.GymItem, len(rows))
	for i := range rows {
		if rows[i].ThumbnailURL != "" {
			if signed, err := h.upload.PresignGetURL(rows[i].ThumbnailURL); err == nil {
				rows[i].ThumbnailURL = signed
			}
		}
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
	g, err := h.svc.GetGym(viewerFrom(ctx), input.GymID)
	if err != nil {
		return nil, huma.Error404NotFound("gym not found")
	}
	out := &models.GetGymOutput{}
	out.Body = gymToItem(g)
	return out, nil
}

func (h *GymHandler) ListMachines(ctx context.Context, input *models.ListMachinesInput) (*models.ListMachinesOutput, error) {
	rows, err := h.svc.ListMachines(viewerFrom(ctx), input.GymID, input.Status)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list machines")
	}
	items := make([]models.MachineItem, len(rows))
	for i := range rows {
		if rows[i].ThumbnailURL != "" {
			if signed, err := h.upload.PresignGetURL(rows[i].ThumbnailURL); err == nil {
				rows[i].ThumbnailURL = signed
			}
		}
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
	created, err := h.svc.CreateMachine(viewerFrom(ctx), userID, input.GymID, m)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to create machine")
	}
	out := &models.CreateMachineOutput{}
	out.Body = machineToItem(created)
	return out, nil
}

func (h *GymHandler) LinkMachine(ctx context.Context, input *models.LinkMachineInput) (*models.LinkMachineOutput, error) {
	if err := h.svc.LinkMachine(viewerFrom(ctx), input.GymID, input.MachineID); err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		// Anything left is the unique-key violation on an existing pair.
		return nil, huma.Error409Conflict("machine already linked to this gym")
	}
	out := &models.LinkMachineOutput{}
	out.Body.GymID = input.GymID
	out.Body.MachineID = input.MachineID
	return out, nil
}

func (h *GymHandler) UnlinkMachine(ctx context.Context, input *models.UnlinkMachineInput) (*struct{}, error) {
	if err := h.svc.UnlinkMachine(viewerFrom(ctx), input.GymID, input.MachineID); err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to unlink machine")
	}
	return &struct{}{}, nil
}

func (h *GymHandler) GetMachine(ctx context.Context, input *models.GetMachineInput) (*models.GetMachineOutput, error) {
	m, err := h.svc.GetMachine(viewerFrom(ctx), input.MachineID)
	if err != nil {
		return nil, huma.Error404NotFound("machine not found")
	}
	out := &models.GetMachineOutput{}
	out.Body = machineToItem(m)
	return out, nil
}

func (h *GymHandler) ListMachinesGlobal(ctx context.Context, input *models.ListMachinesGlobalInput) (*models.ListMachinesGlobalOutput, error) {
	rows, err := h.svc.ListMachinesGlobal(viewerFrom(ctx), input.Q, input.BodyPart, input.Status)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list machines")
	}
	items := make([]models.MachineItem, len(rows))
	for i := range rows {
		if rows[i].ThumbnailURL != "" {
			if signed, err := h.upload.PresignGetURL(rows[i].ThumbnailURL); err == nil {
				rows[i].ThumbnailURL = signed
			}
		}
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
	rows, err := h.svc.ListGymPhotos(viewerFrom(ctx), input.GymID, input.Status)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list gym photos")
	}
	items := make([]models.PhotoItem, len(rows))
	for i, r := range rows {
		url, err := h.upload.PresignGetURL(r.ImageURL)
		if err != nil {
			url = r.ImageURL
		}
		items[i] = models.PhotoItem{ID: r.ID, ImageURL: url, Status: r.Status}
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
	rows, err := h.svc.ListMachinePhotos(viewerFrom(ctx), input.MachineID, input.Status)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list machine photos")
	}
	items := make([]models.PhotoItem, len(rows))
	for i, r := range rows {
		url, err := h.upload.PresignGetURL(r.ImageURL)
		if err != nil {
			url = r.ImageURL
		}
		items[i] = models.PhotoItem{ID: r.ID, ImageURL: url, Status: r.Status}
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
	photo, err := h.svc.SaveGymPhoto(viewerFrom(ctx), userID, input.GymID, input.Body.ImageURL)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to save gym photo")
	}
	out := &models.SaveGymPhotoOutput{}
	out.Body = models.PhotoItem{ID: photo.ID, ImageURL: photo.ImageURL, Status: photo.Status}
	return out, nil
}

func (h *GymHandler) SaveMachinePhoto(ctx context.Context, input *models.SaveMachinePhotoInput) (*models.SaveMachinePhotoOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	photo, err := h.svc.SaveMachinePhoto(viewerFrom(ctx), userID, input.MachineID, input.Body.ImageURL)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to save machine photo")
	}
	out := &models.SaveMachinePhotoOutput{}
	out.Body = models.PhotoItem{ID: photo.ID, ImageURL: photo.ImageURL, Status: photo.Status}
	return out, nil
}

// --- GymFavorite ---

func (h *GymHandler) AddGymFavorite(ctx context.Context, input *models.AddGymFavoriteInput) (*models.AddGymFavoriteOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	if err := h.svc.AddGymFavorite(viewerFrom(ctx), userID, input.GymID); err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error409Conflict("already favorited")
	}
	out := &models.AddGymFavoriteOutput{}
	out.Body.GymID = input.GymID
	return out, nil
}

func (h *GymHandler) RemoveGymFavorite(ctx context.Context, input *models.RemoveGymFavoriteInput) (*struct{}, error) {
	userID := middlewares.UserIDFromContext(ctx)
	if err := h.svc.RemoveGymFavorite(userID, input.GymID); err != nil {
		return nil, huma.Error500InternalServerError("failed to remove favorite")
	}
	return &struct{}{}, nil
}

func (h *GymHandler) ListGymFavorites(ctx context.Context, input *struct{}) (*models.ListGymFavoritesOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	rows, err := h.svc.ListGymFavorites(viewerFrom(ctx), userID)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to list favorites")
	}
	items := make([]models.GymItem, len(rows))
	for i := range rows {
		if rows[i].ThumbnailURL != "" {
			if signed, err := h.upload.PresignGetURL(rows[i].ThumbnailURL); err == nil {
				rows[i].ThumbnailURL = signed
			}
		}
		items[i] = gymToItem(&rows[i])
	}
	out := &models.ListGymFavoritesOutput{}
	out.Body.Items = items
	return out, nil
}

// --- GymEditRequest ---

func (h *GymHandler) CreateGymEditRequest(ctx context.Context, input *models.CreateGymEditRequestInput) (*models.CreateGymEditRequestOutput, error) {
	userID := middlewares.UserIDFromContext(ctx)
	r, err := h.svc.CreateGymEditRequest(viewerFrom(ctx), userID, input.GymID, input.Body.Category, input.Body.Body)
	if err != nil {
		if e := moderationError(err); e != nil {
			return nil, e
		}
		return nil, huma.Error500InternalServerError("failed to create edit request")
	}
	out := &models.CreateGymEditRequestOutput{}
	out.Body.ID = r.ID
	out.Body.GymID = r.GymID
	out.Body.Category = r.Category
	out.Body.Status = r.Status
	return out, nil
}

// --- Moderation ---

// requireAdmin is the server-side half of the moderation UI. The client also hides the
// buttons, but that is a convenience: the role it uses is a hint the server hands out,
// and a hint is not an authorisation.
func requireAdmin(ctx context.Context) error {
	if !middlewares.IsAdmin(ctx) {
		return huma.Error403Forbidden("admin only")
	}
	return nil
}

// logDecision records who decided what.
//
// Without it, the only trace of a moderation decision is the row's own status, which says
// nothing about who changed it or when — and a misused admin account would be invisible.
func logDecision(ctx context.Context, targetType, targetID, to string) {
	log.Printf("moderation: admin_user_id=%s target_type=%s target_id=%s from_status=%s to_status=%s",
		middlewares.UserIDFromContext(ctx), targetType, targetID, services.StatusPending, to)
}

// statusDecisionError maps the decision-specific failures. ErrNotPending is a 409 rather
// than a 404: the row exists, it has simply already been decided (or was never pending,
// which is how an attempt to take down published data lands here).
func statusDecisionError(err error) error {
	switch {
	case errors.Is(err, services.ErrInvalidStatusTransition):
		return huma.Error422UnprocessableEntity("status must be active or rejected")
	case errors.Is(err, services.ErrNotPending):
		return huma.Error409Conflict("only a pending row can be decided")
	default:
		return huma.Error500InternalServerError("failed to record decision")
	}
}

func statusOutput(id, status string) *models.SetStatusOutput {
	out := &models.SetStatusOutput{}
	out.Body.ID = id
	out.Body.Status = status
	return out
}

func (h *GymHandler) SetGymStatus(ctx context.Context, input *models.SetGymStatusInput) (*models.SetStatusOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	if err := h.svc.SetGymStatus(input.GymID, input.Body.Status); err != nil {
		return nil, statusDecisionError(err)
	}
	logDecision(ctx, "gym", input.GymID, input.Body.Status)
	return statusOutput(input.GymID, input.Body.Status), nil
}

func (h *GymHandler) SetMachineStatus(ctx context.Context, input *models.SetMachineStatusInput) (*models.SetStatusOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	if err := h.svc.SetMachineStatus(input.MachineID, input.Body.Status); err != nil {
		return nil, statusDecisionError(err)
	}
	logDecision(ctx, "machine", input.MachineID, input.Body.Status)
	return statusOutput(input.MachineID, input.Body.Status), nil
}

// The gymId in the path is not used for authorisation, and neither is machineId on the
// sibling route: the update matches on the photo id alone. Passing a photo id from a
// different gym therefore works, which is harmless while only admins can call this at all
// — an admin could reach the same photo through its own gym's URL.
//
// It stops being harmless the moment this is opened up, to gym owners for instance. Should
// that happen, the containment the URL already implies has to start being checked.
func (h *GymHandler) SetGymPhotoStatus(ctx context.Context, input *models.SetGymPhotoStatusInput) (*models.SetStatusOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	if err := h.svc.SetGymPhotoStatus(input.PhotoID, input.Body.Status); err != nil {
		return nil, statusDecisionError(err)
	}
	logDecision(ctx, "gym_photo", input.PhotoID, input.Body.Status)
	return statusOutput(input.PhotoID, input.Body.Status), nil
}

func (h *GymHandler) SetMachinePhotoStatus(ctx context.Context, input *models.SetMachinePhotoStatusInput) (*models.SetStatusOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	if err := h.svc.SetMachinePhotoStatus(input.PhotoID, input.Body.Status); err != nil {
		return nil, statusDecisionError(err)
	}
	logDecision(ctx, "machine_photo", input.PhotoID, input.Body.Status)
	return statusOutput(input.PhotoID, input.Body.Status), nil
}

func (h *GymHandler) ModerationCounts(ctx context.Context, _ *struct{}) (*models.ModerationCountsOutput, error) {
	if err := requireAdmin(ctx); err != nil {
		return nil, err
	}
	q, err := h.svc.ModerationCounts()
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to read moderation counts")
	}
	toItem := func(d services.QueueDepth) models.QueueDepthItem {
		return models.QueueDepthItem{
			Pending:               d.Pending,
			OldestPendingAgeHours: d.OldestPendingAgeHours,
		}
	}
	out := &models.ModerationCountsOutput{}
	out.Body.Gyms = toItem(q.Gyms)
	out.Body.Machines = toItem(q.Machines)
	out.Body.GymPhotos = toItem(q.GymPhotos)
	out.Body.MachinePhotos = toItem(q.MachinePhotos)
	return out, nil
}
