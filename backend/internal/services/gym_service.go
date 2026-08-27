package services

import (
	"time"

	"gorm.io/gorm"
)

type Gym struct {
	ID               string `gorm:"primaryKey;type:varchar(36)"`
	Name             string
	Address          string
	Latitude         float64
	Longitude        float64
	VisitorFee       int  `gorm:"column:visitor_fee"`
	MonthlyFee       int  `gorm:"column:monthly_fee"`
	VisitorAvailable bool `gorm:"column:visitor_available"`
	Description      string
	Hours            string    `gorm:"column:hours"`
	HasParking       bool      `gorm:"column:has_parking"`
	HasShower        bool      `gorm:"column:has_shower"`
	HasLockerRoom    bool      `gorm:"column:has_locker_room"`
	DumbbellMaxKg    *int      `gorm:"column:dumbbell_max_kg"`
	BarbellType      *string   `gorm:"column:barbell_type"`
	PowerRackCount   *int      `gorm:"column:power_rack_count"`
	SourceType       string    `gorm:"column:source_type;default:user"`
	LastUpdatedAt    time.Time `gorm:"column:last_updated_at;autoUpdateTime"`
	CreatedAt        time.Time `gorm:"column:created_at"`
	CreatedByUserID  string    `gorm:"column:created_by_user_id"`
	// Status is the moderation lifecycle: pending until an admin acts on it.
	// The column defaults to active so existing rows stay public; new rows are set to
	// pending explicitly in CreateGym.
	Status string `gorm:"default:active"`
	// computed
	Rating       float64 `gorm:"-"`
	MachineCount int     `gorm:"-"`
	ThumbnailURL string  `gorm:"-"`
	IsFavorited  bool    `gorm:"-"`
	DistanceKm   float64 `gorm:"-"`
}

func (Gym) TableName() string { return "gyms" }

type Machine struct {
	ID              string `gorm:"primaryKey;type:varchar(36)"`
	Name            string
	Manufacturer    *string   `gorm:"column:manufacturer"`
	BodyPart        *string   `gorm:"column:body_part"`
	Category        *string   `gorm:"column:category"`
	Notes           *string   `gorm:"column:notes"`
	CreatedByUserID string    `gorm:"column:created_by_user_id"`
	CreatedAt       time.Time `gorm:"column:created_at"`
	// Status mirrors Gym.Status; see the note there about the asymmetric default.
	Status string `gorm:"default:active"`
	// computed
	HelpfulTotal int    `gorm:"-"`
	ReplyCount   int    `gorm:"-"`
	ThreadCount  int    `gorm:"-"`
	ThumbnailURL string `gorm:"-"`
}

func (Machine) TableName() string { return "machines" }

type GymMachine struct {
	GymID     string `gorm:"primaryKey;column:gym_id"`
	MachineID string `gorm:"primaryKey;column:machine_id"`
}

func (GymMachine) TableName() string { return "gym_machines" }

type GymPhoto struct {
	ID               string    `gorm:"primaryKey;type:varchar(36)"`
	GymID            string    `gorm:"column:gym_id"`
	ImageURL         string    `gorm:"column:image_url"`
	UploadedByUserID string    `gorm:"column:uploaded_by_user_id"`
	Status           string    `gorm:"default:active"`
	CreatedAt        time.Time `gorm:"column:created_at"`
}

func (GymPhoto) TableName() string { return "gym_photos" }

type MachinePhoto struct {
	ID               string    `gorm:"primaryKey;type:varchar(36)"`
	MachineID        string    `gorm:"column:machine_id"`
	ImageURL         string    `gorm:"column:image_url"`
	UploadedByUserID string    `gorm:"column:uploaded_by_user_id"`
	Status           string    `gorm:"default:active"`
	CreatedAt        time.Time `gorm:"column:created_at"`
}

func (MachinePhoto) TableName() string { return "machine_photos" }

type GymEditRequest struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)"`
	GymID     string    `gorm:"column:gym_id"`
	UserID    string    `gorm:"column:user_id"`
	Category  string    `gorm:"column:category"`
	Body      string    `gorm:"column:body"`
	Status    string    `gorm:"default:pending"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (GymEditRequest) TableName() string { return "gym_edit_requests" }

type GymFavorite struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `gorm:"column:user_id"`
	GymID     string    `gorm:"column:gym_id"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (GymFavorite) TableName() string { return "gym_favorites" }

