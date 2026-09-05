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
	routes.SetupReportRoutes(api, nil)
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

// The reporting endpoint, and the two enums that make a bad value a 422 with a field path
// instead of a row nobody can display.
//
// The enums are asserted against the generated spec rather than the struct tags, because
// the spec is what the app codes against — and because a tag typo compiles fine.
func TestReportRouteIsRegisteredWithItsEnums(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))
	routes.SetupReportRoutes(api, nil)

	item := api.OpenAPI().Paths["/api/v1/reports"]
	if item == nil || item.Post == nil {
		t.Fatal("POST /api/v1/reports is not registered")
	}

	// The body schema is stored by name in the registry and referenced from the operation,
	// so it is resolved rather than read off the operation directly.
	schema := api.OpenAPI().Components.Schemas.Map()["CreateReportInputBody"]
	if schema == nil {
		t.Fatal("CreateReportInputBody is not in the schema registry")
	}
	for field, want := range map[string]int{"target_type": 4, "reason": 7} {
		prop, ok := schema.Properties[field]
		if !ok {
			t.Errorf("request body has no %q property", field)
			continue
		}
		if len(prop.Enum) != want {
			t.Errorf("%s enum has %d values, want %d: %v", field, len(prop.Enum), want, prop.Enum)
		}
	}
}

// The moderation queue. Without these two the reporting endpoint is write-only and the
// reports pile up with nothing able to read them, which is the state this replaced.
func TestReportQueueRoutesAreRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))
	routes.SetupReportRoutes(api, nil)

	paths := api.OpenAPI().Paths
	if item := paths["/api/v1/reports"]; item == nil || item.Get == nil {
		t.Error("GET /api/v1/reports is not registered")
	}
	if item := paths["/api/v1/reports/resolve"]; item == nil || item.Post == nil {
		t.Error("POST /api/v1/reports/resolve is not registered")
	}

	// pending must be the default, or opening the screen shows a moderator an empty
	// decided-items list and reads as "there is nothing to do".
	for _, p := range paths["/api/v1/reports"].Get.Parameters {
		if p.Name != "status" {
			continue
		}
		if p.Schema.Default != "pending" {
			t.Errorf("status default = %v, want pending", p.Schema.Default)
		}
		if len(p.Schema.Enum) != 3 {
			t.Errorf("status enum = %v, want the three report states", p.Schema.Enum)
		}
	}

	// reviewed and dismissed only. Accepting pending here would be an API for re-opening a
	// decided report, which no screen offers.
	body := api.OpenAPI().Components.Schemas.Map()["ResolveReportsInputBody"]
	if body == nil {
		t.Fatal("ResolveReportsInputBody is not in the schema registry")
	}
	if got := body.Properties["status"].Enum; len(got) != 2 {
		t.Errorf("resolve status enum = %v, want exactly reviewed and dismissed", got)
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
