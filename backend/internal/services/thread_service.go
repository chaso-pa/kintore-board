package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/chaso-pa/gin-template/internal/utils"
	"gorm.io/gorm"
)

type Thread struct {
	ID              string `gorm:"primaryKey;type:varchar(36)"`
	Type            string
	Title           string
	Category        *string   `gorm:"column:category"`
	GymID           *string   `gorm:"column:gym_id"`
	MachineID       *string   `gorm:"column:machine_id"`
	CreatedByUserID string    `gorm:"column:created_by_user_id"`
	CreatedAt       time.Time `gorm:"column:created_at"`
	Status          string    `gorm:"default:active"`
	// computed fields (populated by queries)
	ReplyCount   int `gorm:"-"`
	HelpfulTotal int `gorm:"-"`
}

func (Thread) TableName() string { return "threads" }

type ThreadBookmark struct {
	ID        string    `gorm:"primaryKey;type:varchar(36)"`
	UserID    string    `gorm:"column:user_id"`
	ThreadID  string    `gorm:"column:thread_id"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

func (ThreadBookmark) TableName() string { return "thread_bookmarks" }

type Post struct {
	ID                string  `gorm:"primaryKey;type:varchar(36)"`
	ThreadID          string  `gorm:"column:thread_id"`
	UserID            string  `gorm:"column:user_id"`
	AnonymousThreadID string  `gorm:"column:anonymous_thread_id"`
	ReplyToID         *string `gorm:"column:reply_to_id"`
	Body              string
	HelpfulCount      int       `gorm:"column:helpful_count;default:0"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	Status            string    `gorm:"default:active"`
}

func (Post) TableName() string { return "posts" }

type ThreadService struct {
	db     *gorm.DB
	secret string
}

func NewThreadService(db *gorm.DB, secret string) *ThreadService {
	return &ThreadService{db: db, secret: secret}
}

// parseCursor decodes a composite cursor of the form "rfc3339nano|uuid".
func parseCursor(cursor string) (time.Time, string) {
	parts := strings.SplitN(cursor, "|", 2)
	if len(parts) != 2 {
		return time.Time{}, ""
	}
	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, ""
	}
	return t, parts[1]
}

func encodeCursor(t time.Time, id string) string {
	return fmt.Sprintf("%s|%s", t.UTC().Format(time.RFC3339Nano), id)
}

// threadWithStats is a helper struct for scan-based queries.
type threadWithStats struct {
	ID              string    `gorm:"column:id"`
	Type            string    `gorm:"column:type"`
	Title           string    `gorm:"column:title"`
	Category        *string   `gorm:"column:category"`
	GymID           *string   `gorm:"column:gym_id"`
	MachineID       *string   `gorm:"column:machine_id"`
	CreatedByUserID string    `gorm:"column:created_by_user_id"`
	CreatedAt       time.Time `gorm:"column:created_at"`
	Status          string    `gorm:"column:status"`
	ReplyCount      int       `gorm:"column:reply_count"`
	HelpfulTotal    int       `gorm:"column:helpful_total"`
}

func toThread(r threadWithStats) Thread {
	return Thread{
		ID:              r.ID,
		Type:            r.Type,
		Title:           r.Title,
		Category:        r.Category,
		GymID:           r.GymID,
		MachineID:       r.MachineID,
		CreatedByUserID: r.CreatedByUserID,
		CreatedAt:       r.CreatedAt,
		Status:          r.Status,
		ReplyCount:      r.ReplyCount,
		HelpfulTotal:    r.HelpfulTotal,
	}
}

const statsSubquery = `
	LEFT JOIN (
		SELECT thread_id,
			COUNT(*) AS reply_count,
			COALESCE(SUM(helpful_count), 0) AS helpful_total
		FROM posts WHERE status = 'active'
		GROUP BY thread_id
	) ps ON ps.thread_id = threads.id`

