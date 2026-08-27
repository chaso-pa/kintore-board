package services

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// Moderation lifecycle values.
//
// users.status uses a different vocabulary ("blocked") on purpose: that is an
// authentication state, not a moderation one, and conflating the two would make a banned
// account and a rejected gym look like the same thing.
const (
	StatusPending  = "pending"
	StatusActive   = "active"
	StatusRejected = "rejected"
)

// Viewer identifies who is asking. That is all the moderation filter needs to know.
type Viewer struct {
	UserID  string
	IsAdmin bool
}

// moderatedTable pairs a table with the column naming whoever created a row.
//
// The schema disagrees on that column: gyms and machines use created_by_user_id while the
// photo tables use uploaded_by_user_id. Pairing them here keeps one implementation
// instead of four, and keeps the two halves from drifting apart.
//
// The type is deliberately unexported and only ever built from the package-level values
// below, so no caller can construct one out of request data and steer the generated SQL.
type moderatedTable struct {
	name       string
	creatorCol string
}

var (
	tblGyms          = moderatedTable{"gyms", "created_by_user_id"}
	tblMachines      = moderatedTable{"machines", "created_by_user_id"}
	tblGymPhotos     = moderatedTable{"gym_photos", "uploaded_by_user_id"}
	tblMachinePhotos = moderatedTable{"machine_photos", "uploaded_by_user_id"}
)

var (
	// ErrForbiddenStatusFilter is returned when the caller explicitly asks for rows they
	// may never see, rather than silently returning an empty page — a silent empty page
	// would read as "there is nothing there", which is a different claim.
	ErrForbiddenStatusFilter = errors.New("status filter not permitted")

	// ErrInvalidStatusFilter guards the allowlist. Huma also enums the query parameter,
	// but the helper does not assume its only caller is an HTTP handler.
	ErrInvalidStatusFilter = errors.New("unknown status filter")
)

// visibilityFilter builds the WHERE predicate limiting rows to what the viewer may see.
//
// requested is the caller's explicit status filter; "" means the default view:
//
//	"":         active, plus pending for an admin or the row's own creator
//	"active":   anyone
//	"pending":  an admin sees all pending; a creator sees only their own
//	"rejected": admin only
//
// Rejected rows are never in the default view, not even for their creator: the decision
// was that a rejection is not something the author gets to keep looking at.
//
// The status values are bound rather than interpolated. Only the table and column names
// are formatted into the string, and those come from the unexported values above.
func visibilityFilter(v Viewer, t moderatedTable, requested string) (string, []any, error) {
	status := fmt.Sprintf("%s.status", t.name)
	creator := fmt.Sprintf("%s.%s", t.name, t.creatorCol)

	switch requested {
	case "":
		switch {
		case v.IsAdmin:
			return fmt.Sprintf("%s IN (?, ?)", status),
				[]any{StatusActive, StatusPending}, nil
		case v.UserID != "":
			return fmt.Sprintf("(%s = ? OR (%s = ? AND %s = ?))", status, status, creator),
				[]any{StatusActive, StatusPending, v.UserID}, nil
		default:
			return fmt.Sprintf("%s = ?", status), []any{StatusActive}, nil
		}

	case StatusActive:
		return fmt.Sprintf("%s = ?", status), []any{StatusActive}, nil

	case StatusPending:
		if v.IsAdmin {
			return fmt.Sprintf("%s = ?", status), []any{StatusPending}, nil
		}
		if v.UserID == "" {
			return "", nil, ErrForbiddenStatusFilter
		}
		return fmt.Sprintf("(%s = ? AND %s = ?)", status, creator),
			[]any{StatusPending, v.UserID}, nil

	case StatusRejected:
		if !v.IsAdmin {
			return "", nil, ErrForbiddenStatusFilter
		}
		return fmt.Sprintf("%s = ?", status), []any{StatusRejected}, nil

	default:
		return "", nil, ErrInvalidStatusFilter
	}
}

