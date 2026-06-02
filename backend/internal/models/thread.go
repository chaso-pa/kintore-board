package models

import "time"

// --- Thread ---

type CreateThreadInput struct {
	RawUserID string `header:"X-User-ID" doc:"Injected by auth middleware"`
	Body      struct {
		Type      string  `json:"type"      enum:"global,category,gym,machine" doc:"Thread type"`
		Title     string  `json:"title"     minLength:"1" maxLength:"200"       doc:"Thread title"`
		Category  *string `json:"category"                                      doc:"Category tag" required:"false"`
		GymID     *string `json:"gym_id"                                        doc:"Gym ID (for gym type)" required:"false"`
		MachineID *string `json:"machine_id"                                    doc:"Machine ID (for machine type)" required:"false"`
	}
}

type ThreadItem struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Title        string    `json:"title"`
	Category     string    `json:"category,omitempty"`
	GymID        string    `json:"gym_id,omitempty"`
	MachineID    string    `json:"machine_id,omitempty"`
	ReplyCount   int       `json:"reply_count"`
	HelpfulTotal int       `json:"helpful_total"`
	IsBookmarked bool      `json:"is_bookmarked"`
	CreatedAt    time.Time `json:"created_at"`
}

type ListThreadsInput struct {
	Cursor   string `query:"cursor"   doc:"Pagination cursor"`
	Limit    int    `query:"limit"    default:"20"  doc:"Items per page"`
	Sort     string `query:"sort"     default:"new" enum:"new,hot" doc:"Sort order"`
	Category string `query:"category" required:"false" doc:"Category filter"`
}

type ListThreadsOutput struct {
	Body CursorPage[ThreadItem]
}

type CreateThreadOutput struct {
	Body ThreadItem
}

type GetThreadInput struct {
	ThreadID string `path:"threadId" doc:"Thread ID"`
}

type GetThreadOutput struct {
	Body ThreadItem
}

// --- Hot threads ---

type ListHotThreadsOutput struct {
	Body struct {
		Items []ThreadItem `json:"items"`
	}
}

// --- Bookmarks ---

type BookmarkThreadInput struct {
	ThreadID string   `path:"threadId" doc:"Thread ID"`
	Body     struct{} // empty
}

type BookmarkThreadOutput struct {
	Body struct {
		Bookmarked bool `json:"bookmarked"`
	}
}

type UnbookmarkThreadInput struct {
	ThreadID string `path:"threadId" doc:"Thread ID"`
}

type UnbookmarkThreadOutput struct{}

type ListBookmarksInput struct {
	Cursor   string `query:"cursor"   doc:"Pagination cursor"`
	Limit    int    `query:"limit"    default:"20"  doc:"Items per page"`
	Category string `query:"category" required:"false" doc:"Category filter"`
}

type ListBookmarksOutput struct {
	Body CursorPage[ThreadItem]
}

// --- Post ---

type CreatePostInput struct {
	ThreadID string `path:"threadId" doc:"Thread ID"`
	Body     struct {
		Body string `json:"body" minLength:"1" doc:"Post body"`
	}
}

type PostItem struct {
	ID                string    `json:"id"`
	ThreadID          string    `json:"thread_id"`
	AnonymousThreadID string    `json:"anonymous_id"`
	Body              string    `json:"body"`
	HelpfulCount      int       `json:"helpful_count"`
	CreatedAt         time.Time `json:"created_at"`
}

type ListPostsInput struct {
	ThreadID string `path:"threadId" doc:"Thread ID"`
	Cursor   string `query:"cursor"  doc:"Pagination cursor"`
	Limit    int    `query:"limit"   default:"50"           doc:"Items per page"`
}

type ListPostsOutput struct {
	Body CursorPage[PostItem]
}

type CreatePostOutput struct {
	Body PostItem
}

type HelpfulPostInput struct {
	PostID string   `path:"postId" doc:"Post ID"`
	Body   struct{} // empty body, just increment
}

type HelpfulPostOutput struct {
	Body struct {
		HelpfulCount int `json:"helpful_count"`
	}
}
