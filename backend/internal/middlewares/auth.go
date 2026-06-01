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

const UserIDKey contextKey = "user_id"

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
		if db != nil {
			var u dbUser
			if err := db.Table("users").Select("status").Where("id = ?", userID).First(&u).Error; err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
				return
			}
			if u.Status == "blocked" {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account is blocked"})
				return
			}
		}

		c.Request = c.Request.WithContext(
			context.WithValue(c.Request.Context(), UserIDKey, userID),
		)
		c.Next()
	}
}

func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(UserIDKey).(string)
	return v
}
