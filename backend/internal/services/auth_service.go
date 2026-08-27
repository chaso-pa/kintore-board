package services

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type User struct {
	ID              string    `gorm:"primaryKey;type:varchar(36)"`
	DeviceUUID      string    `gorm:"uniqueIndex;column:device_uuid;type:varchar(255)"`
	Status          string    `gorm:"default:active"`
	Role            string    `gorm:"default:user"`
	ModerationScore int       `gorm:"column:moderation_score;default:0"`
	CreatedAt       time.Time `gorm:"column:created_at"`
}

func (User) TableName() string { return "users" }

type AuthService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) *AuthService {
	return &AuthService{db: db}
}

// AnonymousAuth returns the role alongside the token so a fresh install knows straight
// away whether it is privileged. Existing installs never come back through here — the app
// only calls it when it has no token, and the token is kept in the keychain — which is why
// GetMe exists as well.
func (s *AuthService) AnonymousAuth(deviceUUID string) (token, userID, role string, err error) {
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
		return "", "", "", result.Error
	}

	// fetch the actual user (in case of conflict the ID above won't be set)
	var existing User
	if err := s.db.Where("device_uuid = ?", deviceUUID).First(&existing).Error; err != nil {
		return "", "", "", err
	}

	issued, err := issueJWT(existing.ID)
	if err != nil {
		return "", "", "", err
	}
	return issued, existing.ID, existing.Role, nil
}

// GetMe reports the caller's current role.
//
// The role is deliberately not carried in the JWT: tokens here last a year, so one minted
// before a demotion would keep claiming the privilege for months. Reading it per session
// means a change takes effect on the next app start.
func (s *AuthService) GetMe(userID string) (User, error) {
	var u User
	err := s.db.Where("id = ?", userID).First(&u).Error
	return u, err
}

func issueJWT(userID string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
