package routes_test

import (
	"testing"

	"github.com/chaso-pa/gin-template/internal/routes"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-gonic/gin"
)

// Registering every route the way main.go does.
//
// Huma validates each input struct at registration time and panics on an unsupported
// shape — a pointer query parameter, for instance. That happens before the server ever
// listens, so it compiles, passes vet, and passes every service-level test, then dies on
// boot. This test is the cheapest place to catch it.
func TestSetupRoutesDoesNotPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("route registration panicked: %v", r)
		}
	}()

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))

	// A nil *gorm.DB is fine here: registration only inspects handler signatures and
	// input structs, it never runs a query.
	routes.SetupAuthRoutes(api, nil)
	routes.SetupThreadRoutes(api, nil)
	routes.SetupGymRoutes(api, nil)
	routes.SetupWorkoutRoutes(api, nil)
}

// The generated spec is the contract the app codes against, so the proximity parameters
// must actually surface in it.
func TestGymListExposesProximityParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))
	routes.SetupGymRoutes(api, nil)

	op := api.OpenAPI().Paths["/api/v1/gyms"].Get
	if op == nil {
		t.Fatal("GET /api/v1/gyms is not registered")
	}

	found := map[string]bool{}
	for _, p := range op.Parameters {
		found[p.Name] = true
	}
	for _, want := range []string{"lat", "lng", "radius_km"} {
		if !found[want] {
			t.Errorf("query parameter %q missing from the spec", want)
		}
	}
}

// The moderation routes are new surface, and the status parameter is the one that decides
// whether an admin can reach a pending row at all. Both are asserted against the generated
// spec rather than by starting a server, which is cheaper and fails in the same place.
func TestModerationRoutesAreRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))
	routes.SetupGymRoutes(api, nil)

	paths := api.OpenAPI().Paths
	cases := []struct {
		path   string
		method string
	}{
		{"/api/v1/gyms/{gymId}/status", "PATCH"},
		{"/api/v1/machines/{machineId}/status", "PATCH"},
		{"/api/v1/gyms/{gymId}/photos/{photoId}/status", "PATCH"},
		{"/api/v1/machines/{machineId}/photos/{photoId}/status", "PATCH"},
		{"/api/v1/moderation/counts", "GET"},
	}
	for _, tc := range cases {
		item := paths[tc.path]
		if item == nil {
			t.Errorf("%s %s is not registered", tc.method, tc.path)
			continue
		}
		op := item.Patch
		if tc.method == "GET" {
			op = item.Get
		}
		if op == nil {
			t.Errorf("%s %s is not registered", tc.method, tc.path)
		}
	}
}

// A pending row is unreachable without this parameter, so its absence would leave the
// moderation UI with nothing to show even though every endpoint exists.
func TestListingsExposeTheStatusParameter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))
	routes.SetupGymRoutes(api, nil)

	paths := api.OpenAPI().Paths
	for _, path := range []string{
		"/api/v1/gyms",
		"/api/v1/machines",
		"/api/v1/gyms/{gymId}/machines",
		"/api/v1/gyms/{gymId}/photos",
		"/api/v1/machines/{machineId}/photos",
	} {
		item := paths[path]
		if item == nil || item.Get == nil {
			t.Errorf("GET %s is not registered", path)
			continue
		}
		found := false
		for _, p := range item.Get.Parameters {
			if p.Name == "status" {
				found = true
				// The enum is what turns an unknown value into a 422 before it reaches the
				// service layer's own allowlist.
				if len(p.Schema.Enum) == 0 {
					t.Errorf("GET %s: status parameter has no enum", path)
				}
			}
		}
		if !found {
			t.Errorf("GET %s: status query parameter missing from the spec", path)
		}
	}
}
