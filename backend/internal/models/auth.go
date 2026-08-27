package models

type AnonymousAuthInput struct {
	Body struct {
		DeviceUUID string `json:"device_uuid" minLength:"1" doc:"Unique device identifier"`
	}
}

type AnonymousAuthOutput struct {
	Body struct {
		Token  string `json:"token"   doc:"JWT access token"`
		UserID string `json:"user_id" doc:"Internal user ID"`
		Role   string `json:"role"    doc:"Either user or admin"`
	}
}

type MeOutput struct {
	Body struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"   doc:"Either user or admin. A UI hint only — the server checks the role itself on every moderation call"`
		Status string `json:"status" doc:"Account status: active or blocked"`
	}
}
