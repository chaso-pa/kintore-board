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
	}
}
