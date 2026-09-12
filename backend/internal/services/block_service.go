package services

import (
	"errors"
	"log"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
)

// UserBlock is one person deciding they are done with another.
//
// The row is directional — only the blocker can lift it — but the effect is not: once it
// exists, neither account sees the other's posts or threads. App Store guideline 1.2 only
// asks that the blocker's own feed be cleaned, and a one-way hide is what most boards do.
// Two-way was chosen anyway because a one-way hide leaves the person being escaped still
// able to read and reply to everything the blocker writes; the blocker stops seeing the
// harassment without it stopping. On a board where nothing but a per-thread anonymous id is
// ever shown, the usual cost of two-way blocking — the other side noticing — barely applies.
type UserBlock struct {
	ID            string    `gorm:"primaryKey;type:varchar(36)"`
	BlockerUserID string    `gorm:"column:blocker_user_id"`
	BlockedUserID string    `gorm:"column:blocked_user_id"`
	SourceExcerpt *string   `gorm:"column:source_excerpt"`
	CreatedAt     time.Time `gorm:"column:created_at"`
}

func (UserBlock) TableName() string { return "user_blocks" }

var (
	// ErrCannotBlockSelf catches the one target that would be actively harmful to accept:
	// a self-block writes a row that hides the account's own posts from itself, in both
	// directions, with a management screen that offers to unblock a user the person cannot
	// identify as themselves.
	ErrCannotBlockSelf = errors.New("cannot block yourself")
)

// excerptRunes caps what is copied out of the post that triggered a block.
//
// Enough to recognise which conversation it was, short enough that the blocks table is not
// a second copy of the board.
const excerptRunes = 40

type BlockService struct {
	db      *gorm.DB
	reports *ReportService
}

// NewBlockService takes the report service rather than a db handle for it, because the
// notification path below is the whole reason blocking satisfies guideline 1.2 and it should
// not be possible to construct a BlockService that quietly cannot notify anyone.
func NewBlockService(db *gorm.DB, reports *ReportService) *BlockService {
	return &BlockService{db: db, reports: reports}
}

// excerptOf trims a post body down to something a management screen can show.
//
// Sliced by rune rather than by byte: every post on this board is Japanese, so a byte slice
// would cut a character in half far more often than not.
func excerptOf(body string) *string {
	trimmed := body
	if utf8.RuneCountInString(trimmed) > excerptRunes {
		n := 0
		for i := range trimmed {
			if n == excerptRunes {
				trimmed = trimmed[:i] + "…"
				break
			}
			n++
		}
	}
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

// BlockAuthorOfPost hides whoever wrote a post, named by the post rather than by the author.
//
// The post id is the whole input on purpose. The app never learns anyone's user id — posts
// carry a per-thread anonymous id and nothing else — so an endpoint taking a user id would
// either be unusable or would force the listing to start disclosing identities. Resolving
// the author here keeps the anonymity model intact and means a caller can only block someone
// they can actually see.
//
// Blocking something already blocked returns the existing row. Same reasoning as CreateReport:
// the person tapped a button meaning "make this stop", and the honest answer to a second tap
// is that it has stopped, not that they made a mistake.
func (s *BlockService) BlockAuthorOfPost(v Viewer, postID string) (*UserBlock, error) {
	var p Post
	if err := s.db.Select("id", "user_id", "body").
		Where("id = ? AND status = ?", postID, StatusActive).First(&p).Error; err != nil {
		return nil, err
	}
	if p.UserID == v.UserID {
		return nil, ErrCannotBlockSelf
	}

	existing, err := s.find(v.UserID, p.UserID)
	if err == nil {
		// Still notify: a second block on the same person is a second complaint, and the
		// queue reads report counts as "how many people", not "how many taps" — the unique
		// index there collapses this back to one row anyway.
		s.notify(v, postID)
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	b := &UserBlock{
		ID:            newUUID(),
		BlockerUserID: v.UserID,
		BlockedUserID: p.UserID,
		SourceExcerpt: excerptOf(p.Body),
	}
	if err := s.db.Create(b).Error; err != nil {
		// Two taps racing each other; the unique index rejected the loser. The row the
		// winner wrote is the answer to both.
		if again, e := s.find(v.UserID, p.UserID); e == nil {
			s.notify(v, postID)
			return again, nil
		}
		return nil, err
	}

	s.notify(v, postID)
	return b, nil
}

// notify puts the blocked post in front of a moderator.
//
// This is the half of guideline 1.2 that says blocking must "notify the developer of the
// inappropriate content". Rather than a second pipeline, a block files into the report queue
// the app already has, so /moderation/reports is the one place complaints arrive.
//
// Failures are logged and swallowed, deliberately. The daily report cap exists to stop one
// account burying the queue, but a person who has hit it is exactly the person most likely to
// need the next block — letting the cap refuse it would mean rate-limiting someone out of
// protecting themselves. The block is the part that must not fail; the notification is the
// part that can be retried by the next person who blocks the same post.
func (s *BlockService) notify(v Viewer, postID string) {
	if _, err := s.reports.CreateReport(v, ReportTargetPost, postID, ReasonBlock, blockReportDetail); err != nil {
		log.Printf("block: could not file moderation report for post %s: %v", postID, err)
	}
}

// find looks for a block this user has already placed on this person.
func (s *BlockService) find(blockerID, blockedID string) (*UserBlock, error) {
	var b UserBlock
	err := s.db.Where("blocker_user_id = ? AND blocked_user_id = ?", blockerID, blockedID).
		First(&b).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Unblock lifts a block. Scoped by blocker so one account cannot clear another's list.
//
// Removing something that is not there is a success. The management screen is the only caller,
// and a stale row it is trying to delete is already in the state the caller asked for.
func (s *BlockService) Unblock(v Viewer, blockedUserID string) error {
	return s.db.Where("blocker_user_id = ? AND blocked_user_id = ?", v.UserID, blockedUserID).
		Delete(&UserBlock{}).Error
}

// ListBlocks returns what this account has blocked, newest first.
//
// Only blocks this person placed. The ones placed against them are deliberately absent:
// they are not theirs to lift, and showing them would tell someone they have been blocked,
// which is the disclosure two-way hiding exists to avoid.
func (s *BlockService) ListBlocks(v Viewer) ([]UserBlock, error) {
	var rows []UserBlock
	err := s.db.Where("blocker_user_id = ?", v.UserID).
		Order("created_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

// blockedPredicate is the filter every listing runs through.
//
// One subquery covering both directions, rather than loading the ids and filtering in Go:
// the block list is per-viewer, so fetching it first would add a query to every page of every
// listing in the app.
//
// Returning ("", nil) for an anonymous viewer is what keeps the caller from having to special
// case it — appending an empty predicate is a no-op in GORM, and a viewer with no account has
// blocked nobody.
func blockedPredicate(userID, column string) (string, []any) {
	if userID == "" {
		return "", nil
	}
	return column + ` NOT IN (
		SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = ?
		UNION
		SELECT blocker_user_id  FROM user_blocks WHERE blocked_user_id = ?
	)`, []any{userID, userID}
}

// excludeBlocked attaches the predicate to a query.
//
// Every listing goes through this rather than writing its own Where, so that the two-way
// shape lives in exactly one place. The listings were audited together once; the next person
// to add one should not have to rediscover that "blocked" means both directions.
func excludeBlocked(q *gorm.DB, userID, column string) *gorm.DB {
	pred, args := blockedPredicate(userID, column)
	if pred == "" {
		return q
	}
	return q.Where(pred, args...)
}
