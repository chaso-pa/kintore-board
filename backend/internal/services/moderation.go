package services

import (
	"errors"
	"fmt"
	"time"
)

var (
	// ErrInvalidStatusTransition rejects a destination that is not a decision. Moving a
	// row back to pending is not offered: nothing in the product can currently reach a
	// row once it is rejected, so "un-decide" would be a button with no screen behind it.
	ErrInvalidStatusTransition = errors.New("status must be active or rejected")

	// ErrNotPending is what a second reviewer gets when the row was already decided, and
	// what anyone gets for trying to reject something already published.
	//
	// Restricting the source state to pending is deliberate. Taking down already-public
	// data was explicitly deferred, and without the restriction the API would offer it
	// anyway — while the UI has no way to find a rejected row again, so a mistaken
	// take-down would remove a gym with its photos, threads and favourites attached and
	// leave no route back except SQL.
	ErrNotPending = errors.New("row is not pending")
)

// setModerationStatus is the one place a moderation decision is written.
//
// The pending requirement lives in the WHERE clause rather than a preceding SELECT, so two
// admins acting at the same time cannot both believe they made the decision: the second
// UPDATE matches nothing and reports ErrNotPending.
//
//moderation:exempt: admin 専用。遷移元 pending への限定は WHERE 句で行う
func (s *GymService) setModerationStatus(t moderatedTable, id, to string) error {
	if to != StatusActive && to != StatusRejected {
		return ErrInvalidStatusTransition
	}
	res := s.db.Table(t.name).
		Where("id = ? AND status = ?", id, StatusPending).
		Update("status", to)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotPending
	}
	return nil
}

func (s *GymService) SetGymStatus(gymID, to string) error {
	return s.setModerationStatus(tblGyms, gymID, to)
}

func (s *GymService) SetMachineStatus(machineID, to string) error {
	return s.setModerationStatus(tblMachines, machineID, to)
}

func (s *GymService) SetGymPhotoStatus(photoID, to string) error {
	return s.setModerationStatus(tblGymPhotos, photoID, to)
}

func (s *GymService) SetMachinePhotoStatus(photoID, to string) error {
	return s.setModerationStatus(tblMachinePhotos, photoID, to)
}

// QueueDepth describes one moderation queue.
type QueueDepth struct {
	Pending int64 `json:"pending"`
	// OldestPendingAgeHours is what turns the queue into something you can notice going
	// wrong. A count alone reads the same whether three items arrived this morning or have
	// been sitting for a fortnight, and the failure worth catching is the second one:
	// submissions piling up unreviewed look like a broken registration form to the people
	// who sent them.
	OldestPendingAgeHours float64 `json:"oldest_pending_age_hours"`
}

// ModerationQueues is the admin-facing summary behind the "審査中" badge counts.
type ModerationQueues struct {
	Gyms          QueueDepth `json:"gyms"`
	Machines      QueueDepth `json:"machines"`
	GymPhotos     QueueDepth `json:"gym_photos"`
	MachinePhotos QueueDepth `json:"machine_photos"`
}

// ModerationCounts reports how much is waiting, per queue.
//
// The client cannot work this out for itself: the listings are capped (20 per page for
// gyms, 50 for machines) and carry no total, so counting the items it received would
// undercount exactly when the queue is deepest and the number matters most.
//
//moderation:exempt: admin 専用。pending 件数の集計そのものが目的
func (s *GymService) ModerationCounts() (ModerationQueues, error) {
	var out ModerationQueues
	targets := []struct {
		table moderatedTable
		dest  *QueueDepth
	}{
		{tblGyms, &out.Gyms},
		{tblMachines, &out.Machines},
		{tblGymPhotos, &out.GymPhotos},
		{tblMachinePhotos, &out.MachinePhotos},
	}
	for _, t := range targets {
		var row struct {
			Cnt    int64
			Oldest *time.Time
		}
		q := fmt.Sprintf(
			`SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest FROM %s WHERE status = ?`,
			t.table.name)
		if err := s.db.Raw(q, StatusPending).Scan(&row).Error; err != nil {
			return ModerationQueues{}, err
		}
		t.dest.Pending = row.Cnt
		if row.Oldest != nil {
			t.dest.OldestPendingAgeHours = time.Since(*row.Oldest).Hours()
		}
	}
	return out, nil
}
