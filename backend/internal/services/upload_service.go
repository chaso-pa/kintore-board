package services

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type UploadService struct{}

func NewUploadService() *UploadService { return &UploadService{} }

func (s *UploadService) PresignUpload(filename, contentType string) (uploadURL, publicURL string, err error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	bucket := os.Getenv("MINIO_BUCKET")
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return "", "", err
	}

	objectName := fmt.Sprintf("uploads/%d/%s", time.Now().UnixNano(), filename)

	params := make(url.Values)
	params.Set("Content-Type", contentType)

	presignedURL, err := client.PresignedPutObject(context.Background(), bucket, objectName, 15*time.Minute)
	if err != nil {
		return "", "", err
	}

	scheme := "http"
	if useSSL {
		scheme = "https"
	}
	pub := fmt.Sprintf("%s://%s/%s/%s", scheme, endpoint, bucket, objectName)

	return presignedURL.String(), pub, nil
}
