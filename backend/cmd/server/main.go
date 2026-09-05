package main

import (
	"log"
	"os"

	"github.com/chaso-pa/gin-template/internal/db"
	"github.com/chaso-pa/gin-template/internal/middlewares"
	"github.com/chaso-pa/gin-template/internal/routes"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.DebugMode)
	}

	if err := db.Connect(); err != nil {
		log.Printf("Warning: DB connection failed: %v (continuing without DB)", err)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.Use(middlewares.AuthMiddleware(db.DB))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := humagin.New(r, huma.DefaultConfig("Kintore Board API", "1.0.0"))

	routes.SetupAuthRoutes(api, db.DB)
	routes.SetupThreadRoutes(api, db.DB)
	routes.SetupGymRoutes(api, db.DB)
	routes.SetupWorkoutRoutes(api, db.DB)
	routes.SetupReportRoutes(api, db.DB)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
