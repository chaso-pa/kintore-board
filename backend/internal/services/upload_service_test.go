package services

import (
	"net/url"
	"strings"
	"testing"
)

func TestNormalizeEndpoint(t *testing.T) {
	cases := []struct {
		name       string
		raw        string
		fallback   bool
		wantHost   string
		wantUseSSL bool
	}{
		{"empty falls back", "", true, "", true},
		{"host:port keeps fallback", "192.168.3.100:9000", false, "192.168.3.100:9000", false},
		{"https URL implies TLS", "https://minio.example.com", false, "minio.example.com", true},
		{"http URL implies no TLS", "http://minio.example.com:9000", true, "minio.example.com:9000", false},
		{"trailing slash stripped", "minio.example.com/", false, "minio.example.com", false},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			host, useSSL := normalizeEndpoint(c.raw, c.fallback)
			if host != c.wantHost || useSSL != c.wantUseSSL {
				t.Errorf("got (%q, %v), want (%q, %v)", host, useSSL, c.wantHost, c.wantUseSSL)
			}
		})
	}
}

func TestObjectNameFromURL(t *testing.T) {
	const bucket = "kintore-board-dev"

	cases := []struct {
		name string
		url  string
		want string
	}{
		{
			// Rows written before the public endpoint existed.
			"legacy internal host",
			"http://192.168.3.100:9000/kintore-board-dev/uploads/123/photo.jpg",
			"uploads/123/photo.jpg",
		},
		{
			"public host",
			"https://minio.example.com/kintore-board-dev/uploads/123/photo.jpg",
			"uploads/123/photo.jpg",
		},
		{
			"percent encoded key",
			"https://minio.example.com/kintore-board-dev/uploads/123/my%20photo.jpg",
			"uploads/123/my photo.jpg",
		},
		{
			"external URL is not ours",
			"https://example.com/some/other/image.jpg",
			"",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := objectNameFromURL(c.url, bucket); got != c.want {
				t.Errorf("got %q, want %q", got, c.want)
			}
		})
	}
}

// The regression this guards: presigned URLs used to be signed for MINIO_ENDPOINT, so
// external clients received an unreachable LAN host and every upload/display failed.
func TestPresignUploadUsesPublicEndpoint(t *testing.T) {
	t.Setenv("MINIO_ENDPOINT", "192.168.3.100:9000")
	t.Setenv("MINIO_USE_SSL", "false")
	t.Setenv("MINIO_PUBLIC_ENDPOINT", "minio.example.com")
	t.Setenv("MINIO_PUBLIC_USE_SSL", "true")
	t.Setenv("MINIO_ACCESS_KEY", "key")
	t.Setenv("MINIO_SECRET_KEY", "secret")
	t.Setenv("MINIO_BUCKET", "kintore-board-dev")

	svc := NewUploadService()
	uploadURL, publicURL, err := svc.PresignUpload("photo.jpg", "image/jpeg")
	if err != nil {
		t.Fatalf("PresignUpload: %v", err)
	}

	u, err := url.Parse(uploadURL)
	if err != nil {
		t.Fatalf("parse upload URL: %v", err)
	}
	if u.Host != "minio.example.com" {
		t.Errorf("upload URL host = %q, want minio.example.com", u.Host)
	}
	if u.Scheme != "https" {
		t.Errorf("upload URL scheme = %q, want https", u.Scheme)
	}
	if !strings.Contains(u.RawQuery, "X-Amz-Signature") {
		t.Errorf("upload URL is not signed: %s", u.RawQuery)
	}
	if !strings.HasPrefix(publicURL, "https://minio.example.com/kintore-board-dev/uploads/") {
		t.Errorf("public URL = %q, want public host and bucket prefix", publicURL)
	}
}

func TestPresignFallsBackToInternalEndpoint(t *testing.T) {
	t.Setenv("MINIO_ENDPOINT", "192.168.3.100:9000")
	t.Setenv("MINIO_USE_SSL", "false")
	t.Setenv("MINIO_PUBLIC_ENDPOINT", "")
	t.Setenv("MINIO_ACCESS_KEY", "key")
	t.Setenv("MINIO_SECRET_KEY", "secret")
	t.Setenv("MINIO_BUCKET", "kintore-board-dev")

	svc := NewUploadService()
	uploadURL, _, err := svc.PresignUpload("photo.jpg", "image/jpeg")
	if err != nil {
		t.Fatalf("PresignUpload: %v", err)
	}

	u, err := url.Parse(uploadURL)
	if err != nil {
		t.Fatalf("parse upload URL: %v", err)
	}
	if u.Host != "192.168.3.100:9000" {
		t.Errorf("upload URL host = %q, want the internal endpoint", u.Host)
	}
}

// Old rows keep working: the object key is re-signed against the public host.
func TestPresignGetURLRewritesLegacyHost(t *testing.T) {
	t.Setenv("MINIO_ENDPOINT", "192.168.3.100:9000")
	t.Setenv("MINIO_PUBLIC_ENDPOINT", "minio.example.com")
	t.Setenv("MINIO_PUBLIC_USE_SSL", "true")
	t.Setenv("MINIO_ACCESS_KEY", "key")
	t.Setenv("MINIO_SECRET_KEY", "secret")
	t.Setenv("MINIO_BUCKET", "kintore-board-dev")

	svc := NewUploadService()
	got, err := svc.PresignGetURL("http://192.168.3.100:9000/kintore-board-dev/uploads/123/photo.jpg")
	if err != nil {
		t.Fatalf("PresignGetURL: %v", err)
	}

	u, err := url.Parse(got)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if u.Host != "minio.example.com" {
		t.Errorf("host = %q, want minio.example.com", u.Host)
	}
	if !strings.Contains(u.Path, "uploads/123/photo.jpg") {
		t.Errorf("path = %q, want the original object key", u.Path)
	}
}

func TestPresignGetURLLeavesExternalURLAlone(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "kintore-board-dev")
	t.Setenv("MINIO_PUBLIC_ENDPOINT", "minio.example.com")

	svc := NewUploadService()
	const external = "https://example.com/some/other/image.jpg"

	got, err := svc.PresignGetURL(external)
	if err != nil {
		t.Fatalf("PresignGetURL: %v", err)
	}
	if got != external {
		t.Errorf("got %q, want it returned unchanged", got)
	}
}
