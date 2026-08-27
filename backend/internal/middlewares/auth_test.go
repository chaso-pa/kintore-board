package middlewares

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// IsAdmin gates every moderation endpoint, so it fails closed: only the exact string
// grants the privilege. A row written before the column existed reads back as "" and must
// not be mistaken for a privileged account.
func TestIsAdminOnlyAcceptsExactRole(t *testing.T) {
	cases := []struct {
		name string
		ctx  context.Context
		want bool
	}{
		{"admin", context.WithValue(context.Background(), RoleKey, "admin"), true},
		{"user", context.WithValue(context.Background(), RoleKey, "user"), false},
		{"empty string", context.WithValue(context.Background(), RoleKey, ""), false},
		{"unset", context.Background(), false},
		{"wrong case", context.WithValue(context.Background(), RoleKey, "Admin"), false},
		{"substring", context.WithValue(context.Background(), RoleKey, "administrator"), false},
		{"wrong type", context.WithValue(context.Background(), RoleKey, 1), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsAdmin(tc.ctx); got != tc.want {
				t.Errorf("IsAdmin = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRoleFromContextDefaultsToEmpty(t *testing.T) {
	if got := RoleFromContext(context.Background()); got != "" {
		t.Errorf("RoleFromContext on a bare context = %q, want empty", got)
	}
}

func newMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	conn, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	db, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      conn,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}
	return db, mock
}

func signedToken(t *testing.T, userID, secret string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func runMiddleware(t *testing.T, db *gorm.DB, token string) (*httptest.ResponseRecorder, context.Context) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var seen context.Context
	r := gin.New()
	r.Use(AuthMiddleware(db))
	r.GET("/api/v1/probe", func(c *gin.Context) {
		seen = c.Request.Context()
		c.Status(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/probe", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w, seen
}

// AC-2: adding the role must not cost an extra round trip. The role rides on the status
// lookup that already ran on every request, so exactly one users query may be issued.
// sqlmock fails on any unexpected query, which is what pins the count at one.
func TestAuthMiddlewareIssuesExactlyOneUserQuery(t *testing.T) {
	const secret = "test-secret"
	t.Setenv("JWT_SECRET", secret)
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT status, role FROM `users`")).
		WithArgs("u1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"status", "role"}).AddRow("active", "admin"))

	w, ctx := runMiddleware(t, db, signedToken(t, "u1", secret))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	if got := UserIDFromContext(ctx); got != "u1" {
		t.Errorf("user id in context = %q, want u1", got)
	}
	if !IsAdmin(ctx) {
		t.Error("IsAdmin = false, want true for a row whose role is admin")
	}
	// Unmet expectations here would mean the query never ran; an extra query would have
	// already failed the request above.
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A non-admin row must not leak the privilege, and the same single-query budget applies.
func TestAuthMiddlewarePropagatesNonAdminRole(t *testing.T) {
	const secret = "test-secret"
	t.Setenv("JWT_SECRET", secret)
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT status, role FROM `users`")).
		WithArgs("u2", 1).
		WillReturnRows(sqlmock.NewRows([]string{"status", "role"}).AddRow("active", "user"))

	w, ctx := runMiddleware(t, db, signedToken(t, "u2", secret))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if IsAdmin(ctx) {
		t.Error("IsAdmin = true for a role of 'user'")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A blocked account is rejected before the role ever reaches a handler.
func TestAuthMiddlewareRejectsBlockedAccount(t *testing.T) {
	const secret = "test-secret"
	t.Setenv("JWT_SECRET", secret)
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("SELECT status, role FROM `users`")).
		WithArgs("u3", 1).
		WillReturnRows(sqlmock.NewRows([]string{"status", "role"}).AddRow("blocked", "admin"))

	w, _ := runMiddleware(t, db, signedToken(t, "u3", secret))

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for a blocked account", w.Code)
	}
}