type gymRating struct {
	Total float64
}

type GymService struct {
	db *gorm.DB
	// upload is here only to validate that a submitted image URL points at our own
	// bucket. Photo rows are the moderation boundary, so the check has to happen where
	// the row is written rather than where the upload is presigned.
	upload *UploadService
}

func NewGymService(db *gorm.DB) *GymService {
	return &GymService{db: db, upload: NewUploadService()}
}

// NearQuery asks for gyms ordered by distance from a point.
// RadiusKm is optional; when nil the whole set is returned, nearest first.
type NearQuery struct {
	Lat      float64
	Lng      float64
	RadiusKm *float64
}

// gymWithDistance carries the SQL-computed distance alongside the gym row.
type gymWithDistance struct {
	Gym
	DistanceKm float64 `gorm:"column:distance_km"`
}

// Gyms without coordinates are excluded from proximity results — a gym whose location is
// unknown cannot honestly be called "near" anything.
const hasCoordinatesSQL = `gyms.latitude IS NOT NULL AND gyms.longitude IS NOT NULL
	AND NOT (gyms.latitude = 0 AND gyms.longitude = 0)`

// ST_Distance_Sphere takes POINT(x, y) as POINT(longitude, latitude) and returns metres.
const distanceKmSQL = `ST_Distance_Sphere(POINT(gyms.longitude, gyms.latitude), POINT(?, ?)) / 1000`

// listGymsNear returns gyms ordered by distance from the given point.
//
// Proximity results are a single page of the nearest matches rather than a cursor-paged
// feed: the natural ordering key is distance, which ties freely and would make a cursor
// skip or repeat rows at a page boundary. Callers get the closest `limit` gyms and no
// next cursor.
func (s *GymService) listGymsNear(v Viewer, limit int, search, statusFilter string, near NearQuery) ([]Gym, string, error) {
	q, err := s.scoped(v, tblGyms, statusFilter)
	if err != nil {
		return nil, "", err
	}
	// The visibility predicate is attached before this chain, and GORM emits SELECT before
	// WHERE, so the bound values come out as
	//   [near.Lng, near.Lat] [visibility...] [search?] [radius?] [limit]
	// TestListGymsNearBindsArgumentsInSelectThenWhereOrder pins that ordering, because
	// getting it wrong here feeds the wrong numbers to ST_Distance_Sphere rather than
	// failing outright.
	q = q.Model(&Gym{}).
		Select("gyms.*, "+distanceKmSQL+" AS distance_km", near.Lng, near.Lat).
		Where(hasCoordinatesSQL).
		Order("distance_km ASC").
		Limit(limit)

	if search != "" {
		q = q.Where("gyms.name LIKE ?", "%"+search+"%")
	}
	if near.RadiusKm != nil {
		q = q.Having("distance_km <= ?", *near.RadiusKm)
	}

	var scanned []gymWithDistance
	if err := q.Scan(&scanned).Error; err != nil {
		return nil, "", err
	}

	rows := make([]Gym, len(scanned))
	for i := range scanned {
		rows[i] = scanned[i].Gym
		rows[i].DistanceKm = scanned[i].DistanceKm
	}
	s.attachGymStats(v, rows)
	return rows, "", nil
}

func (s *GymService) ListGyms(v Viewer, cursor string, limit int, search, statusFilter string, near *NearQuery) ([]Gym, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	// Proximity and cursor paging build separate statements. Both have to be filtered:
	// leaving either one alone would keep pending gyms off one screen and on the other.
	if near != nil {
		return s.listGymsNear(v, limit, search, statusFilter, *near)
	}
	q, err := s.scoped(v, tblGyms, statusFilter)
	if err != nil {
		return nil, "", err
	}
	q = q.Order("gyms.created_at DESC").Limit(limit + 1)
	if cursor != "" {
		q = q.Where("gyms.created_at < ?", cursor)
	}
	if search != "" {
		q = q.Where("gyms.name LIKE ?", "%"+search+"%")
	}
	var rows []Gym
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	s.attachGymStats(v, rows)

	next := ""
	if len(rows) > limit {
		next = rows[limit].CreatedAt.Format(time.RFC3339Nano)
		rows = rows[:limit]
	}
	return rows, next, nil
}

