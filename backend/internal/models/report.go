package models

import "time"

// --- Report ---

// CreateReportInput is the whole reporting API: one target, one reason, optional words.
//
// Both enums are duplicated from internal/services on purpose. Huma validates against the
// tag before the handler runs, which is what turns a bad value into a 422 with a field
// path instead of a generic error — and the service keeps its own allowlist because it does
// not assume an HTTP caller. The service is the one that decides; this is the early answer.
type CreateReportInput struct {
	Body struct {
		TargetType string `json:"target_type" enum:"thread,post,gym,machine" doc:"What is being reported"`
		TargetID   string `json:"target_id"   minLength:"1" maxLength:"36"   doc:"ID of the reported item"`
		Reason     string `json:"reason"      enum:"harassment,personal_attack,personal_info,sexual,false_info,spam,other" doc:"Why it is being reported"`
		// Free text, and the only field a reporter writes themselves. Capped because
		// nothing downstream renders more than a paragraph, and an unbounded TEXT column
		// reachable by any account is a cheap thing to abuse.
		Detail string `json:"detail" maxLength:"1000" required:"false" doc:"Optional detail; required by the app when reason is other"`
	}
}

// ReportItem is what the reporter gets back.
//
// It deliberately carries nothing about the reported item or its author — only the fact
// that a report exists and has not been actioned yet. Anything more would make this
// endpoint a way to learn about content the caller may not otherwise see.
type ReportItem struct {
	ID         string    `json:"id"`
	TargetType string    `json:"target_type"`
	TargetID   string    `json:"target_id"`
	Reason     string    `json:"reason"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

type CreateReportOutput struct {
	Body ReportItem
}

// --- Moderation queue (admin) ---

type ListReportsInput struct {
	// pending by default. The two decided states are listed rather than hidden so a
	// moderator can check their own past calls, which is the only record of them.
	Status string `query:"status" default:"pending" enum:"pending,reviewed,dismissed" doc:"Which queue to read"`
	Limit  int    `query:"limit"  default:"20" doc:"Groups per page"`
}

// ReportEntryItem is one person's complaint inside a group.
//
// Named rather than anonymous: Huma derives a schema name per struct and every anonymous
// slice element becomes "Item", so a second one panics at route registration.
type ReportEntryItem struct {
	Reason    string    `json:"reason"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

// ReportGroupItem is one piece of reported content.
//
// It deliberately carries no reporter identity — not even an anonymous id. A moderator
// deciding about content should not be able to see who complained: knowing that would make
// the decision about the people involved, which is the failure mode this whole board is
// designed around.
type ReportGroupItem struct {
	TargetType      string            `json:"target_type"`
	TargetID        string            `json:"target_id"`
	ReportCount     int64             `json:"report_count"`
	FirstReportedAt time.Time         `json:"first_reported_at"`
	LastReportedAt  time.Time         `json:"last_reported_at"`
	Reports         []ReportEntryItem `json:"reports"`
	TargetPreview   string            `json:"target_preview"`
	TargetStatus    string            `json:"target_status,omitempty"`
	TargetExists    bool              `json:"target_exists"`
	ThreadID        string            `json:"thread_id,omitempty"`
}

type ListReportsOutput struct {
	Body struct {
		Items []ReportGroupItem `json:"items"`
	}
}

// ResolveReportsInput names the target rather than a report id.
//
// The queue is grouped by target and so is the decision: closing one row would leave the
// other complaints about the same post pending, and it would come straight back to the top
// of the queue already handled.
type ResolveReportsInput struct {
	Body struct {
		TargetType string `json:"target_type" enum:"thread,post,gym,machine" doc:"Target being decided"`
		TargetID   string `json:"target_id"   minLength:"1" maxLength:"36" doc:"ID of the target"`
		Status     string `json:"status"      enum:"reviewed,dismissed" doc:"reviewed = acted on it, dismissed = nothing wrong"`
	}
}

type ResolveReportsOutput struct {
	Body struct {
		TargetType string `json:"target_type"`
		TargetID   string `json:"target_id"`
		Status     string `json:"status"`
		// How many complaints this decision closed. The client shows it so a moderator can
		// see that acting once cleared all of them.
		Resolved int64 `json:"resolved"`
	}
}
