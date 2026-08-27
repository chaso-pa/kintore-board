package services

import (
	"errors"
	"strings"
	"testing"
)

var (
	viewerAdmin   = Viewer{UserID: "admin-1", IsAdmin: true}
	viewerCreator = Viewer{UserID: "creator-1"}
	viewerOther   = Viewer{UserID: "other-1"}
	viewerAnon    = Viewer{}
)

// The full grid of (requested x viewer). This is the semantic half of the guarantee:
// moderation_static_test.go proves every path goes through the filter, and this proves
// the filter says the right thing once it gets there.
func TestVisibilityFilterGrid(t *testing.T) {
	cases := []struct {
		name      string
		viewer    Viewer
		requested string
		wantErr   error
		// wantStatuses are the status values that must appear as bind arguments, in order.
		wantStatuses []string
		// wantCreatorBound is true when the viewer's own id must be bound, which is what
		// restricts "pending" to the caller's own rows.
		wantCreatorBound bool
	}{
		// --- default view ---
		{"default/admin", viewerAdmin, "", nil, []string{StatusActive, StatusPending}, false},
		{"default/creator", viewerCreator, "", nil, []string{StatusActive, StatusPending}, true},
		{"default/other", viewerOther, "", nil, []string{StatusActive, StatusPending}, true},
		{"default/anon", viewerAnon, "", nil, []string{StatusActive}, false},

		// --- explicit active ---
		{"active/admin", viewerAdmin, StatusActive, nil, []string{StatusActive}, false},
		{"active/creator", viewerCreator, StatusActive, nil, []string{StatusActive}, false},
		{"active/anon", viewerAnon, StatusActive, nil, []string{StatusActive}, false},

		// --- explicit pending ---
		{"pending/admin", viewerAdmin, StatusPending, nil, []string{StatusPending}, false},
		{"pending/creator", viewerCreator, StatusPending, nil, []string{StatusPending}, true},
		{"pending/other", viewerOther, StatusPending, nil, []string{StatusPending}, true},
		{"pending/anon", viewerAnon, StatusPending, ErrForbiddenStatusFilter, nil, false},

		// --- explicit rejected: admin only ---
		{"rejected/admin", viewerAdmin, StatusRejected, nil, []string{StatusRejected}, false},
		{"rejected/creator", viewerCreator, StatusRejected, ErrForbiddenStatusFilter, nil, false},
		{"rejected/anon", viewerAnon, StatusRejected, ErrForbiddenStatusFilter, nil, false},

		// --- allowlist ---
		{"unknown value", viewerAdmin, "deleted", ErrInvalidStatusFilter, nil, false},
		{"sql fragment", viewerAdmin, "active' OR '1'='1", ErrInvalidStatusFilter, nil, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pred, args, err := visibilityFilter(tc.viewer, tblGyms, tc.requested)

			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				if pred != "" || args != nil {
					t.Errorf("on error the predicate must be empty, got %q / %v", pred, args)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			var gotStatuses []string
			creatorBound := false
			for _, a := range args {
				s, _ := a.(string)
				switch s {
				case StatusActive, StatusPending, StatusRejected:
					gotStatuses = append(gotStatuses, s)
				case tc.viewer.UserID:
					creatorBound = true
				}
			}
			if strings.Join(gotStatuses, ",") != strings.Join(tc.wantStatuses, ",") {
				t.Errorf("bound statuses = %v, want %v (predicate %q)", gotStatuses, tc.wantStatuses, pred)
			}
			if creatorBound != tc.wantCreatorBound {
				t.Errorf("creator id bound = %v, want %v (predicate %q)", creatorBound, tc.wantCreatorBound, pred)
			}
			if len(args) != strings.Count(pred, "?") {
				t.Errorf("predicate has %d placeholders but %d args were bound: %q / %v",
					strings.Count(pred, "?"), len(args), pred, args)
			}
		})
	}
}

// Rejected rows are invisible in the default view even to the person who created them.
// This is the one rule most likely to be softened by accident, so it is pinned on its own.
func TestVisibilityFilterHidesRejectedFromEveryoneByDefault(t *testing.T) {
	for _, v := range []Viewer{viewerAdmin, viewerCreator, viewerOther, viewerAnon} {
		pred, args, err := visibilityFilter(v, tblGyms, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		for _, a := range args {
			if s, _ := a.(string); s == StatusRejected {
				t.Errorf("viewer %+v: default view binds 'rejected' (%q)", v, pred)
			}
		}
	}
}

// The photo tables name their creator differently from gyms and machines. Getting this
// pairing wrong would compare a gym's creator column against a photo row.
func TestVisibilityFilterUsesEachTablesOwnCreatorColumn(t *testing.T) {
	cases := []struct {
		table    moderatedTable
		wantCol  string
		wantName string
	}{
		{tblGyms, "gyms.created_by_user_id", "gyms"},
		{tblMachines, "machines.created_by_user_id", "machines"},
		{tblGymPhotos, "gym_photos.uploaded_by_user_id", "gym_photos"},
		{tblMachinePhotos, "machine_photos.uploaded_by_user_id", "machine_photos"},
	}
	for _, tc := range cases {
		t.Run(tc.wantName, func(t *testing.T) {
			pred, _, err := visibilityFilter(viewerCreator, tc.table, "")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(pred, tc.wantCol) {
				t.Errorf("predicate %q does not reference %q", pred, tc.wantCol)
			}
			if !strings.Contains(pred, tc.wantName+".status") {
				t.Errorf("predicate %q does not qualify status with the table name", pred)
			}
		})
	}
}

// Column references must stay qualified. An unqualified "status" breaks the moment a
// query joins two moderated tables, and it breaks silently by matching the wrong one.
func TestVisibilityFilterQualifiesColumns(t *testing.T) {
	pred, _, err := visibilityFilter(viewerCreator, tblMachines, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if strings.Contains(pred, " status") || strings.HasPrefix(pred, "status") {
		t.Errorf("predicate contains an unqualified status column: %q", pred)
	}
}
