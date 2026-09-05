package services

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Report is one person saying one thing is wrong.
//
// Reports are never shown to the person who was reported, and never counted in public. The
// row exists so a moderator has something to act on, and so App Store review guideline 1.2
// has an answer other than "mail us".
type Report struct {
	ID               string    `gorm:"primaryKey;type:varchar(36)"`
	TargetType       string    `gorm:"column:target_type"`
	TargetID         string    `gorm:"column:target_id"`
	ReportedByUserID string    `gorm:"column:reported_by_user_id"`
	Reason           string    `gorm:"column:reason"`
	Detail           *string   `gorm:"column:detail"`
	Status           string    `gorm:"column:status;default:pending"`
	CreatedAt        time.Time `gorm:"column:created_at"`
}

func (Report) TableName() string { return "reports" }

// What can be reported.
//
// Photos are absent on purpose: a photo is only reachable through the gym or machine it
// hangs off, and reporting the parent is what the UI offers. Adding a target type the app
// never sends would be surface nobody has checked.
const (
	ReportTargetThread  = "thread"
	ReportTargetPost    = "post"
	ReportTargetGym     = "gym"
	ReportTargetMachine = "machine"
)

// Why it was reported.
//
// These are codes, not sentences — the wording lives in the app, so it can be changed
// without a migration, and so the same row reads the same to a moderator whatever locale
// the reporter had.
//
// personal_attack is specific to this product rather than generic moderation vocabulary.
// The board's whole design bets on keeping equipment talk separate from talk about the
// people in the gym, so "this is about a person, not a machine" has to be one button
// rather than something a reporter has to explain in free text.
const (
	ReasonHarassment     = "harassment"
	ReasonPersonalAttack = "personal_attack"
	ReasonPersonalInfo   = "personal_info"
	ReasonSexual         = "sexual"
	ReasonFalseInfo      = "false_info"
	ReasonSpam           = "spam"
	ReasonOther          = "other"
)

var reportTargets = map[string]bool{
	ReportTargetThread:  true,
	ReportTargetPost:    true,
	ReportTargetGym:     true,
	ReportTargetMachine: true,
}

var reportReasons = map[string]bool{
	ReasonHarassment:     true,
	ReasonPersonalAttack: true,
	ReasonPersonalInfo:   true,
	ReasonSexual:         true,
	ReasonFalseInfo:      true,
	ReasonSpam:           true,
	ReasonOther:          true,
}

var (
	// ErrUnknownReportTarget and ErrUnknownReportReason guard the two allowlists. Huma
	// enums both fields as well, but the service does not assume its only caller is an
	// HTTP handler — and an unknown value written to the table would be a report no
	// moderation screen knows how to display.
	ErrUnknownReportTarget = errors.New("unknown report target type")
	ErrUnknownReportReason = errors.New("unknown report reason")

	// ErrReportLimitReached caps how much one account can put into the queue in a day.
	//
	// The unique index already stops the same target being reported twice, so this is
	// about breadth rather than repetition: without it one account can file against every
	// post on the board, and the queue that moderation depends on becomes the easiest
	// thing in the app to render useless.
	ErrReportLimitReached = errors.New("daily report limit reached")
)

// reportsPerDay is deliberately far above what an ordinary user reaches. Someone genuinely
// cleaning up after a spam run should not hit it; someone burying the queue should.
const reportsPerDay = 30

type ReportService struct {
	db *gorm.DB
}

func NewReportService(db *gorm.DB) *ReportService {
	return &ReportService{db: db}
}

// requireReportableTarget refuses a report against something the reporter cannot see.
//
// Without it the endpoint accepts any string as a target id, and the reports table fills
// with rows pointing at nothing — which costs a moderator time on every one of them. The
// visibility check matters for a second reason: answering differently for "exists but is
// pending" and "does not exist" would turn this endpoint into a way to test whether an id
// is real, which is the same disclosure the 404 on GetGym exists to prevent.
//
// Threads and posts are not moderated rows, so they are checked against status directly.
// Gyms and machines go through the shared filter, so a pending gym is reportable by the
// person who submitted it and invisible to everyone else, exactly as it is everywhere else.
//
//moderation:exempt: 可視性は scopedOn で判定し、書き込むのは reports のみ
func (s *ReportService) requireReportableTarget(v Viewer, targetType, targetID string) error {
	switch targetType {
	case ReportTargetGym:
		q, err := scopedOn(s.db, v, tblGyms, "")
		if err != nil {
			return err
		}
		var g Gym
		return q.Select("gyms.id").Where("gyms.id = ?", targetID).First(&g).Error

	case ReportTargetMachine:
		q, err := scopedOn(s.db, v, tblMachines, "")
		if err != nil {
			return err
		}
		var m Machine
		return q.Select("machines.id").Where("machines.id = ?", targetID).First(&m).Error

	case ReportTargetThread:
		var t Thread
		return s.db.Select("id").
			Where("id = ? AND status = ?", targetID, StatusActive).First(&t).Error

	case ReportTargetPost:
		var p Post
		return s.db.Select("id").
			Where("id = ? AND status = ?", targetID, StatusActive).First(&p).Error

	default:
		return ErrUnknownReportTarget
	}
}

// findReport looks for a report this user has already filed against this target.
func (s *ReportService) findReport(userID, targetType, targetID string) (*Report, error) {
	var r Report
	err := s.db.Where(
		"reported_by_user_id = ? AND target_type = ? AND target_id = ?",
		userID, targetType, targetID).First(&r).Error
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *ReportService) countRecentReports(userID string, since time.Time) (int64, error) {
	var n int64
	err := s.db.Model(&Report{}).
		Where("reported_by_user_id = ? AND created_at >= ?", userID, since).
		Count(&n).Error
	return n, err
}

// CreateReport files a report, or returns the one this user already filed.
//
// Re-reporting the same thing is a success rather than a conflict. The reporter cannot see
// the report they filed — there is no screen for it — so an error telling them they already
// reported it is both a dead end and a small disclosure. Returning the existing row means
// tapping 送信 twice does what the user expects, and the count stays readable as "how many
// people reported this" rather than "how many taps happened".
func (s *ReportService) CreateReport(v Viewer, targetType, targetID, reason, detail string) (*Report, error) {
	if !reportTargets[targetType] {
		return nil, ErrUnknownReportTarget
	}
	if !reportReasons[reason] {
		return nil, ErrUnknownReportReason
	}

	// Before the rate limit, so someone at their daily cap can still re-submit something
	// they already reported instead of being told they are rate limited for a no-op.
	if existing, err := s.findReport(v.UserID, targetType, targetID); err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Before the target lookup, so a capped account cannot keep using this endpoint to
	// find out which ids exist.
	n, err := s.countRecentReports(v.UserID, time.Now().Add(-24*time.Hour))
	if err != nil {
		return nil, err
	}
	if n >= reportsPerDay {
		return nil, ErrReportLimitReached
	}

	if err := s.requireReportableTarget(v, targetType, targetID); err != nil {
		return nil, err
	}

	r := &Report{
		ID:               newUUID(),
		TargetType:       targetType,
		TargetID:         targetID,
		ReportedByUserID: v.UserID,
		Reason:           reason,
		Status:           StatusPending,
	}
	if detail != "" {
		r.Detail = &detail
	}

	if err := s.db.Create(r).Error; err != nil {
		// Two submissions racing each other: the unique index rejected the second, which
		// is the index doing its job rather than a failure worth showing anyone. The row
		// the winner wrote is the answer to both.
		if again, e := s.findReport(v.UserID, targetType, targetID); e == nil {
			return again, nil
		}
		return nil, err
	}
	return r, nil
}
