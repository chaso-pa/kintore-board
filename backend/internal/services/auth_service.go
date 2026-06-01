package services

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type User struct {
	ID             string    `gorm:"primaryKey;type:varchar(36)"`
	DeviceUUID     string    `gorm:"uniqueIndex;column:device_uuid;type:varchar(255)"`
	Status         string    `gorm:"default:active"`
	ModerationScore int      `gorm:"column:moderation_score;default:0"`
	CreatedAt      time.Time `gorm:"column:created_at"`
}

func (User) TableName() string { return "users" }

type AuthService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) *AuthService {
	return &AuthService{db: db}
}

func (s *AuthService) AnonymousAuth(deviceUUID string) (string, string, error) {
	user := User{
		ID:         newUUID(),
		DeviceUUID: deviceUUID,
		Status:     "active",
	}

	result := s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "device_uuid"}},
		DoNothing: true,
	}).Create(&user)
	if result.Error != nil {
		return "", "", result.Error
	}

	// fetch the actual user (in case of conflict the ID above won't be set)
	var existing User
	if err := s.db.Where("device_uuid = ?", deviceUUID).First(&existing).Error; err != nil {
		return "", "", err
	}

	token, err := issueJWT(existing.ID)
	if err != nil {
		return "", "", err
	}
	return token, existing.ID, nil
}

func issueJWT(userID string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
