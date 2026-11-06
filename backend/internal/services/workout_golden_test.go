package services

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/chaso-pa/gin-template/internal/models"
)

// Golden cases for the record-tab aggregates, shared with the device.
//
// The device computes these numbers from its own SQLite copy, and they have to match what
// the server would answer. testdata/*_cases.json pins both sides: this file feeds each case
// through the server's own aggregation code, and the TypeScript port reads the same files.
// The schema is documented in testdata/README.md.
//
// Two paths read the cases:
//
//   - TestGolden* (here, always runs): no database. The SQL part of each query — scoping,
//     filtering, ordering, SUM — is reproduced in goldenEval with the semantics the SQL has,
//     and the Go part is the real code (pickWorkoutDates, maxE1RM, aggregateExerciseHistory,
//     summarizeExercises, EstimateOneRM). This is also the reference the TS port follows.
//   - TestGoldenAgainstMySQL (workout_golden_integration_test.go, -tags integration): loads
//     each case into a real MySQL and calls the WorkoutService methods themselves, so the
//     SQL reproduced here is checked against the SQL that runs.
//
// Regenerate the expected values after an intentional change with
//
//	go test ./internal/services/ -run TestGolden -update-golden
//
// and review the diff: an unexplained change in a number is a change in what users see.

var updateGolden = flag.Bool("update-golden", false, "rewrite expected values in testdata/*_cases.json")

type goldenSet struct {
	ID           string   `json:"id"`
	ExerciseName string   `json:"exercise_name"`
	Weight       *float64 `json:"weight"`
	Reps         *int     `json:"reps"`
	Sets         *int     `json:"sets"`
	Memo         *string  `json:"memo"`
	Spotted      bool     `json:"spotted"`
	BodyPart     *string  `json:"body_part"`
	SortOrder    int      `json:"sort_order"`
}

type goldenWorkout struct {
	ID        string      `json:"id"`
	UserID    string      `json:"user_id"`
	TrainedOn time.Time   `json:"trained_on"`
	Memo      *string     `json:"memo"`
	Sets      []goldenSet `json:"sets"`
}

type goldenQuery struct {
	Year            int    `json:"year,omitempty"`
	Month           int    `json:"month,omitempty"`
	ExerciseName    string `json:"exercise_name,omitempty"`
	BodyPart        string `json:"body_part,omitempty"`
	Unclassified    bool   `json:"unclassified,omitempty"`
	BeforeWorkoutID string `json:"before_workout_id,omitempty"`
}

func (q goldenQuery) filter() ExerciseFilter {
	return ExerciseFilter{BodyPart: q.BodyPart, Unclassified: q.Unclassified}
}

type goldenCase struct {
	Name     string          `json:"name"`
	Note     string          `json:"note,omitempty"`
	UserID   string          `json:"user_id"`
	Query    goldenQuery     `json:"query"`
	Workouts []goldenWorkout `json:"workouts"`
	Expected json.RawMessage `json:"expected"`
}

type goldenFile struct {
	Description string       `json:"description"`
	Cases       []goldenCase `json:"cases"`
}

// goldenKinds maps each testdata file to the server function it pins.
var goldenKinds = []string{
	"workout_dates",    // GetWorkoutDates            → GET /workouts/dates
	"workout_stats",    // GetWorkoutStats            → GET /workouts/stats
	"last_sets",        // GetLastExerciseSets        → GET /workouts/last-exercise-sets (null = 404)
	"max_e1rm",         // GetExerciseMaxE1RM         → GET /workouts/exercise-max-e1rm
	"exercise_history", // GetExerciseHistory         → GET /workouts/exercise-history
	"exercise_list",    // ListExercises              → GET /workouts/exercises
	"unclassified",     // UnclassifiedExerciseNames  → GET /workouts/unclassified-exercises
}

func goldenPath(kind string) string {
	return filepath.Join("testdata", kind+"_cases.json")
}

func loadGolden(t *testing.T, kind string) goldenFile {
	t.Helper()
	raw, err := os.ReadFile(goldenPath(kind))
	if err != nil {
		t.Fatalf("read %s: %v", goldenPath(kind), err)
	}
	var f goldenFile
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatalf("parse %s: %v", goldenPath(kind), err)
	}
	if len(f.Cases) == 0 {
		t.Fatalf("%s has no cases", goldenPath(kind))
	}
	return f
}

