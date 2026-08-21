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
