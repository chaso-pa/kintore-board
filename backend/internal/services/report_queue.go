package services

import (
	"errors"
	"time"
)

// Report lifecycle beyond pending.
//
// reviewed and dismissed are both terminal, and the split is the whole point: "I looked and
// acted" and "I looked and there was nothing wrong" have to be distinguishable, or the
// queue's history cannot tell a moderator who was right from one who waved everything
// through.
const (
	ReportStatusReviewed  = "reviewed"
	ReportStatusDismissed = "dismissed"
)

var reportResolutions = map[string]bool{
	ReportStatusReviewed:  true,
	ReportStatusDismissed: true,
}

var (
	// ErrInvalidReportResolution rejects a destination that is not a decision. pending is
	// excluded deliberately: re-opening a decided report is not something the screen
	// offers, so accepting it here would be an API with nothing behind it.
	ErrInvalidReportResolution = errors.New("status must be reviewed or dismissed")

	// ErrNoPendingReports is what a second moderator gets when someone already handled the
	// target. Like ErrNotPending, the condition lives in the WHERE clause rather than a
	// preceding SELECT, so two people acting at once cannot both believe they decided it.
	ErrNoPendingReports = errors.New("no pending reports for this target")
)

// ReportEntry is one person's report, as shown inside a group.
type ReportEntry struct {
	Reason    string    `json:"reason"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

// ReportGroup is one piece of content that has been reported, with everything needed to
// decide about it.
//
// The queue is grouped by target rather than listed per report because the unit of work is
// the content, not the complaint: five reports about one post is one thing to read and one
// decision to make. Listing them flat would make the same post appear five times and let a
// moderator "handle" it while four identical rows stayed pending.
type ReportGroup struct {
	TargetType      string
	TargetID        string
	ReportCount     int64
	FirstReportedAt time.Time
	LastReportedAt  time.Time
	Reports         []ReportEntry

	// Filled in by attachTargetPreviews.
	TargetPreview string
	TargetStatus  string
	// TargetExists is false when the row is gone. A report about deleted content is not an
	// error — it is the ordinary case once removal exists — but the queue has to say so,
	// or an empty preview reads as a bug.
	TargetExists bool
	// ThreadID lets the screen open the thread a reported post lives in. Empty for every
	// other target type.
	ThreadID string
}

// previewRunes caps the stored text a moderator sees at a glance. Long enough to judge a
// post, short enough that one abusive wall of text cannot push the rest of the queue off
// the screen.
const previewRunes = 140

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// groupedReportRow is the shape of the GROUP BY, before the details and previews are added.
type groupedReportRow struct {
	TargetType      string    `gorm:"column:target_type"`
	TargetID        string    `gorm:"column:target_id"`
	ReportCount     int64     `gorm:"column:report_count"`
	FirstReportedAt time.Time `gorm:"column:first_reported_at"`
	LastReportedAt  time.Time `gorm:"column:last_reported_at"`
}

// ListReportGroups returns reported content, oldest complaint first.
//
// Oldest first rather than most-reported first: the number tells a moderator how bad
// something probably is, but the wait tells them what the queue is failing at. Sorting by
// count would let a single old report sit forever behind a steady trickle of busier ones,
// which is the failure OldestPendingAgeHours exists to surface.
func (s *ReportService) ListReportGroups(status string, limit int) ([]ReportGroup, error) {
	if status == "" {
		status = StatusPending
	}
	if status != StatusPending && !reportResolutions[status] {
		return nil, ErrInvalidReportResolution
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var rows []groupedReportRow
	err := s.db.Model(&Report{}).
		Select(`target_type, target_id,
			COUNT(*) AS report_count,
			MIN(created_at) AS first_reported_at,
			MAX(created_at) AS last_reported_at`).
		Where("status = ?", status).
		Group("target_type, target_id").
		Order("first_reported_at ASC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []ReportGroup{}, nil
	}

	groups := make([]ReportGroup, len(rows))
	ids := make([]string, len(rows))
	for i, r := range rows {
		groups[i] = ReportGroup{
			TargetType:      r.TargetType,
			TargetID:        r.TargetID,
			ReportCount:     r.ReportCount,
			FirstReportedAt: r.FirstReportedAt,
			LastReportedAt:  r.LastReportedAt,
			Reports:         []ReportEntry{},
		}
		ids[i] = r.TargetID
	}

	if err := s.attachReportEntries(groups, ids, status); err != nil {
		return nil, err
	}
	if err := s.attachTargetPreviews(groups); err != nil {
		return nil, err
	}
	return groups, nil
}

// attachReportEntries fills in what each reporter actually said.
//
// A second query rather than GROUP_CONCAT in the first: that function truncates at
// group_concat_max_len (1024 bytes by default) and says nothing when it does, so a busy
// target would silently lose the reports at the end — the ones a moderator most needs when
// deciding whether a pile-on is genuine.
func (s *ReportService) attachReportEntries(groups []ReportGroup, ids []string, status string) error {
	var rows []struct {
		TargetType string    `gorm:"column:target_type"`
		TargetID   string    `gorm:"column:target_id"`
		Reason     string    `gorm:"column:reason"`
		Detail     *string   `gorm:"column:detail"`
		CreatedAt  time.Time `gorm:"column:created_at"`
	}
	err := s.db.Model(&Report{}).
		Select("target_type, target_id, reason, detail, created_at").
		Where("status = ? AND target_id IN ?", status, ids).
		Order("created_at ASC").
		Scan(&rows).Error
	if err != nil {
		return err
	}

	// Keyed on both columns even though the id is a UUID and collisions are not realistic.
	// The pair is what identifies a target everywhere else, and matching on the id alone
	// would file a report under the wrong type the first time those two ever disagree.
	byKey := map[string]int{}
	for i, g := range groups {
		byKey[g.TargetType+"\x00"+g.TargetID] = i
	}
	for _, r := range rows {
		i, ok := byKey[r.TargetType+"\x00"+r.TargetID]
		if !ok {
			continue
		}
		detail := ""
		if r.Detail != nil {
			detail = *r.Detail
		}
		groups[i].Reports = append(groups[i].Reports, ReportEntry{
			Reason:    r.Reason,
			Detail:    truncateRunes(detail, previewRunes),
			CreatedAt: r.CreatedAt,
		})
	}
	return nil
}

// attachTargetPreviews reads the reported content itself, one query per target type.
//
// A moderator cannot decide from an id and a reason code. Without the text there is no way
// to tell a genuine report from a grudge, and the only alternative is opening the app and
// hunting for the post — which is the manual process this queue exists to replace.
//
// The visibility filter is deliberately not applied. A moderator has to be able to read a
// pending gym or an already-hidden post: those are exactly the rows that get reported, and
// filtering them out would empty the queue of its most important entries. That is also why
// this cannot go through scoped().
//
//moderation:exempt: admin 専用。通報対象は非公開の行も読めないと判断できない
func (s *ReportService) attachTargetPreviews(groups []ReportGroup) error {
	byType := map[string][]string{}
	for _, g := range groups {
		byType[g.TargetType] = append(byType[g.TargetType], g.TargetID)
	}

	type preview struct {
		text     string
		status   string
		threadID string
	}
	found := map[string]preview{}

	if ids := byType[ReportTargetPost]; len(ids) > 0 {
		var rows []struct {
			ID       string `gorm:"column:id"`
			ThreadID string `gorm:"column:thread_id"`
			Body     string `gorm:"column:body"`
			Status   string `gorm:"column:status"`
		}
		if err := s.db.Table("posts").Select("id, thread_id, body, status").
			Where("id IN ?", ids).Scan(&rows).Error; err != nil {
			return err
		}
		for _, r := range rows {
			found[ReportTargetPost+"\x00"+r.ID] = preview{r.Body, r.Status, r.ThreadID}
		}
	}

	if ids := byType[ReportTargetThread]; len(ids) > 0 {
		var rows []struct {
			ID     string `gorm:"column:id"`
			Title  string `gorm:"column:title"`
			Status string `gorm:"column:status"`
		}
		if err := s.db.Table("threads").Select("id, title, status").
			Where("id IN ?", ids).Scan(&rows).Error; err != nil {
			return err
		}
		for _, r := range rows {
			// The thread is its own destination, so it doubles as the navigation target.
			found[ReportTargetThread+"\x00"+r.ID] = preview{r.Title, r.Status, r.ID}
		}
	}

	for _, t := range []struct {
		kind  string
		table string
	}{
		{ReportTargetGym, "gyms"},
		{ReportTargetMachine, "machines"},
	} {
		ids := byType[t.kind]
		if len(ids) == 0 {
			continue
		}
		var rows []struct {
			ID     string `gorm:"column:id"`
			Name   string `gorm:"column:name"`
			Status string `gorm:"column:status"`
		}
		if err := s.db.Table(t.table).Select("id, name, status").
			Where("id IN ?", ids).Scan(&rows).Error; err != nil {
			return err
		}
		for _, r := range rows {
			found[t.kind+"\x00"+r.ID] = preview{r.Name, r.Status, ""}
		}
	}

	for i, g := range groups {
		p, ok := found[g.TargetType+"\x00"+g.TargetID]
		if !ok {
			// Left explicitly absent rather than blank. The screen says so, because an
			// empty preview otherwise reads as a rendering fault rather than as content
			// that is already gone.
			groups[i].TargetExists = false
			continue
		}
		groups[i].TargetExists = true
		groups[i].TargetPreview = truncateRunes(p.text, previewRunes)
		groups[i].TargetStatus = p.status
		groups[i].ThreadID = p.threadID
	}
	return nil
}

// ResolveReports closes every pending report against one target.
//
// It acts on the target rather than on a report id because that is the unit the queue shows
// and the unit a moderator decides about. Resolving one row at a time would leave the other
// complaints about the same post pending, and the post would reappear in the queue already
// handled.
//
// Deciding does not touch the content. Hiding a post is a separate action that does not
// exist yet, so a moderator marking something reviewed today is recording that they looked
// — see the note in the handler.
func (s *ReportService) ResolveReports(targetType, targetID, to string) (int64, error) {
	if !reportTargets[targetType] {
		return 0, ErrUnknownReportTarget
	}
	if !reportResolutions[to] {
		return 0, ErrInvalidReportResolution
	}

	res := s.db.Model(&Report{}).
		Where("target_type = ? AND target_id = ? AND status = ?",
			targetType, targetID, StatusPending).
		Update("status", to)
	if res.Error != nil {
		return 0, res.Error
	}
	if res.RowsAffected == 0 {
		return 0, ErrNoPendingReports
	}
	return res.RowsAffected, nil
}

// PendingReportQueue is the depth of the report queue, counted in targets rather than rows.
//
// Counting rows would report ten complaints about one post as ten things to do, so the
// badge would climb during a pile-on while the actual work stayed at one.
func (s *ReportService) PendingReportQueue() (QueueDepth, error) {
	var row struct {
		Cnt    int64
		Oldest *time.Time
	}
	err := s.db.Raw(
		`SELECT COUNT(DISTINCT target_type, target_id) AS cnt, MIN(created_at) AS oldest
		 FROM reports WHERE status = ?`, StatusPending).Scan(&row).Error
	if err != nil {
		return QueueDepth{}, err
	}
	d := QueueDepth{Pending: row.Cnt}
	if row.Oldest != nil {
		d.OldestPendingAgeHours = time.Since(*row.Oldest).Hours()
	}
	return d, nil
}