// --- GORM's view of a row: what the non-pointer service structs receive for NULL ---

func derefF(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

func derefI(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func derefS(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// --- SQL semantics, reproduced ---

func (c goldenCase) own() []goldenWorkout {
	var out []goldenWorkout
	for _, w := range c.Workouts {
		if w.UserID == c.UserID {
			out = append(out, w)
		}
	}
	return out
}

// partMatches is scopeToPart.
func partMatches(s goldenSet, f ExerciseFilter) bool {
	if f.Unclassified {
		return s.BodyPart == nil || *s.BodyPart == ""
	}
	if f.BodyPart != "" {
		return s.BodyPart != nil && *s.BodyPart == f.BodyPart
	}
	return true
}

// newerFirst is ORDER BY trained_on DESC, id DESC.
func newerFirst(ws []goldenWorkout) {
	sort.SliceStable(ws, func(i, j int) bool {
		if !ws[i].TrainedOn.Equal(ws[j].TrainedOn) {
			return ws[i].TrainedOn.After(ws[j].TrainedOn)
		}
		return ws[i].ID > ws[j].ID
	})
}

// goldenEval answers one case the way the server does, shaped as the API response body.
// A nil result is a 404.
func goldenEval(kind string, c goldenCase) any {
	q := c.Query
	switch kind {
	case "workout_dates":
		start := time.Date(q.Year, time.Month(q.Month), 1, 0, 0, 0, 0, time.UTC)
		end := start.AddDate(0, 1, 0)
		var in []goldenWorkout
		for _, w := range c.own() {
			if !w.TrainedOn.Before(start) && w.TrainedOn.Before(end) {
				in = append(in, w)
			}
		}
		newerFirst(in)
		rows := make([]Workout, len(in))
		for i, w := range in {
			rows[i] = Workout{ID: w.ID, TrainedOn: w.TrainedOn}
		}
		return datesBody(pickWorkoutDates(rows))

	case "workout_stats":
		own := c.own()
		volume := 0.0
		for _, w := range own {
			for _, s := range w.Sets {
				// weight * reps is NULL when either is, and SUM skips NULL.
				if s.Weight == nil || s.Reps == nil {
					continue
				}
				sets := 1
				if s.Sets != nil && *s.Sets > 1 {
					sets = *s.Sets
				}
				volume += *s.Weight * float64(*s.Reps) * float64(sets)
			}
		}
		return statsBody(int64(len(own)), volume)

	case "last_sets":
		f := q.filter()
		var candidates []goldenWorkout
		for _, w := range c.own() {
			for _, s := range w.Sets {
				if s.ExerciseName == q.ExerciseName && partMatches(s, f) {
					candidates = append(candidates, w)
					break
				}
			}
		}
		if len(candidates) == 0 {
			return nil
		}
		newerFirst(candidates)
		w := candidates[0]
		var sets []goldenSet
		for _, s := range w.Sets {
			if s.ExerciseName == q.ExerciseName && partMatches(s, f) {
				sets = append(sets, s)
			}
		}
		sort.SliceStable(sets, func(i, j int) bool {
			if sets[i].SortOrder != sets[j].SortOrder {
				return sets[i].SortOrder < sets[j].SortOrder
			}
			return sets[i].ID < sets[j].ID
		})
		res := &LastExerciseSetsResult{Date: w.TrainedOn.Format("2006-01-02")}
		for _, s := range sets {
			res.Sets = append(res.Sets, WorkoutSet{Weight: derefF(s.Weight), Reps: derefI(s.Reps)})
		}
		return lastSetsBody(res)

	case "max_e1rm":
		f := q.filter()
		var sets []WorkoutSet
		for _, w := range c.own() {
			if w.ID == q.BeforeWorkoutID {
				continue
			}
			for _, s := range w.Sets {
				// weight > 0 AND reps > 0 is not true for NULL.
				if s.ExerciseName != q.ExerciseName || !partMatches(s, f) ||
					s.Weight == nil || *s.Weight <= 0 || s.Reps == nil || *s.Reps <= 0 {
					continue
				}
				sets = append(sets, WorkoutSet{Weight: *s.Weight, Reps: *s.Reps})
			}
		}
		return maxE1RMBody(maxE1RM(sets))

	case "exercise_history":
		f := q.filter()
		var rows []exerciseSetRow
		for _, w := range c.own() {
			for _, s := range w.Sets {
				if s.ExerciseName != q.ExerciseName || !partMatches(s, f) {
					continue
				}
				rows = append(rows, exerciseSetRow{
					TrainedOn: w.TrainedOn, WorkoutID: w.ID, SetID: s.ID,
					Weight: derefF(s.Weight), Reps: derefI(s.Reps), Sets: derefI(s.Sets),
					Spotted: s.Spotted, SortOrder: s.SortOrder, Memo: derefS(s.Memo),
				})
			}
		}
		points, hasWeight := aggregateExerciseHistory(rows)
		return historyBody(q.ExerciseName, points, hasWeight)

	case "exercise_list":
		var rows []exerciseListRow
		for _, w := range c.own() {
			for _, s := range w.Sets {
				rows = append(rows, exerciseListRow{
					ExerciseName: s.ExerciseName, BodyPart: derefS(s.BodyPart),
					TrainedOn: w.TrainedOn, WorkoutID: w.ID,
					Weight: derefF(s.Weight), Reps: derefI(s.Reps),
				})
			}
		}
		return listBody(summarizeExercises(rows))

	case "unclassified":
		seen := map[string]bool{}
		names := []string{}
		for _, w := range c.own() {
			for _, s := range w.Sets {
				if (s.BodyPart == nil || *s.BodyPart == "") && !seen[s.ExerciseName] {
					seen[s.ExerciseName] = true
					names = append(names, s.ExerciseName)
				}
			}
		}
		return unclassifiedBody(names)
	}
	panic("unknown golden kind " + kind)
}

// --- Response bodies, built from the same models the handlers fill ---

func datesBody(entries []WorkoutDateEntry) any {
	var out models.GetWorkoutDatesOutput
	out.Body.Workouts = make([]models.WorkoutDateEntry, len(entries))
	for i, e := range entries {
		out.Body.Workouts[i] = models.WorkoutDateEntry{Date: e.Date, WorkoutID: e.WorkoutID}
	}
	return out.Body
}

func statsBody(count int64, volume float64) any {
	var out models.GetWorkoutStatsOutput
	out.Body.TotalWorkouts = count
	out.Body.TotalVolumeKg = volume
	return out.Body
}

func lastSetsBody(r *LastExerciseSetsResult) any {
	var out models.GetLastExerciseSetsOutput
	out.Body.Date = r.Date
	out.Body.Sets = make([]models.LastExerciseSetItem, len(r.Sets))
	for i, s := range r.Sets {
		out.Body.Sets[i] = models.LastExerciseSetItem{Weight: s.Weight, Reps: s.Reps}
	}
	return out.Body
}

func maxE1RMBody(v float64) any {
	var out models.GetExerciseMaxE1RMOutput
	out.Body.MaxE1RM = v
	return out.Body
}

func historyBody(name string, points []ExerciseHistoryPoint, hasWeight bool) any {
	var out models.GetExerciseHistoryOutput
	out.Body.ExerciseName = name
	out.Body.HasWeightData = hasWeight
	out.Body.Points = make([]models.ExerciseHistoryPointItem, len(points))
	for i, p := range points {
		sets := make([]models.ExerciseHistorySetItem, len(p.Sets))
		for j, s := range p.Sets {
			sets[j] = models.ExerciseHistorySetItem{
				WorkoutID: s.WorkoutID, Weight: s.Weight, Reps: s.Reps, Sets: s.Sets,
				Spotted: s.Spotted, Memo: s.Memo,
			}
		}
		out.Body.Points[i] = models.ExerciseHistoryPointItem{
			Date: p.Date, WorkoutIDs: p.WorkoutIDs, E1RM: p.E1RM, MaxWeight: p.MaxWeight,
			TotalVolume: p.TotalVolume, MaxReps: p.MaxReps, Sets: sets,
		}
	}
	return out.Body
}

func listBody(rows []ExerciseSummary) any {
	var out models.ListExercisesOutput
	out.Body.Items = make([]models.ExerciseSummaryItem, len(rows))
	for i, r := range rows {
		out.Body.Items[i] = models.ExerciseSummaryItem{
			ExerciseName: r.ExerciseName, BodyPart: r.BodyPart, LastTrainedOn: r.LastTrainedOn,
			SessionCount: r.SessionCount, BestE1RM: r.BestE1RM,
		}
	}
	return out.Body
}

// The SQL has no ORDER BY, so the names are sorted here and compared as a set.
func unclassifiedBody(names []string) any {
	sorted := append([]string{}, names...)
	sort.Strings(sorted)
	var out models.GetUnclassifiedExercisesOutput
	out.Body.ExerciseNames = sorted
	return out.Body
}

// --- Comparison ---

func canonicalJSON(t *testing.T, v any) any {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return out
}

func assertGolden(t *testing.T, kind string, c goldenCase, got any) {
	t.Helper()
	var want any
	if err := json.Unmarshal(c.Expected, &want); err != nil {
		t.Fatalf("%s/%s: expected is not JSON: %v", kind, c.Name, err)
	}
	g := canonicalJSON(t, got)
	if !reflect.DeepEqual(g, want) {
		gotRaw, _ := json.MarshalIndent(got, "", "  ")
		wantRaw, _ := json.MarshalIndent(want, "", "  ")
		t.Errorf("%s/%s:\n got: %s\nwant: %s", kind, c.Name, gotRaw, wantRaw)
	}
}

func writeGolden(t *testing.T, kind string, f goldenFile) {
	t.Helper()
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(f); err != nil {
		t.Fatalf("encode %s: %v", kind, err)
	}
	if err := os.WriteFile(goldenPath(kind), []byte(buf.String()), 0o644); err != nil {
		t.Fatalf("write %s: %v", kind, err)
	}
}

func TestGoldenAggregates(t *testing.T) {
	for _, kind := range goldenKinds {
		t.Run(kind, func(t *testing.T) {
			f := loadGolden(t, kind)
			if *updateGolden {
				for i := range f.Cases {
					raw, err := json.Marshal(goldenEval(kind, f.Cases[i]))
					if err != nil {
						t.Fatalf("marshal: %v", err)
					}
					f.Cases[i].Expected = raw
				}
				writeGolden(t, kind, f)
				return
			}
			for _, c := range f.Cases {
				assertGolden(t, kind, c, goldenEval(kind, c))
			}
		})
	}
}

// The fixtures must keep exercising the edges they exist for. Losing one of these from the
// data would leave the TS port unpinned exactly where it is most likely to drift.
func TestGoldenFixturesCoverTheEdges(t *testing.T) {
	var jstMidnightHalf, sameDay, sameInstant, nullWeight, nullReps, nullSets, repsOver36, unclassified, otherUser bool
	for _, kind := range goldenKinds {
		for _, c := range loadGolden(t, kind).Cases {
			days := map[string]int{}
			instants := map[time.Time]int{}
			for _, w := range c.Workouts {
				if w.UserID != c.UserID {
					otherUser = true
				}
				u := w.TrainedOn.UTC()
				if u.Hour() == 15 && u.Minute() == 30 {
					jstMidnightHalf = true // 00:30 JST the next day
				}
				days[u.Format("2006-01-02")+w.UserID]++
				instants[u]++
				for _, s := range w.Sets {
					nullWeight = nullWeight || s.Weight == nil
					nullReps = nullReps || s.Reps == nil
					nullSets = nullSets || s.Sets == nil
					repsOver36 = repsOver36 || (s.Reps != nil && *s.Reps > 36)
					unclassified = unclassified || s.BodyPart == nil || *s.BodyPart == ""
				}
			}
			for _, n := range days {
				sameDay = sameDay || n > 1
			}
			for _, n := range instants {
				sameInstant = sameInstant || n > 1
			}
		}
	}
	for name, ok := range map[string]bool{
		"00:30 JST workout": jstMidnightHalf, "same-day duplicate": sameDay,
		"same-timestamp tie": sameInstant, "NULL weight": nullWeight, "NULL reps": nullReps,
		"NULL sets": nullSets, "reps > 36": repsOver36, "unclassified body_part": unclassified,
		"another user's workout": otherUser,
	} {
		if !ok {
			t.Errorf("no golden case covers: %s", name)
		}
	}
}
