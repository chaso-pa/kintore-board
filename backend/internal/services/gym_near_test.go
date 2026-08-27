package services

import (
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
)

func gymColumns() []string {
	return []string{"id", "name", "latitude", "longitude", "distance_km"}
}

// The thumbnail expectations in this file match the status clause, not just the table
// name. Matching "FROM gym_photos" alone still passed with the clause deleted, so the
// regression test asserted that the table was consulted and nothing about how.

// A signed-out viewer sees active rows only, so every proximity query below binds exactly
// one status value. Spelling it out here keeps the WithArgs lists readable.
var anonViewer = Viewer{}

// Proximity mode must compute the distance in SQL and order by it, so the nearest gyms
// survive the LIMIT. Ordering client-side after a created_at LIMIT would silently drop
// nearby gyms once the table outgrows one page.
func TestListGymsNearOrdersByDistanceInSQL(t *testing.T) {
	db, mock := newMockDB(t)

	// Argument order is [lng, lat] from the SELECT, then the visibility status, then the
	// LIMIT. GORM emits the SELECT clause before the WHERE clause regardless of the order
	// the builder methods were called in, which is why the coordinates come first even
	// though scoped() attached its predicate first.
	mock.ExpectQuery(regexp.QuoteMeta("ST_Distance_Sphere(POINT(gyms.longitude, gyms.latitude), POINT(?, ?)) / 1000")).
		WithArgs(138.4769, 36.2483, StatusActive, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()).
			AddRow("g1", "近いジム", 36.249, 138.478, 0.13).
			AddRow("g2", "遠いジム", 35.6895, 139.6917, 125.75))
	mock.ExpectQuery(regexp.QuoteMeta("INNER JOIN machines ON machines.id = gm.machine_id")).
		WithArgs(StatusActive, "g1", "g2").
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "cnt"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_photos WHERE status = 'active'")).
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "image_url"}))

	svc := NewGymService(db)
	rows, next, err := svc.ListGyms(anonViewer, "", 20, "", "", &NearQuery{Lat: 36.2483, Lng: 138.4769})
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