// attachGymStats fills in MachineCount and ThumbnailURL for each row in place.
// Shared by the cursor-paged listing and the proximity listing so both return the same
// derived fields without repeating the two aggregate queries.
//
// The two queries live in separate functions rather than here because the static check
// works per function: a single function holding one filtered and one unfiltered query
// would pass on the strength of the filtered one, and the second query would never be
// looked at again.
func (s *GymService) attachGymStats(v Viewer, rows []Gym) {
	s.attachGymMachineCounts(v, rows)
	s.attachGymThumbnails(rows)
}

// attachGymMachineCounts counts only the machines the viewer is allowed to know about.
// Counting the link table alone would report "5 machines" on a gym whose list shows two,
// which leaks the existence of pending machines through the number.
func (s *GymService) attachGymMachineCounts(v Viewer, rows []Gym) {
	if len(rows) == 0 {
		return
	}
	ids := gymIDs(rows)
	q, err := s.scoped(v, tblMachines, "")
	if err != nil {
		return
	}
	var counts []struct {
		GymID string `gorm:"column:gym_id"`
		Cnt   int    `gorm:"column:cnt"`
	}
	q.Table("gym_machines gm").
		Select("gm.gym_id AS gym_id, COUNT(*) AS cnt").
		Joins("INNER JOIN machines ON machines.id = gm.machine_id").
		Where("gm.gym_id IN ?", ids).
		Group("gm.gym_id").
		Scan(&counts)

	countMap := make(map[string]int, len(counts))
	for _, c := range counts {
		countMap[c.GymID] = c.Cnt
	}
	for i := range rows {
		rows[i].MachineCount = countMap[rows[i].ID]
	}
}

// The subquery already restricts itself to active photos, so a pending upload can never
// become the picture the whole listing shows.
//
//moderation:exempt: サブクエリで status='active' を直接指定済み（公開済み写真のみ）
func (s *GymService) attachGymThumbnails(rows []Gym) {
	if len(rows) == 0 {
		return
	}
	ids := gymIDs(rows)
	var gymThumbs []struct {
		GymID    string `gorm:"column:gym_id"`
		ImageURL string `gorm:"column:image_url"`
	}
	s.db.Raw(`SELECT t1.gym_id, t1.image_url FROM gym_photos t1 INNER JOIN (SELECT gym_id, MIN(id) AS min_id FROM gym_photos WHERE status = 'active' GROUP BY gym_id) t2 ON t1.gym_id = t2.gym_id AND t1.id = t2.min_id WHERE t1.gym_id IN ?`, ids).Scan(&gymThumbs)
	gymThumbMap := map[string]string{}
	for _, t := range gymThumbs {
		gymThumbMap[t.GymID] = t.ImageURL
	}
	for i := range rows {
		rows[i].ThumbnailURL = gymThumbMap[rows[i].ID]
	}
}

func gymIDs(rows []Gym) []string {
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return ids
}

// The column default is active so that the migration leaves existing rows public; new
// rows are pending, and that difference is set here rather than in the schema.
//
//moderation:exempt: 新規作成のみ。既存行を1件も読まない
func (s *GymService) CreateGym(userID string, g *Gym) (*Gym, error) {
	g.ID = newUUID()
	g.CreatedByUserID = userID
	g.Status = StatusPending
	if err := s.db.Create(g).Error; err != nil {
		return nil, err
	}
	return g, nil
}

// GetGym returns the gym only if the viewer is allowed to see it. A gym they may not see
// is reported as ErrRecordNotFound rather than a distinct "forbidden", so that guessing
// an id tells the caller nothing the listing would not already have told them.
func (s *GymService) GetGym(v Viewer, id string) (*Gym, error) {
	q, err := s.scoped(v, tblGyms, "")
	if err != nil {
		return nil, err
	}
	var g Gym
	if err := q.Where("gyms.id = ?", id).First(&g).Error; err != nil {
		return nil, err
	}
	g.Rating = s.gymThreadRating(id)
	if v.UserID != "" {
		g.IsFavorited = s.isGymFavorited(v.UserID, id)
	}
	return &g, nil
}

