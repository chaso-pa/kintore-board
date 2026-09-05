package routes

import (
	"github.com/chaso-pa/gin-template/internal/handlers"
	"github.com/chaso-pa/gin-template/internal/services"
	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
)

func SetupReportRoutes(api huma.API, db *gorm.DB) {
	svc := services.NewReportService(db)
	h := handlers.NewReportHandler(svc)

	huma.Post(api, "/api/v1/reports", h.CreateReport)

	// Admin only; the handlers check the role, the routes do not — same convention as the
	// gym moderation routes.
	huma.Get(api, "/api/v1/reports", h.ListReports)
	// A POST rather than a PATCH on a resource: the decision applies to every pending
	// report about a target, and that set has no id of its own to address.
	huma.Post(api, "/api/v1/reports/resolve", h.ResolveReports)
}
