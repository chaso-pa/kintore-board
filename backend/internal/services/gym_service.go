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
	ID               string `gorm:"primaryKey;type:varchar(36)"`
	GymID            string `gorm:"column:gym_id"`
	ImageURL         string `gorm:"column:image_url"`
	UploadedByUserID string `gorm:"column:uploaded_by_user_id"`
	Status           string `gorm:"default:active"`
}

func (GymPhoto) TableName() string { return "gym_photos" }

type MachinePhoto struct {
	ID               string `gorm:"primaryKey;type:varchar(36)"`
	MachineID        string `gorm:"column:machine_id"`
	ImageURL         string `gorm:"column:image_url"`
	UploadedByUserID string `gorm:"column:uploaded_by_user_id"`
	Status           string `gorm:"default:active"`
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
}

func NewGymService(db *gorm.DB) *GymService {
	return &GymService{db: db}
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
func (s *GymService) listGymsNear(limit int, search string, near NearQuery) ([]Gym, string, error) {
	q := s.db.Model(&Gym{}).
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
	s.attachGymStats(rows)
	return rows, "", nil
}

func (s *GymService) ListGyms(cursor string, limit int, search string, near *NearQuery) ([]Gym, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if near != nil {
		return s.listGymsNear(limit, search, *near)
	}
	q := s.db.Order("gyms.created_at DESC").Limit(limit + 1)
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
	s.attachGymStats(rows)

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
func (s *GymService) attachGymStats(rows []Gym) {
	if len(rows) == 0 {
		return
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	var counts []struct {
		GymID string
		Cnt   int
	}
	s.db.Raw(`
		SELECT gym_id, COUNT(*) AS cnt
		FROM gym_machines
		WHERE gym_id IN ?
		GROUP BY gym_id
	`, ids).Scan(&counts)
	countMap := make(map[string]int, len(counts))
	for _, c := range counts {
		countMap[c.GymID] = c.Cnt
	}
	for i := range rows {
		rows[i].MachineCount = countMap[rows[i].ID]
	}
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

func (s *GymService) CreateGym(userID string, g *Gym) (*Gym, error) {
	g.ID = newUUID()
	g.CreatedByUserID = userID
	if err := s.db.Create(g).Error; err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GymService) GetGym(id, userID string) (*Gym, error) {
	var g Gym
	if err := s.db.Where("id = ?", id).First(&g).Error; err != nil {
		return nil, err
	}
	// compute rating from threads linked to this gym
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
	`, id).Scan(&r)
	g.Rating = r.Total
	if userID != "" {
		var cnt int64
		s.db.Model(&GymFavorite{}).Where("user_id = ? AND gym_id = ?", userID, id).Count(&cnt)
		g.IsFavorited = cnt > 0
	}
	return &g, nil
}

func (s *GymService) ListMachines(gymID string) ([]Machine, error) {
	var rows []Machine
	if err := s.db.
		Joins("INNER JOIN gym_machines gm ON gm.machine_id = machines.id").
		Where("gm.gym_id = ?", gymID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	s.attachMachineStats(rows)
	return rows, nil
}

func (s *GymService) CreateMachine(userID, gymID string, m *Machine) (*Machine, error) {
	m.ID = newUUID()
	m.CreatedByUserID = userID
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
func (s *GymService) LinkMachine(gymID, machineID string) error {
	gm := &GymMachine{GymID: gymID, MachineID: machineID}
	return s.db.Create(gm).Error
}

// UnlinkMachine removes the association between an existing machine and a gym. The
// Machine row itself is untouched — other gyms may still reference it.
func (s *GymService) UnlinkMachine(gymID, machineID string) error {
	return s.db.Where("gym_id = ? AND machine_id = ?", gymID, machineID).Delete(&GymMachine{}).Error
}

func (s *GymService) GetMachine(id string) (*Machine, error) {
	var m Machine
	if err := s.db.Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	// compute aggregated stats from machine's threads
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
	`, id).Scan(&r)
	m.HelpfulTotal = r.HelpfulTotal
	m.ReplyCount = r.ReplyCount
	return &m, nil
}

func (s *GymService) ListMachinesGlobal(q, bodyPart string) ([]Machine, error) {
	db := s.db.Model(&Machine{}).Order("created_at DESC").Limit(50)
	if q != "" {
		db = db.Where("name LIKE ? OR manufacturer LIKE ?", "%"+q+"%", "%"+q+"%")
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
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	var threadCounts []struct {
		MachineID string `gorm:"column:machine_id"`
		Count     int    `gorm:"column:count"`
	}
	s.db.Raw(`SELECT machine_id, COUNT(*) AS count FROM threads WHERE machine_id IN ? AND status = 'active' GROUP BY machine_id`, ids).Scan(&threadCounts)
	tcMap := map[string]int{}
	for _, tc := range threadCounts {
		tcMap[tc.MachineID] = tc.Count
	}
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
		rows[i].ThreadCount = tcMap[rows[i].ID]
		rows[i].ThumbnailURL = thumbMap[rows[i].ID]
	}
}

func (s *GymService) CreateMachineGlobal(userID string, m *Machine) (*Machine, error) {
	m.ID = newUUID()
	m.CreatedByUserID = userID
	if err := s.db.Create(m).Error; err != nil {
		return nil, err
	}
	return m, nil
}

// --- Photos ---

func (s *GymService) ListGymPhotos(gymID string) ([]GymPhoto, error) {
	var rows []GymPhoto
	if err := s.db.Where("gym_id = ? AND status = ?", gymID, "active").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *GymService) SaveGymPhoto(userID, gymID, imageURL string) (*GymPhoto, error) {
	p := &GymPhoto{
		ID:               newUUID(),
		GymID:            gymID,
		ImageURL:         imageURL,
		UploadedByUserID: userID,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func (s *GymService) ListMachinePhotos(machineID string) ([]MachinePhoto, error) {
	var rows []MachinePhoto
	if err := s.db.Where("machine_id = ? AND status = ?", machineID, "active").Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *GymService) SaveMachinePhoto(userID, machineID, imageURL string) (*MachinePhoto, error) {
	p := &MachinePhoto{
		ID:               newUUID(),
		MachineID:        machineID,
		ImageURL:         imageURL,
		UploadedByUserID: userID,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// --- GymFavorite ---

func (s *GymService) AddGymFavorite(userID, gymID string) error {
	f := &GymFavorite{
		ID:     newUUID(),
		UserID: userID,
		GymID:  gymID,
	}
	return s.db.Create(f).Error
}

func (s *GymService) RemoveGymFavorite(userID, gymID string) error {
	return s.db.Where("user_id = ? AND gym_id = ?", userID, gymID).Delete(&GymFavorite{}).Error
}

func (s *GymService) ListGymFavorites(userID string) ([]Gym, error) {
	var rows []Gym
	if err := s.db.
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

func (s *GymService) CreateGymEditRequest(userID, gymID, category, body string) (*GymEditRequest, error) {
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