// gymThreadRating sums engagement across the gym's threads.
//
//moderation:exempt: threads と posts だけを読む。gyms には触れない
func (s *GymService) gymThreadRating(gymID string) float64 {
	var r struct{ Total float64 }
	s.db.Raw(`
		SELECT COALESCE(SUM(ps.reply_count + ps.helpful_total), 0) AS total
		FROM threads t
		LEFT JOIN (
			SELECT thread_id,
				COUNT(*) AS reply_count,
				COALESCE(SUM(helpful_count), 0) AS helpful_total
			FROM posts WHERE status = 'active'
			GROUP BY thread_id
		) ps ON ps.thread_id = t.id
		WHERE t.gym_id = ? AND t.status = 'active'
	`, gymID).Scan(&r)
	return r.Total
}

//moderation:exempt: gym_favorites だけを読む。gyms には触れない
func (s *GymService) isGymFavorited(userID, gymID string) bool {
	var cnt int64
	s.db.Model(&GymFavorite{}).Where("user_id = ? AND gym_id = ?", userID, gymID).Count(&cnt)
	return cnt > 0
}

func (s *GymService) ListMachines(v Viewer, gymID, statusFilter string) ([]Machine, error) {
	q, err := s.scoped(v, tblMachines, statusFilter)
	if err != nil {
		return nil, err
	}
	var rows []Machine
	if err := q.
		Joins("INNER JOIN gym_machines gm ON gm.machine_id = machines.id").
		Where("gm.gym_id = ?", gymID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	s.attachMachineStats(rows)
	return rows, nil
}

// The link row carries no status of its own; gym_machines is a join table and the
// machine's own status is what decides whether the pair is visible.
//
//moderation:exempt: 対象ジムの可視性は requireVisibleGym で検証済み
func (s *GymService) CreateMachine(v Viewer, userID, gymID string, m *Machine) (*Machine, error) {
	if err := s.requireVisibleGym(v, gymID); err != nil {
		return nil, err
	}
	m.ID = newUUID()
	m.CreatedByUserID = userID
	m.Status = StatusPending
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(m).Error; err != nil {
			return err
		}
		return tx.Create(&GymMachine{GymID: gymID, MachineID: m.ID}).Error
	})
	if err != nil {
		return nil, err
	}
	return m, nil
}

// LinkMachine associates an EXISTING machine with a gym (many-to-many, no
// quantity). Unlike CreateMachine, this does not create a new Machine row — it
// lets the same machine be reused across multiple gyms.
//
//moderation:exempt: ジムとマシンの可視性・承認状態は下の2つの require で検証済み
func (s *GymService) LinkMachine(v Viewer, gymID, machineID string) error {
	if err := s.requireVisibleGym(v, gymID); err != nil {
		return err
	}
	if err := s.requireLinkableMachine(v, machineID); err != nil {
		return err
	}
	gm := &GymMachine{GymID: gymID, MachineID: machineID}
	return s.db.Create(gm).Error
}

// UnlinkMachine removes the association between an existing machine and a gym. The
// Machine row itself is untouched — other gyms may still reference it.
//
//moderation:exempt: 認可は requireGymOwner で検証済み。gym_machines のみを削除する
func (s *GymService) UnlinkMachine(v Viewer, gymID, machineID string) error {
	if err := s.requireGymOwner(v, gymID); err != nil {
		return err
	}
	return s.db.Where("gym_id = ? AND machine_id = ?", gymID, machineID).Delete(&GymMachine{}).Error
}

