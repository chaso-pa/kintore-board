//go:build integration

package services

import (
	"os"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Integration tests run against a real MySQL with the Prisma migrations applied:
//
//	KINTORE_TEST_MYSQL_DSN='root@tcp(localhost:3306)/kintore_board_it?parseTime=True&loc=Local' \
//	  go test -tags integration ./internal/services/...
//
// Use a disposable database: the tests insert and delete rows for their own user ids
// (prefixed "it-"). Apply the schema with
//
//	PRISMA_DATABASE_URL=mysql://root@localhost:3306/kintore_board_it npx prisma migrate deploy
//
// Skipped when the variable is unset, so plain `go test ./...` never needs a database.
func openIntegrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("KINTORE_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("KINTORE_TEST_MYSQL_DSN is not set")
	}
	// The production container sets no TZ, so the server formats dates in UTC. loc=Local in
	// the DSN is resolved when it is parsed, so pinning time.Local first makes this process
	// behave like that container whatever the developer's machine is set to.
	time.Local = time.UTC
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return db
}

// resetIntegrationUsers removes every row the tests may have written for these users and
// makes sure the users exist (workouts.user_id is a foreign key).
func resetIntegrationUsers(t *testing.T, db *gorm.DB, userIDs ...string) {
	t.Helper()
	for _, id := range userIDs {
		for _, q := range []string{
			"DELETE FROM workout_sets WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)",
			"DELETE FROM workouts WHERE user_id = ?",
			"DELETE FROM deleted_workouts WHERE user_id = ?",
		} {
			if err := db.Exec(q, id).Error; err != nil {
				t.Fatalf("reset %s: %v", id, err)
			}
		}
		if err := db.Exec("INSERT IGNORE INTO users (id, device_uuid) VALUES (?, ?)", id, "test:"+id).Error; err != nil {
			t.Fatalf("user %s: %v", id, err)
		}
	}
}