// The map and the list are built from separate statements. This is the one that feeds the
// map, and a pending gym reaching it would be visible to everyone with the app open.
func TestListGymsNearAppliesTheVisibilityPredicate(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("gyms.status = ?")).
		WithArgs(138.4769, 36.2483, StatusActive, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	if _, _, err := svc.ListGyms(anonViewer, "", 20, "", "", &NearQuery{Lat: 36.2483, Lng: 138.4769}); err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The creator of a gym still awaiting review can see their own row, so the predicate
// binds their id as well. Getting this pairing wrong would either hide a user's own
// submission or show them everyone else's.
func TestListGymsNearBindsTheCreatorIdForOwnPendingRows(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("gyms.created_by_user_id = ?")).
		// [lng, lat] then [active, pending, creator] from the visibility predicate, then LIMIT.
		WithArgs(138.4769, 36.2483, StatusActive, StatusPending, "creator-1", 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	_, _, err := svc.ListGyms(Viewer{UserID: "creator-1"}, "", 20, "", "", &NearQuery{Lat: 36.2483, Lng: 138.4769})
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
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
		WithArgs(138.4769, 36.2483, StatusActive, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	if _, _, err := svc.ListGyms(anonViewer, "", 20, "", "", &NearQuery{Lat: 36.2483, Lng: 138.4769}); err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The radius lands in HAVING because distance_km is a computed column. Its bind value
// therefore comes after the WHERE arguments and before the LIMIT.
func TestListGymsNearAppliesRadius(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("HAVING distance_km <= ?")).
		WithArgs(138.4769, 36.2483, StatusActive, 50.0, 20).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	radius := 50.0
	_, _, err := svc.ListGyms(anonViewer, "", 20, "", "", &NearQuery{Lat: 36.2483, Lng: 138.4769, RadiusKm: &radius})
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// The full ordering, with every optional clause present at once.
//
// This is the failure the plan's pre-mortem singled out: the coordinates are bound
// positionally into the SELECT, so an argument inserted in the wrong place feeds a status
// string or a search term to ST_Distance_Sphere instead of failing outright. sqlmock
// compares the arguments in order, so a shift shows up here rather than as a map that is
// quietly centred on the wrong place.
func TestListGymsNearBindsArgumentsInSelectThenWhereOrder(t *testing.T) {
	db, mock := newMockDB(t)

	radius := 50.0
	mock.ExpectQuery(regexp.QuoteMeta("ST_Distance_Sphere")).
		WithArgs(
			138.4769, 36.2483, // SELECT: POINT(lng, lat)
			StatusActive, StatusPending, "creator-1", // WHERE: visibility
			"%ゴールド%", // WHERE: name search
			radius,   // HAVING: radius
			20,       // LIMIT
		).
		WillReturnRows(sqlmock.NewRows(gymColumns()))

	svc := NewGymService(db)
	_, _, err := svc.ListGyms(
		Viewer{UserID: "creator-1"}, "", 20, "ゴールド", "",
		&NearQuery{Lat: 36.2483, Lng: 138.4769, RadiusKm: &radius},
	)
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// Without a coordinate the endpoint keeps its original cursor-paged, newest-first
// behaviour — and is filtered just the same. The two modes build different statements, so
// proving one is filtered says nothing about the other.
func TestListGymsWithoutNearKeepsCursorPagingAndStaysFiltered(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("ORDER BY gyms.created_at DESC")).
		WithArgs(StatusActive, 21). // limit+1, to detect whether another page exists
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow("g1", "ジム"))
	mock.ExpectQuery(regexp.QuoteMeta("INNER JOIN machines ON machines.id = gm.machine_id")).
		WithArgs(StatusActive, "g1").
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "cnt"}))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_photos WHERE status = 'active'")).
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "image_url"}))

	svc := NewGymService(db)
	if _, _, err := svc.ListGyms(anonViewer, "", 20, "", "", nil); err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// An explicit status filter the caller is not entitled to must be refused rather than
// quietly downgraded to the default view, which would report "nothing here" for rows that
// do exist.
func TestListGymsRejectsAForbiddenStatusFilter(t *testing.T) {
	db, _ := newMockDB(t)
	svc := NewGymService(db)

	_, _, err := svc.ListGyms(Viewer{UserID: "u1"}, "", 20, "", StatusRejected, nil)
	if err == nil {
		t.Fatal("a non-admin asking for rejected rows was allowed")
	}
	// No query may have been issued; sqlmock would flag an unexpected one.
}

// The machine count is what tells a viewer how much equipment a gym has. Counting the link
// table alone would include machines still awaiting review, leaking their existence as a
// number even though the list itself hides them.
func TestGymMachineCountJoinsMachinesAndFiltersThem(t *testing.T) {
	db, mock := newMockDB(t)

	mock.ExpectQuery(regexp.QuoteMeta("ORDER BY gyms.created_at DESC")).
		WithArgs(StatusActive, 21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow("g1", "ジム"))
	mock.ExpectQuery(regexp.QuoteMeta("INNER JOIN machines ON machines.id = gm.machine_id")).
		WithArgs(StatusActive, "g1").
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "cnt"}).AddRow("g1", 2))
	mock.ExpectQuery(regexp.QuoteMeta("FROM gym_photos WHERE status = 'active'")).
		WillReturnRows(sqlmock.NewRows([]string{"gym_id", "image_url"}))

	svc := NewGymService(db)
	rows, _, err := svc.ListGyms(anonViewer, "", 20, "", "", nil)
	if err != nil {
		t.Fatalf("ListGyms: %v", err)
	}
	if len(rows) != 1 || rows[0].MachineCount != 2 {
		t.Errorf("machine count = %v, want 2", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}
