package services

import (
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func gymColumns() []string {
	return []string{"id", "name", "latitude", "longitude", "distance_km"}
}

// Proximity mode must compute the distance in SQL and order by it, so the nearest gyms
// survive the LIMIT. Ordering client-side after a created_at LIMIT would silently drop
// nearby gyms once the table outgrows one page.
func TestListGymsNearOrdersByDistanceInSQL(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("ST_Distance_Sphere(POINT(gyms.longitude, gyms.latitude), POINT(?, ?)) / 1000")).
		WithArgs(138.4769, 36.2483, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()).
			AddRow("g1", "近いジム", 36.249, 138.478, 0.13).
			AddRow("g2", "遠いジム", 35.6895, 139.6917, 125.75))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_machines")).WillReturnRows(sqlmock.NewRows([]string{"gym_id", "cnt"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_photos")).WillReturnRows(sqlmock.NewRows([]string{"gym_id", "image_url"}))

	svc := NewGymService(db)
	rows, next, err := svc.ListGyms("", 20, "", &NearQuery{Lat: 36.2483, Lng: 138.4769})
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d rows, want 2", len(rows))
	}
	if rows[0].DistanceKm != 0.13 || rows[1].DistanceKm != 125.75 {
		t.Errorf("distances = %v / %v, want the SQL-computed values", rows[0].DistanceKm, rows[1].DistanceKm)
	}
	// Distance ties freely, so a cursor would skip or repeat rows at a page boundary.
	// Proximity results are deliberately a single page.
	if next != "" {
		t.Errorf("next cursor = %q, want empty in proximity mode", next)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A gym whose location is unknown cannot be called "near" anything, so it is filtered out
// rather than sorted to the end.
func TestListGymsNearExcludesGymsWithoutCoordinates(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("NOT (gyms.latitude = 0 AND gyms.longitude = 0)")).
		WithArgs(138.4769, 36.2483, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	if _, _, err := svc.ListGyms("", 20, "", &NearQuery{Lat: 36.2483, Lng: 138.4769}); err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestListGymsNearAppliesRadius(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("HAVING distance_km <= ?")).
		WithArgs(138.4769, 36.2483, 50.0, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	radius := 50.0
	_, _, err := svc.ListGyms("", 20, "", &NearQuery{Lat: 36.2483, Lng: 138.4769, RadiusKm: &radius})
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Without a coordinate the endpoint keeps its original cursor-paged, newest-first behaviour.
func TestListGymsWithoutNearKeepsCursorPaging(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("ORDER BY gyms.created_at DESC")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow("g1", "ジム"))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_machines")).WillReturnRows(sqlmock.NewRows([]string{"gym_id", "cnt"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_photos")).WillReturnRows(sqlmock.NewRows([]string{"gym_id", "image_url"}))

	svc := NewGymService(db)
	if _, _, err := svc.ListGyms("", 20, "", nil); err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