// Filtering the board by gym is left unfiltered on purpose, and the reason is narrower
// than "it does not read gyms" — that phrasing would excuse anything holding a foreign
// key, including the favourites listing, which turned out to read gyms after all.
//
// What is actually disclosed here is a gym id and the text its author wrote. None of the
// gym's own attributes — name, address, fees, photos — travel with a thread, and the id
// on its own buys nothing, since fetching the gym still 404s. The residual effect is that
// a pending gym's existence becomes observable, which is accepted: moderating the board
// itself was explicitly left out of this work.
//
//moderation:exempt: 開示されるのは gym_id と投稿者自身が書いた文字列のみ。ジムの属性は開示されない
func (s *ThreadService) ListThreads(cursor, sort, category, gymID, machineID string, limit int) ([]Thread, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var rows []threadWithStats
	q := s.db.Table("threads").
		Select("threads.*, COALESCE(ps.reply_count, 0) AS reply_count, COALESCE(ps.helpful_total, 0) AS helpful_total").
		Joins(statsSubquery).
		Where("threads.status = ?", "active")

	if category != "" {
		q = q.Where("threads.category = ?", category)
	}
	if gymID != "" {
		q = q.Where("threads.gym_id = ?", gymID)
	}
	if machineID != "" {
		q = q.Where("threads.machine_id = ?", machineID)
	}

	switch sort {
	case "hot":
		// hot sort ranks by 30-day score; cursor pagination is not supported
		// because score-based keyset pagination requires encoding the score itself.
		// The hot tab shows the top results without further pagination.
		cutoff := time.Now().AddDate(0, 0, -30)
		q = q.Joins(`LEFT JOIN (
			SELECT thread_id,
				COUNT(*) + COALESCE(SUM(helpful_count), 0) AS hot_score
			FROM posts WHERE status = 'active' AND created_at >= ?
			GROUP BY thread_id
		) hs ON hs.thread_id = threads.id`, cutoff).
			Order("COALESCE(hs.hot_score, 0) DESC, threads.created_at DESC, threads.id DESC")
	default: // "new"
		q = q.Order("threads.created_at DESC, threads.id DESC")
		if cursor != "" {
			if ct, cid := parseCursor(cursor); !ct.IsZero() && cid != "" {
				q = q.Where("(threads.created_at < ? OR (threads.created_at = ? AND threads.id < ?))", ct, ct, cid)
			}
		}
	}

	if err := q.Limit(limit + 1).Scan(&rows).Error; err != nil {
		return nil, "", err
	}

	next := ""
	if len(rows) > limit {
		if sort != "hot" {
			next = encodeCursor(rows[limit-1].CreatedAt, rows[limit-1].ID)
		}
		rows = rows[:limit]
	}

	threads := make([]Thread, len(rows))
	for i, r := range rows {
		threads[i] = toThread(r)
	}
	return threads, next, nil
}