// scopedOn returns a query handle that already carries the visibility predicate.
//
// This is what makes "forgot to apply the filter" unreachable rather than merely
// discouraged: callers never hold an unfiltered handle to filter in the first place. An
// earlier design exposed the predicate and trusted callers to pass it to Where, and it
// passed review while returning the predicate and then throwing it away.
//
// Services keep thin wrappers around this so their own methods never name db directly,
// which is the invariant moderation_static_test.go checks.
//
//moderation:exempt: フィルタ済みハンドルの供給元そのもの
func scopedOn(db *gorm.DB, v Viewer, t moderatedTable, requested string) (*gorm.DB, error) {
	pred, args, err := visibilityFilter(v, t, requested)
	if err != nil {
		return nil, err
	}
	return db.Where(pred, args...), nil
}

//moderation:exempt: scopedOn への薄い委譲。s.db に触れる唯一の場所
func (s *GymService) scoped(v Viewer, t moderatedTable, requested string) (*gorm.DB, error) {
	return scopedOn(s.db, v, t, requested)
}

// ErrForbidden marks an action the caller is authenticated for but not entitled to.
// It is distinct from a missing row: handlers turn it into 403 and ErrRecordNotFound into
// 404, so "you may not" and "there is nothing there" stop being the same answer.
var ErrForbidden = errors.New("forbidden")

// ErrForeignImageURL rejects a photo whose bytes live somewhere we do not control.
// Approving such a row would only approve whatever the remote host served at that moment.
var ErrForeignImageURL = errors.New("image url does not point at our bucket")

// requireVisibleGym is the write-side counterpart to the read filter.
//
// Filtering reads alone leaves an asymmetry that is easy to walk through: GetGym can
// return 404 for a pending gym while AddGymFavorite happily bookmarks it, and the
// favourites listing then reads the row straight back. Every write that names a gym goes
// through here first, and a gym the caller cannot see is reported as missing.
func (s *GymService) requireVisibleGym(v Viewer, gymID string) error {
	q, err := s.scoped(v, tblGyms, "")
	if err != nil {
		return err
	}
	var g Gym
	return q.Select("gyms.id").Where("gyms.id = ?", gymID).First(&g).Error
}

// requireVisibleMachine mirrors requireVisibleGym for machines.
func (s *GymService) requireVisibleMachine(v Viewer, machineID string) error {
	q, err := s.scoped(v, tblMachines, "")
	if err != nil {
		return err
	}
	var m Machine
	return q.Select("machines.id").Where("machines.id = ?", machineID).First(&m).Error
}

// requireLinkableMachine is stricter than visibility: a machine must also be approved
// before it can be attached to a gym.
//
// Visibility alone is not enough here because a user can see their own pending machine,
// which would let them attach it to any gym and have it counted there before anyone
// reviewed it. Approval is the line, not authorship — restricting linking to the gym's
// creator was considered and rejected, since it would stop the people who actually use a
// gym from describing its equipment.
func (s *GymService) requireLinkableMachine(v Viewer, machineID string) error {
	q, err := s.scoped(v, tblMachines, "")
	if err != nil {
		return err
	}
	var m Machine
	if err := q.Select("machines.id, machines.status").
		Where("machines.id = ?", machineID).First(&m).Error; err != nil {
		return err
	}
	if m.Status != StatusActive {
		return ErrForbidden
	}
	return nil
}

// requireGymOwner gates the destructive half of the link API.
//
// Unlinking removes equipment from a gym other people rely on, and until now any
// authenticated user could empty any gym's machine list. Adding a link is open to
// everyone; taking one away is not.
func (s *GymService) requireGymOwner(v Viewer, gymID string) error {
	if v.IsAdmin {
		return nil
	}
	q, err := s.scoped(v, tblGyms, "")
	if err != nil {
		return err
	}
	var g Gym
	if err := q.Select("gyms.created_by_user_id").
		Where("gyms.id = ?", gymID).First(&g).Error; err != nil {
		return err
	}
	if g.CreatedByUserID != v.UserID {
		return ErrForbidden
	}
	return nil
}