// GetMachine mirrors GetGym: invisible machines are indistinguishable from missing ones.
func (s *GymService) GetMachine(v Viewer, id string) (*Machine, error) {
	q, err := s.scoped(v, tblMachines, "")
	if err != nil {
		return nil, err
	}
	var m Machine
	if err := q.Where("machines.id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	m.HelpfulTotal, m.ReplyCount = s.machineThreadStats(id)
	return &m, nil
}

//moderation:exempt: threads と posts だけを読む。machines には触れない
func (s *GymService) machineThreadStats(machineID string) (helpful, replies int) {
	var r struct {
		HelpfulTotal int
		ReplyCount   int
	}
	s.db.Raw(`
		SELECT
			COALESCE(SUM(ps.helpful_total), 0) AS helpful_total,
			COALESCE(SUM(ps.reply_count), 0) AS reply_count
		FROM threads t
		LEFT JOIN (
			SELECT thread_id,
				COUNT(*) AS reply_count,
				COALESCE(SUM(helpful_count), 0) AS helpful_total
			FROM posts WHERE status = 'active'
			GROUP BY thread_id
		) ps ON ps.thread_id = t.id
		WHERE t.machine_id = ? AND t.status = 'active'
	`, machineID).Scan(&r)
	return r.HelpfulTotal, r.ReplyCount
}

func (s *GymService) ListMachinesGlobal(v Viewer, query, bodyPart, statusFilter string) ([]Machine, error) {
	db, err := s.scoped(v, tblMachines, statusFilter)
	if err != nil {
		return nil, err
	}
	db = db.Model(&Machine{}).Order("created_at DESC").Limit(50)
	if query != "" {
		db = db.Where("name LIKE ? OR manufacturer LIKE ?", "%"+query+"%", "%"+query+"%")
	}
	if bodyPart != "" {
		db = db.Where("body_part = ?", bodyPart)
	}
	var rows []Machine
	if err := db.Find(&rows).Error; err != nil {
		return nil, err
	}
	s.attachMachineStats(rows)
	return rows, nil
}

// attachMachineStats fills in ThreadCount and ThumbnailURL for each row in place.
// Shared by ListMachines (gym-scoped) and ListMachinesGlobal so both listings show the
// same thread count and cover photo without duplicating the two aggregate queries.
func (s *GymService) attachMachineStats(rows []Machine) {
	if len(rows) == 0 {
		return
	}
	s.attachMachineThreadCounts(rows)
	s.attachMachineThumbnails(rows)
}

//moderation:exempt: threads だけを読む。machines には触れない
func (s *GymService) attachMachineThreadCounts(rows []Machine) {
	ids := machineIDs(rows)
	var threadCounts []struct {
		MachineID string `gorm:"column:machine_id"`
		Count     int    `gorm:"column:count"`
	}
	s.db.Raw(`SELECT machine_id, COUNT(*) AS count FROM threads WHERE machine_id IN ? AND status = 'active' GROUP BY machine_id`, ids).Scan(&threadCounts)
	tcMap := map[string]int{}
	for _, tc := range threadCounts {
		tcMap[tc.MachineID] = tc.Count
	}
	for i := range rows {
		rows[i].ThreadCount = tcMap[rows[i].ID]
	}
}

// As with the gym thumbnails, the subquery pins itself to active photos so a pending
// upload cannot become the cover image.
//
//moderation:exempt: サブクエリで status='active' を直接指定済み（公開済み写真のみ）
func (s *GymService) attachMachineThumbnails(rows []Machine) {
	ids := machineIDs(rows)
	var thumbs []struct {
		MachineID string `gorm:"column:machine_id"`
		ImageURL  string `gorm:"column:image_url"`
	}
	s.db.Raw(`SELECT t1.machine_id, t1.image_url FROM machine_photos t1 INNER JOIN (SELECT machine_id, MIN(id) AS min_id FROM machine_photos WHERE status = 'active' GROUP BY machine_id) t2 ON t1.machine_id = t2.machine_id AND t1.id = t2.min_id WHERE t1.machine_id IN ?`, ids).Scan(&thumbs)
	thumbMap := map[string]string{}
	for _, t := range thumbs {
		thumbMap[t.MachineID] = t.ImageURL
	}
	for i := range rows {
		rows[i].ThumbnailURL = thumbMap[rows[i].ID]
	}
}

func machineIDs(rows []Machine) []string {
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return ids
}

//moderation:exempt: 新規作成のみ。既存行を1件も読まない
func (s *GymService) CreateMachineGlobal(userID string, m *Machine) (*Machine, error) {
	m.ID = newUUID()
	m.CreatedByUserID = userID
	m.Status = StatusPending
	if err := s.db.Create(m).Error; err != nil {
		return nil, err
	}
	return m, nil
}

// --- Photos ---

func (s *GymService) ListGymPhotos(v Viewer, gymID, statusFilter string) ([]GymPhoto, error) {
	q, err := s.scoped(v, tblGymPhotos, statusFilter)
	if err != nil {
		return nil, err
	}
	var rows []GymPhoto
	if err := q.Where("gym_photos.gym_id = ?", gymID).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// This, not the presign endpoint, is the gate on photos. Presigning is available to any
// authenticated caller through a generic upload route, so guarding it would only move the
// same capability one URL to the left; a photo does not exist until a row points at it.
//
//moderation:exempt: 対象ジムと image_url は下の2つの検証で確認済み
func (s *GymService) SaveGymPhoto(v Viewer, userID, gymID, imageURL string) (*GymPhoto, error) {
	if err := s.requireVisibleGym(v, gymID); err != nil {
		return nil, err
	}
	if !s.upload.IsOwnedObjectURL(imageURL) {
		return nil, ErrForeignImageURL
	}
	p := &GymPhoto{
		ID:               newUUID(),
		GymID:            gymID,
		ImageURL:         imageURL,
		UploadedByUserID: userID,
		Status:           StatusPending,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func (s *GymService) ListMachinePhotos(v Viewer, machineID, statusFilter string) ([]MachinePhoto, error) {
	q, err := s.scoped(v, tblMachinePhotos, statusFilter)
	if err != nil {
		return nil, err
	}
	var rows []MachinePhoto
	if err := q.Where("machine_photos.machine_id = ?", machineID).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

//moderation:exempt: 対象マシンと image_url は下の2つの検証で確認済み
func (s *GymService) SaveMachinePhoto(v Viewer, userID, machineID, imageURL string) (*MachinePhoto, error) {
	if err := s.requireVisibleMachine(v, machineID); err != nil {
		return nil, err
	}
	if !s.upload.IsOwnedObjectURL(imageURL) {
		return nil, ErrForeignImageURL
	}
	p := &MachinePhoto{
		ID:               newUUID(),
		MachineID:        machineID,
		ImageURL:         imageURL,
		UploadedByUserID: userID,
		Status:           StatusPending,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// --- GymFavorite ---

// Bookmarking is what made a hidden gym readable: the favourites listing joins straight
// through to gyms, so a row nobody was allowed to fetch could be reached by first
// bookmarking it. The check belongs here as much as on the listing.
//
//moderation:exempt: 対象ジムの可視性は requireVisibleGym で検証済み
func (s *GymService) AddGymFavorite(v Viewer, userID, gymID string) error {
	if err := s.requireVisibleGym(v, gymID); err != nil {
		return err
	}
	f := &GymFavorite{
		ID:     newUUID(),
		UserID: userID,
		GymID:  gymID,
	}
	return s.db.Create(f).Error
}

// Removing a bookmark stays open even for a gym that has since been hidden — otherwise a
// rejected gym would be stuck in the user's list with no way to clear it.
//
//moderation:exempt: 自分の favorite 行を削除するだけで gyms を1度も読まない
func (s *GymService) RemoveGymFavorite(userID, gymID string) error {
	return s.db.Where("user_id = ? AND gym_id = ?", userID, gymID).Delete(&GymFavorite{}).Error
}

// ListGymFavorites joins straight through to gyms, which made it the way a pending gym
// could be read after AddGymFavorite let one be bookmarked — the listing walked around
// the 404 on GetGym. It is filtered like any other read of gyms; the write side is
// guarded in AddGymFavorite.
//
// The filter also means a gym that gets rejected after being bookmarked drops out of the
// list, instead of lingering as a favourite nobody else can see.
func (s *GymService) ListGymFavorites(v Viewer, userID string) ([]Gym, error) {
	q, err := s.scoped(v, tblGyms, "")
	if err != nil {
		return nil, err
	}
	var rows []Gym
	if err := q.
		Joins("INNER JOIN gym_favorites gf ON gf.gym_id = gyms.id").
		Where("gf.user_id = ?", userID).
		Order("gf.created_at DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for i := range rows {
		rows[i].IsFavorited = true
	}
	return rows, nil
}

// --- GymEditRequest ---

//moderation:exempt: 対象ジムの可視性は requireVisibleGym で検証済み
func (s *GymService) CreateGymEditRequest(v Viewer, userID, gymID, category, body string) (*GymEditRequest, error) {
	if err := s.requireVisibleGym(v, gymID); err != nil {
		return nil, err
	}
	r := &GymEditRequest{
		ID:       newUUID(),
		GymID:    gymID,
		UserID:   userID,
		Category: category,
		Body:     body,
	}
	if err := s.db.Create(r).Error; err != nil {
		return nil, err
	}
	return r, nil
}
