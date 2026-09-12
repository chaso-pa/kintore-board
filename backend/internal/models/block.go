package models

import "time"

// BlockUserInput names the post, not the person.
//
// There is no user id in this API at all, in either direction. The app only ever sees a
// per-thread anonymous id, so a body carrying a user id would have to be filled from
// something the client is not given — and adding it to the post listing to make this
// endpoint usable would undo the anonymity the whole board is built on.
type BlockUserInput struct {
	PostID string `path:"postId" doc:"Post whose author should be blocked"`
}

// BlockItem is one row of the block management screen.
//
// BlockedUserID is opaque and is only useful as the argument to DELETE. It identifies
// nobody: it appears on no post, no thread and no profile, so holding one tells the client
// nothing it could match against anything else it can see.
type BlockItem struct {
	BlockedUserID string    `json:"blocked_user_id" doc:"Opaque handle; pass to DELETE to unblock"`
	SourceExcerpt string    `json:"source_excerpt"  doc:"Start of the post the block was made from, if still known"`
	CreatedAt     time.Time `json:"created_at"`
}

type BlockUserOutput struct {
	Body BlockItem
}

type ListBlocksInput struct{}

type ListBlocksOutput struct {
	Body struct {
		Items []BlockItem `json:"items"`
	}
}

type UnblockInput struct {
	BlockedUserID string `path:"blockedUserId" doc:"Value from BlockItem.blocked_user_id"`
}

type UnblockOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}
