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

// UserStatusDeleted marks an account its owner has deleted.
//
// The row stays rather than being dropped, because gyms, machines, photos and reports all
// point at it and are kept on purpose: the gym data is shared with everyone, and a report
// about a post is still evidence after its author leaves. What goes is everything that
// ties the row to a person or a device — see DeleteAccount.
const UserStatusDeleted = "deleted"

// DeleteAccount is the account deletion Google Play requires of any app that creates one.
//
// What is removed and what is kept:
//   - posts and threads: hidden with the same status an author's own delete uses, so
//     reports about them still have something to show the moderator
//   - workouts, bookmarks, saved gyms, blocks in either direction: deleted outright; they
//     describe the person and nobody else has a use for them
//   - gyms, machines, photos, edit requests, reports filed: kept, still pointing at the
//     now-empty user row; they are about facilities, not about the person
//
// The device UUID is overwritten, not just the status flipped. Left in place, the next
// anonymous sign-in from the same phone would hit the unique index and be handed this
// deleted account back instead of a fresh one.
//
// All in one transaction: a half-deleted account — records gone but posts still up, or the
// reverse — is worse than either outcome, and there is no later job that would finish it.
func (s *AuthService) DeleteAccount(userID string) error {
	if userID == "" {
		return gorm.ErrRecordNotFound
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		res := tx.Exec(
			"UPDATE users SET status = ?, role = 'user', device_uuid = CONCAT('deleted:', id) WHERE id = ? AND status <> ?",
			UserStatusDeleted, userID, UserStatusDeleted,
		)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		steps := []struct {
			sql  string
			args []any
		}{
			{"UPDATE posts SET status = ? WHERE user_id = ? AND status = ?", []any{PostStatusDeleted, userID, StatusActive}},
			{"UPDATE threads SET status = ? WHERE created_by_user_id = ? AND status = ?", []any{PostStatusDeleted, userID, StatusActive}},
			{"DELETE FROM workout_sets WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)", []any{userID}},
			{"DELETE FROM workouts WHERE user_id = ?", []any{userID}},
			{"DELETE FROM thread_bookmarks WHERE user_id = ?", []any{userID}},
			{"DELETE FROM gym_favorites WHERE user_id = ?", []any{userID}},
			{"DELETE FROM user_blocks WHERE blocker_user_id = ? OR blocked_user_id = ?", []any{userID, userID}},
		}
		for _, st := range steps {
			if err := tx.Exec(st.sql, st.args...).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func issueJWT(userID string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	claims := jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
