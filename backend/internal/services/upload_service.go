package services

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type UploadService struct{}

func NewUploadService() *UploadService { return &UploadService{} }

type minioConfig struct {
	endpoint  string
	accessKey string
	secretKey string
	bucket    string
	useSSL    bool
	region    string
}

func (c minioConfig) scheme() string {
	if c.useSSL {
		return "https"
	}
	return "http"
}

// newClient builds a client used only for signing URLs. Region is set explicitly so
// signing stays offline; without it minio-go issues a GetBucketLocation request, which
// would have to reach the public endpoint from the server.
func (c minioConfig) newClient() (*minio.Client, error) {
	return minio.New(c.endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(c.accessKey, c.secretKey, ""),
		Secure: c.useSSL,
		Region: c.region,
	})
}

// normalizeEndpoint accepts either "host:port" or a full URL, and returns the bare host
// plus whether TLS was implied by the scheme.
func normalizeEndpoint(raw string, fallbackSSL bool) (string, bool) {
	if raw == "" {
		return "", fallbackSSL
	}
	if strings.Contains(raw, "://") {
		if u, err := url.Parse(raw); err == nil && u.Host != "" {
			return u.Host, u.Scheme == "https"
		}
	}
	return strings.TrimSuffix(raw, "/"), fallbackSSL
}

// signingConfig returns the endpoint that presigned URLs must be signed for.
// SigV4 covers the Host header, so the host cannot be rewritten after signing — it has
// to be the one the client device can actually reach. MINIO_PUBLIC_ENDPOINT is that
// host, falling back to the internal endpoint when unset.
func signingConfig() minioConfig {
	endpoint, useSSL := normalizeEndpoint(
		os.Getenv("MINIO_PUBLIC_ENDPOINT"),
		os.Getenv("MINIO_PUBLIC_USE_SSL") == "true",
	)
	if endpoint == "" {
		endpoint, useSSL = normalizeEndpoint(
			os.Getenv("MINIO_ENDPOINT"),
			os.Getenv("MINIO_USE_SSL") == "true",
		)
	}

	region := os.Getenv("MINIO_REGION")
	if region == "" {
		region = "us-east-1"
	}

	return minioConfig{
		endpoint:  endpoint,
		accessKey: os.Getenv("MINIO_ACCESS_KEY"),
		secretKey: os.Getenv("MINIO_SECRET_KEY"),
		bucket:    os.Getenv("MINIO_BUCKET"),
		useSSL:    useSSL,
		region:    region,
	}
}

// objectNameFromURL pulls the object key out of a stored image URL. Rows written before
// the public endpoint existed still carry the old internal host, so only the path after
// the bucket is used. Returns "" when the URL does not point at our bucket.
func objectNameFromURL(rawURL, bucket string) string {
	prefix := bucket + "/"

	if u, err := url.Parse(rawURL); err == nil && u.Path != "" {
		path := strings.TrimPrefix(u.Path, "/")
		if strings.HasPrefix(path, prefix) {
			if decoded, err := url.PathUnescape(strings.TrimPrefix(path, prefix)); err == nil {
				return decoded
			}
		}
	}

	if idx := strings.Index(rawURL, prefix); idx >= 0 {
		return rawURL[idx+len(prefix):]
	}
	return ""
}

func (s *UploadService) PresignUpload(filename, contentType string) (uploadURL, publicURL string, err error) {
	cfg := signingConfig()

	client, err := cfg.newClient()
	if err != nil {
		return "", "", err
	}

	objectName := fmt.Sprintf("uploads/%d/%s", time.Now().UnixNano(), filename)

	presignedURL, err := client.PresignedPutObject(context.Background(), cfg.bucket, objectName, 15*time.Minute)
	if err != nil {
		return "", "", err
	}

	pub := fmt.Sprintf("%s://%s/%s/%s", cfg.scheme(), cfg.endpoint, cfg.bucket, objectName)

	return presignedURL.String(), pub, nil
}

func (s *UploadService) PresignGetURL(imageURL string) (string, error) {
	cfg := signingConfig()

	objectName := objectNameFromURL(imageURL, cfg.bucket)
	if objectName == "" {
		return imageURL, nil // already a presigned or external URL, return as-is
	}

	client, err := cfg.newClient()
	if err != nil {
		return "", err
	}

	presigned, err := client.PresignedGetObject(context.Background(), cfg.bucket, objectName, 24*time.Hour, nil)
	if err != nil {
		return "", err
	}
	return presigned.String(), nil
}