func (s *ThreadService) ListHotThreads(limit int) ([]Thread, error) {
	if limit <= 0 || limit > 10 {
		limit = 5
	}
	cutoff := time.Now().AddDate(0, 0, -30)

	var rows []threadWithStats
	err := s.db.Table("threads").
		Select("threads.*, COALESCE(ps.reply_count, 0) AS reply_count, COALESCE(ps.helpful_total, 0) AS helpful_total").
		Joins(statsSubquery).
		Joins(`LEFT JOIN (
			SELECT thread_id,
				COUNT(*) + COALESCE(SUM(helpful_count), 0) AS hot_score
			FROM posts WHERE status = 'active' AND created_at >= ?
			GROUP BY thread_id
		) hs ON hs.thread_id = threads.id`, cutoff).
		Where("threads.status = ?", "active").
		Order("COALESCE(hs.hot_score, 0) DESC, threads.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	threads := make([]Thread, len(rows))
	for i, r := range rows {
		threads[i] = toThread(r)
	}
	return threads, nil
}

// requireVisibleTarget stops a thread from being anchored to a gym or machine the author
// is not entitled to see.
//
// Threads themselves are not moderated, and their listing filters on threads.status
// alone — so without this a pending gym's id, and whatever title the author chose, would
// reach the board feed for everyone. Only the anchor is checked; deciding whether the
// board itself needs review is a separate question that was deliberately left open.
//
//moderation:exempt: 可視性は scopedOn で判定し、書き込むのは threads のみ
func (s *ThreadService) requireVisibleTarget(v Viewer, gymID, machineID string) error {
	if gymID != "" {
		q, err := scopedOn(s.db, v, tblGyms, "")
		if err != nil {
			return err
		}
		var g Gym
		if err := q.Select("gyms.id").Where("gyms.id = ?", gymID).First(&g).Error; err != nil {
			return err
		}
	}
	if machineID != "" {
		q, err := scopedOn(s.db, v, tblMachines, "")
		if err != nil {
			return err
		}
		var m Machine
		if err := q.Select("machines.id").Where("machines.id = ?", machineID).First(&m).Error; err != nil {
			return err
		}
	}
	return nil
}

//moderation:exempt: 対象の可視性は requireVisibleTarget で検証済み。書き込むのは threads と posts のみ
func (s *ThreadService) CreateThread(v Viewer, userID, typ, title, category, gymID, machineID, firstPost string) (*Thread, *Post, error) {
	if err := s.requireVisibleTarget(v, gymID, machineID); err != nil {
		return nil, nil, err
	}
	t := &Thread{
		ID:              newUUID(),
		Type:            typ,
		Title:           title,
		Category:        utils.StrOrNil(category),
		GymID:           utils.StrOrNil(gymID),
		MachineID:       utils.StrOrNil(machineID),
		CreatedByUserID: userID,
	}
	p := &Post{
		ID:                newUUID(),
		UserID:            userID,
		AnonymousThreadID: utils.GenerateAnonymousThreadID(userID, t.ID, s.secret),
		Body:              firstPost,
	}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(t).Error; err != nil {
			return err
		}
		p.ThreadID = t.ID
		return tx.Create(p).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return t, p, nil
}

func (s *ThreadService) ListRelatedThreads(threadID string, limit int) ([]Thread, error) {
	if limit <= 0 || limit > 10 {
		limit = 5
	}
	var current threadWithStats
	if err := s.db.Table("threads").Select("category").Where("id = ?", threadID).First(&current).Error; err != nil {
		return nil, err
	}
	if current.Category == nil {
		return nil, nil
	}

	var rows []threadWithStats
	err := s.db.Table("threads").
		Select("threads.*, COALESCE(ps.reply_count, 0) AS reply_count, COALESCE(ps.helpful_total, 0) AS helpful_total").
		Joins(statsSubquery).
		Where("threads.status = ? AND threads.category = ? AND threads.id != ?", "active", *current.Category, threadID).
		Order("threads.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	threads := make([]Thread, len(rows))
	for i, r := range rows {
		threads[i] = toThread(r)
	}
	return threads, nil
}

func (s *ThreadService) GetThread(id string) (*Thread, error) {
	var row threadWithStats
	err := s.db.Table("threads").
		Select("threads.*, COALESCE(ps.reply_count, 0) AS reply_count, COALESCE(ps.helpful_total, 0) AS helpful_total").
		Joins(statsSubquery).
		Where("threads.id = ? AND threads.status = ?", id, "active").
		First(&row).Error
	if err != nil {
		return nil, err
	}
	t := toThread(row)
	return &t, nil
}

// --- Bookmark ---

func (s *ThreadService) BookmarkThread(userID, threadID string) error {
	if s.IsBookmarked(userID, threadID) {
		return nil
	}
	bm := &ThreadBookmark{
		ID:       newUUID(),
		UserID:   userID,
		ThreadID: threadID,
	}
	return s.db.Create(bm).Error
}

func (s *ThreadService) UnbookmarkThread(userID, threadID string) error {
	return s.db.Where("user_id = ? AND thread_id = ?", userID, threadID).Delete(&ThreadBookmark{}).Error
}

func (s *ThreadService) IsBookmarked(userID, threadID string) bool {
	var count int64
	s.db.Model(&ThreadBookmark{}).Where("user_id = ? AND thread_id = ?", userID, threadID).Count(&count)
	return count > 0
}

func (s *ThreadService) ListBookmarks(userID, cursor, category string, limit int) ([]Thread, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	q := s.db.Table("thread_bookmarks").
		Select("threads.*, COALESCE(ps.reply_count, 0) AS reply_count, COALESCE(ps.helpful_total, 0) AS helpful_total").
		Joins("JOIN threads ON threads.id = thread_bookmarks.thread_id").
		Joins(statsSubquery).
		Where("thread_bookmarks.user_id = ? AND threads.status = ?", userID, "active").
		Order("thread_bookmarks.created_at DESC")

	if category != "" {
		q = q.Where("threads.category = ?", category)
	}

	if cursor != "" {
		if ct, cid := parseCursor(cursor); !ct.IsZero() && cid != "" {
			q = q.Where("(thread_bookmarks.created_at < ? OR (thread_bookmarks.created_at = ? AND threads.id < ?))", ct, ct, cid)
		}
	}

	var rows []threadWithStats
	if err := q.Limit(limit + 1).Scan(&rows).Error; err != nil {
		return nil, "", err
	}

	next := ""
	if len(rows) > limit {
		next = encodeCursor(rows[limit-1].CreatedAt, rows[limit-1].ID)
		rows = rows[:limit]
	}

	threads := make([]Thread, len(rows))
	for i, r := range rows {
		threads[i] = toThread(r)
	}
	return threads, next, nil
}

// --- Posts ---

func (s *ThreadService) ListPosts(threadID, cursor string, limit int) ([]Post, string, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := s.db.Where("thread_id = ? AND status = ?", threadID, "active").Order("created_at ASC, id ASC").Limit(limit + 1)
	if cursor != "" {
		if ct, cid := parseCursor(cursor); !ct.IsZero() && cid != "" {
			q = q.Where("(created_at > ? OR (created_at = ? AND id > ?))", ct, ct, cid)
		}
	}
	var rows []Post
	if err := q.Find(&rows).Error; err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > limit {
		next = encodeCursor(rows[limit-1].CreatedAt, rows[limit-1].ID)
		rows = rows[:limit]
	}
	return rows, next, nil
}

func (s *ThreadService) CreatePost(threadID, userID, body string) (*Post, error) {
	p := &Post{
		ID:                newUUID(),
		ThreadID:          threadID,
		UserID:            userID,
		AnonymousThreadID: utils.GenerateAnonymousThreadID(userID, threadID, s.secret),
		Body:              body,
	}
	if err := s.db.Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

// --- Removal ---

// What a removed row's status says about who removed it.
//
// The two are kept apart because they answer different questions. "The author took this
// down" and "a moderator took this down" look identical in a single deleted state, and the
// difference is the whole record of whether moderation is being used and how.
//
// Neither is StatusRejected: that means "reviewed before publication and refused", which is
// the gyms and machines lifecycle. A post here was published, read, and then taken away.
const (
	PostStatusDeleted = "deleted" // 投稿者本人による削除
	PostStatusRemoved = "removed" // 運営による削除
)

// ErrAlreadyDeleted is what a second delete gets. Like ErrNotPending it is decided by the
// WHERE clause as well as the preceding read, so two requests racing cannot both report
// success.
var ErrAlreadyDeleted = errors.New("already deleted")

// removableTable pairs a table with the column naming its author.
//
// Unexported and only ever built from the two values below, so no caller can assemble one
// out of request data and point the UPDATE at another table.
type removableTable struct {
	name     string
	ownerCol string
}

var (
	tblPosts   = removableTable{"posts", "user_id"}
	tblThreads = removableTable{"threads", "created_by_user_id"}
)

// softDelete hides a row instead of destroying it, and reports which kind of removal it was.
//
// Nothing is deleted for real, for a reason that only shows up later: a report points at
// this row, and the moderation queue reads the row to show what was complained about. Drop
// the row and every report about it becomes a complaint about content nobody can ever see
// again — including the moderator deciding whether the removal was right.
//
// Removal is not undone anywhere yet, so the row also is the only way back from a mistake.
func (s *ThreadService) softDelete(v Viewer, t removableTable, id string) (string, error) {
	var row struct {
		Owner  string `gorm:"column:owner"`
		Status string `gorm:"column:status"`
	}
	err := s.db.Table(t.name).
		Select(fmt.Sprintf("%s AS owner, status", t.ownerCol)).
		Where("id = ?", id).
		Take(&row).Error
	if err != nil {
		return "", err
	}
	if row.Status != StatusActive {
		return "", ErrAlreadyDeleted
	}
	// An unidentified caller owns nothing. Without this the comparison below is "" == "",
	// so a signed-out request would delete any row whose author column had somehow ended up
	// empty. The auth middleware makes that unreachable today, which is exactly what makes
	// it worth pinning: the check is invisible until the day something changes upstream.
	if v.UserID == "" {
		return "", ErrForbidden
	}
	// Posts are public, so refusing with 403 rather than 404 discloses nothing that reading
	// the thread would not already tell you.
	if !v.IsAdmin && row.Owner != v.UserID {
		return "", ErrForbidden
	}

	// An admin deleting their own post is an author, not a moderator. Recording it as a
	// moderator action would inflate the only record of how much moderation is happening.
	to := PostStatusDeleted
	if row.Owner != v.UserID {
		to = PostStatusRemoved
	}

	res := s.db.Table(t.name).
		Where("id = ? AND status = ?", id, StatusActive).
		Update("status", to)
	if res.Error != nil {
		return "", res.Error
	}
	if res.RowsAffected == 0 {
		return "", ErrAlreadyDeleted
	}
	return to, nil
}

// DeletePost hides one reply.
//
// The reply disappears from the thread rather than leaving a tombstone. The stats subquery
// already counts only active posts, so the thread's reply count follows without a second
// place to keep in step — a tombstone would need that count to mean something different
// from what the listing shows.
func (s *ThreadService) DeletePost(v Viewer, postID string) (string, error) {
	return s.softDelete(v, tblPosts, postID)
}

// DeleteThread hides a whole thread.
//
// Its posts are left alone deliberately. They are only reachable through the thread, which
// now 404s, so hiding them as well would be a second write that can half-fail — and it
// would destroy the distinction between a reply its author removed and one that merely went
// down with the thread.
func (s *ThreadService) DeleteThread(v Viewer, threadID string) (string, error) {
	return s.softDelete(v, tblThreads, threadID)
}

func (s *ThreadService) IncrementHelpful(postID string) (int, error) {
	if err := s.db.Model(&Post{}).Where("id = ?", postID).
		UpdateColumn("helpful_count", gorm.Expr("helpful_count + 1")).Error; err != nil {
		return 0, err
	}
	var p Post
	if err := s.db.Select("helpful_count").Where("id = ?", postID).First(&p).Error; err != nil {
		return 0, err
	}
	return p.HelpfulCount, nil
}
