package middlewares

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type contextKey string

const (
	UserIDKey contextKey = "user_id"
	RoleKey   contextKey = "role"
)

// RoleAdmin is the only privileged role. Everything else, including an empty string from
// a row written before the column existed, is an ordinary user.
const RoleAdmin = "admin"

var publicPaths = map[string]bool{
	"/api/v1/auth/anonymous": true,
	"/health":                true,
	"/openapi.json":          true,
	"/openapi.yaml":          true,
	"/openapi.yml":           true,
	"/docs":                  true,
}

type dbUser struct {
	Status string
	Role   string
}

// AuthMiddleware validates the JWT and checks the user's current status in the DB.
// Passing a nil db skips the DB status check (useful during startup before DB is ready).
func AuthMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if publicPaths[c.Request.URL.Path] {
			c.Next()
			return
		}

		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid authorization header"})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		secret := os.Getenv("JWT_SECRET")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		userID, ok := claims["user_id"].(string)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid user_id in token"})
			return
		}

		// Check current user status from DB (not from potentially stale token claims).
		// The role rides along on this same row: it is deliberately not read from the JWT,
		// because a token minted before a demotion would still claim admin for a year.
		role := ""
		if db != nil {
			var u dbUser
			if err := db.Table("users").Select("status, role").Where("id = ?", userID).First(&u).Error; err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
				return
			}
			if u.Status == "blocked" {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account is blocked"})
				return
			}
			role = u.Role
		}

		ctx := context.WithValue(c.Request.Context(), UserIDKey, userID)
		ctx = context.WithValue(ctx, RoleKey, role)
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(UserIDKey).(string)
	return v
}

// RoleFromContext returns the role recorded by AuthMiddleware, or "" when the request did
// not pass through it (public paths, or a nil db during startup).
func RoleFromContext(ctx context.Context) string {
	v, _ := ctx.Value(RoleKey).(string)
	return v
}

// IsAdmin reports whether the caller may moderate. It fails closed: anything that is not
// exactly RoleAdmin — including a missing value — is not an admin.
func IsAdmin(ctx context.Context) bool {
	return RoleFromContext(ctx) == RoleAdmin
}
