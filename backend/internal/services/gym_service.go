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
	SourceType       string    `gorm:"column:source_type;default:user"`
	LastUpdatedAt    time.Time `gorm:"column:last_updated_at;autoUpdateTime"`
	CreatedAt        time.Time `gorm:"column:created_at"`
	CreatedByUserID  string    `gorm:"column:created_by_user_id"`
}

func (Gym) TableName() string { return "gyms" }

type Machine struct {
	ID              string    `gorm:"primaryKey;type:varchar(36)"`
	GymID           string    `gorm:"column:gym_id"`
	Name            string
	Manufacturer    *string   `gorm:"column:manufacturer"`
	BodyPart        *string   `gorm:"column:body_part"`
	Category        *string   `gorm:"column:category"`
	Notes           *string   `gorm:"column:notes"`
	CreatedByUserID string    `gorm:"column:created_by_user_id"`
	CreatedAt       time.Time `gorm:"column:created_at"`
}

func (Machine) TableName() string { return "machines" }

type GymService struct {
	db *gorm.DB
}

func NewGymService(db *gorm.DB) *GymService {
	return &GymService{db: db}
}

func (s *GymService) ListGyms(cursor string, limit int) ([]Gym, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := s.db.Order("created_at DESC").Limit(limit + 1)
	if cursor != "" {
		q = q.Where("created_at < ?", cursor)
	}
	var rows []Gym
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		next = rows[limit-1].CreatedAt.Format(time.RFC3339Nano)
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
	return &g, nil
}

func (s *GymService) ListMachines(gymID string) ([]Machine, error) {
	var rows []Machine
	if err := s.db.Where("gym_id = ?", gymID).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *GymService) CreateMachine(userID, gymID string, m *Machine) (*Machine, error) {
	m.ID = newUUID()
	m.GymID = gymID
	m.CreatedByUserID = userID
	if err := s.db.Create(m).Error; err != nil {
		return nil, err
	}
	return m, nil
}

func (s *GymService) GetMachine(id string) (*Machine, error) {
	var m Machine
	if err := s.db.Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}
