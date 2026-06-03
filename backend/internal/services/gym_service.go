package services

import (
	"time"

	"gorm.io/gorm"
)

type Gym struct {
	ID               string    `gorm:"primaryKey;type:varchar(36)"`
	Name             string
	Address          string
	Latitude         float64
	Longitude        float64
	VisitorFee       int       `gorm:"column:visitor_fee"`
	MonthlyFee       int       `gorm:"column:monthly_fee"`
	VisitorAvailable bool      `gorm:"column:visitor_available"`
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
}

func (Gym) TableName() string { return "gyms" }

type Machine struct {
	ID              string    `gorm:"primaryKey;type:varchar(36)"`
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

type gymRating struct {
	Total float64
}

type GymService struct {
	db *gorm.DB
}

func NewGymService(db *gorm.DB) *GymService {
	return &GymService{db: db}
}

func (s *GymService) ListGyms(cursor string, limit int, search string) ([]Gym, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
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
	if len(rows) > 0 {
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
	next := ""
	if len(rows) > limit {
		next = rows[limit].CreatedAt.Format(time.RFC3339Nano)
		rows = rows[:limit]
	}
	return rows, next, nil
}

func (s *GymService) CreateGym(userID string, g *Gym) (*Gym, error) {
	g.ID = newUUID()
	g.CreatedByUserID = userID
	if err := s.db.Create(g).Error; err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GymService) GetGym(id string) (*Gym, error) {
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
	if len(rows) == 0 {
		return rows, nil
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
	return rows, nil
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
