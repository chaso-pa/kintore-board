package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/chaso-pa/gin-template/internal/utils"
	"gorm.io/gorm"
)

type Thread struct {
	ID              string    `gorm:"primaryKey;type:varchar(36)"`
	Type            string
	Title           string
	Category        *string   `gorm:"column:category"`
	GymID           *string   `gorm:"column:gym_id"`
	MachineID       *string   `gorm:"column:machine_id"`
	CreatedByUserID string    `gorm:"column:created_by_user_id"`
	CreatedAt       time.Time `gorm:"column:created_at"`
	Status          string    `gorm:"default:active"`
}

func (Thread) TableName() string { return "threads" }

type Post struct {
	ID                string    `gorm:"primaryKey;type:varchar(36)"`
	ThreadID          string    `gorm:"column:thread_id"`
	UserID            string    `gorm:"column:user_id"`
	AnonymousThreadID string    `gorm:"column:anonymous_thread_id"`
	Body              string
	HelpfulCount      int       `gorm:"column:helpful_count;default:0"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	Status            string    `gorm:"default:active"`
}

func (Post) TableName() string { return "posts" }

type ThreadService struct {
	db     *gorm.DB
	secret string
}

func NewThreadService(db *gorm.DB, secret string) *ThreadService {
	return &ThreadService{db: db, secret: secret}
}

// parseCursor decodes a composite cursor of the form "rfc3339nano|uuid".
func parseCursor(cursor string) (time.Time, string) {
	parts := strings.SplitN(cursor, "|", 2)
	if len(parts) != 2 {
		return time.Time{}, ""
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, ""
	}
	return t, parts[1]
}

func encodeCursor(t time.Time, id string) string {
	return fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), id)
}

func (s *ThreadService) ListThreads(cursor string, limit int) ([]Thread, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := s.db.Where("status = ?", "active").Order("created_at DESC, id DESC").Limit(limit + 1)
	if cursor != "" {
		if ct, cid := parseCursor(cursor); !ct.IsZero() && cid != "" {
			q = q.Where("(created_at < ? OR (created_at = ? AND id < ?))", ct, ct, cid)
		}
	}
	var rows []Thread
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		next = encodeCursor(rows[limit-1].CreatedAt, rows[limit-1].ID)
		rows = rows[:limit]
	}
	return rows, next, nil
}

func (s *ThreadService) CreateThread(userID, typ, title, category, gymID, machineID string) (*Thread, error) {
	t := &Thread{
		ID:              newUUID(),
		Type:            typ,
		Title:           title,
		Category:        utils.StrOrNil(category),
		GymID:           utils.StrOrNil(gymID),
		MachineID:       utils.StrOrNil(machineID),
		CreatedByUserID: userID,
	}
	if err := s.db.Create(t).Error; err != nil {
		return nil, err
	}
	return t, nil
}

func (s *ThreadService) GetThread(id string) (*Thread, error) {
	var t Thread
	if err := s.db.Where("id = ? AND status = ?", id, "active").First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *ThreadService) ListPosts(threadID, cursor string, limit int) ([]Post, string, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := s.db.Where("thread_id = ? AND status = ?", threadID, "active").Order("created_at ASC, id ASC").Limit(limit + 1)
	if cursor != "" {
		if ct, cid := parseCursor(cursor); !ct.IsZero() && cid != "" {
			q = q.Where("(created_at > ? OR (created_at = ? AND id > ?))", ct, ct, cid)
		}
	}
	var rows []Post
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		next = encodeCursor(rows[limit-1].CreatedAt, rows[limit-1].ID)
		rows = rows[:limit]
	}
	return rows, next, nil
}

func (s *ThreadService) CreatePost(threadID, userID, body string) (*Post, error) {
	p := &Post{
		ID:                newUUID(),
		ThreadID:          threadID,
		UserID:            userID,
		AnonymousThreadID: utils.GenerateAnonymousThreadID(userID, threadID, s.secret),
		Body:              body,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func (s *ThreadService) IncrementHelpful(postID string) (int, error) {
	if err := s.db.Model(&Post{}).Where("id = ?", postID).
		UpdateColumn("helpful_count", gorm.Expr("helpful_count + 1")).Error; err != nil {
		return 0, err
	}
	var p Post
	if err := s.db.Select("helpful_count").Where("id = ?", postID).First(&p).Error; err != nil {
		return 0, err
	}
	return p.HelpfulCount, nil
}
