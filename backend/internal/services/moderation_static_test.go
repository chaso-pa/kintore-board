package services

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// This file is the load-bearing guarantee of the moderation work, and it is a static
// check rather than a runtime one for a single reason: every runtime mechanism —
// per-path tests, a sqlmock query matcher, a GORM callback — only ever sees code that
// actually executed. A path nobody wrote a test for is invisible to all of them.
//
// That is not hypothetical. The first draft of this feature enumerated the query paths by
// hand and missed ListGymFavorites, which had no test at all; a favourite could be
// registered against a pending gym and read straight back out, walking around the 404 on
// GetGym. Only a check that reads source instead of running it would have caught that,
// so the regression is pinned below.
//
// The rule enforced here is not "did you call the filter" but "can you even hold an
// unfiltered handle". Callers obtain a query from (*GymService).scoped, which returns a
// handle with the predicate already attached; a function that reaches for s.db instead is
// a finding. The weaker "did you call it" form was tried and passed code that called the
// helper and threw the result away.

var moderatedTypes = map[string]bool{
	"Gym": true, "Machine": true, "GymPhoto": true, "MachinePhoto": true,
	// moderatedTable is the abstraction the visibility helpers pass around. Without it
	// here, a function that takes the table as a value names no moderated type and
	// contains no table literal, so it disappears from the check entirely — the
	// abstraction introduced for one goal would have quietly undercut the other.
	"moderatedTable": true,
	// The table values themselves. s.db.Table(tblGyms.name) names no model type and holds
	// no table literal, so before these were listed it was invisible — and the shape is
	// not hypothetical: setModerationStatus and ModerationCounts are both written that way.
	"tblGyms": true, "tblMachines": true, "tblGymPhotos": true, "tblMachinePhotos": true,
}

// guardedExemptions are the waivers that claim a check happens elsewhere in the function
// rather than claiming the function needs no check.
//
// The distinction matters because the static check reads the presence of an annotation,
// never its text. A waiver saying "the target is verified by requireVisibleGym" stays
// valid-looking after someone deletes that call, and the suite stays green: deleting the
// guard from AddGymFavorite — reinstating the exact bypass this whole feature exists to
// close — was measured to break nothing.
//
// This does not verify that the guard is correct, only that one is still there. It is a
// weaker promise than the read side gets from scoped(), and it is the best available
// without giving verified ids their own type.
var guardedExemptions = map[string]bool{
	"CreateMachine":        true,
	"SaveGymPhoto":         true,
	"SaveMachinePhoto":     true,
	"AddGymFavorite":       true,
	"CreateGymEditRequest": true,
	"LinkMachine":          true,
	"UnlinkMachine":        true,
	"requireVisibleTarget": true,
	"CreateThread":         true,
}

// Word boundaries matter here: gym_machines contains "machines" as a substring, and a
// naive match would flag every join against the link table.
var moderatedTableRe = regexp.MustCompile(`(^|[^0-9a-z_])(gyms|machines|gym_photos|machine_photos)($|[^0-9a-z_])`)

// goldenExemptions lists every function allowed to carry //moderation:exempt.
//
// An exemption is one line in a doc comment, which is easy to add and easy to miss in a
// large diff. Requiring the name here as well means adding one shows up as a change to
// this test file, where a reviewer is looking for exactly this kind of thing.
var goldenExemptions = map[string]string{
	// The query-handle factories. These are the only functions that may name a raw handle.
	"scopedOn": "フィルタ済みハンドルの供給元そのもの",
	"scoped":   "scopedOn への薄い委譲",

	// Reads that touch a moderated table but are already constrained in their own SQL.
	"attachGymThumbnails":     "サブクエリで status='active' を直接指定済み",
	"attachMachineThumbnails": "サブクエリで status='active' を直接指定済み",

	// Reads of neighbouring tables that merely carry a foreign key, and disclose nothing
	// about the moderated row itself.
	"gymThreadRating":           "threads と posts だけを読む",
	"machineThreadStats":        "threads と posts だけを読む",
	"attachMachineThreadCounts": "threads だけを読む",
	"isGymFavorited":            "gym_favorites だけを読む",
	"RemoveGymFavorite":         "自分の favorite 行を削除するだけ",
	"ListThreads":               "開示されるのは gym_id と投稿者自身が書いた文字列のみ",

	// Creates. They read nothing, or their target was already checked by a require* helper.
	"CreateGym":            "新規作成のみ。既存行を読まない",
	"CreateMachineGlobal":  "新規作成のみ。既存行を読まない",
	"CreateMachine":        "対象ジムの可視性は requireVisibleGym で検証済み",
	"SaveGymPhoto":         "対象と image_url を検証済み",
	"SaveMachinePhoto":     "対象と image_url を検証済み",
	"AddGymFavorite":       "対象ジムの可視性を検証済み",
	"CreateGymEditRequest": "対象ジムの可視性を検証済み",
	"LinkMachine":          "ジムとマシンの可視性・承認状態を検証済み",
	"UnlinkMachine":        "認可を requireGymOwner で検証済み",
	"CreateThread":         "対象の可視性を検証済み。書き込むのは threads と posts のみ",
	"requireVisibleTarget": "可視性は scopedOn で判定し、書き込むのは threads のみ",

	// Admin-only moderation. These deliberately span every status, so the visibility
	// filter would defeat their purpose.
	"setModerationStatus": "admin 専用。遷移元 pending への限定は WHERE 句で行う",
	"ModerationCounts":    "admin 専用。pending 件数の集計そのものが目的",
}

type moderationFinding struct {
	fn         string
	line       int
	signals    []string
	usesDB     bool // reaches for s.db / db / tx directly
	exempt     string
	hasScop    bool // obtains a handle from scoped()
	callsGuard bool // calls a require* helper, or scopedOn directly
}

func (f moderationFinding) violates() bool { return f.usesDB && f.exempt == "" }

// analyzeModeration reports every function that touches a moderated table, and whether it
// reached for a raw handle while doing so.
func analyzeModeration(fset *token.FileSet, files []*ast.File) []moderationFinding {
	var out []moderationFinding

	for _, f := range files {
		for _, decl := range f.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil {
				continue
			}

			signals := map[string]bool{}

			// R2 — a write path often names no moderated type at all; it just carries a
			// foreign key (AddGymFavorite(userID, gymID string)). Those are precisely the
			// paths that create an "unreadable but writable" asymmetry, so the parameter
			// name stands in for the type.
			if fn.Type.Params != nil {
				for _, p := range fn.Type.Params.List {
					for _, nm := range p.Names {
						switch strings.ToLower(nm.Name) {
						case "gymid", "machineid":
							signals["param:"+nm.Name] = true
						}
					}
				}
			}
			// R1b — the type may appear only in the signature, as in CreateGym(g *Gym).
			for _, fl := range []*ast.FieldList{fn.Type.Params, fn.Type.Results} {
				if fl == nil {
					continue
				}
				for _, p := range fl.List {
					ast.Inspect(p.Type, func(n ast.Node) bool {
						if id, ok := n.(*ast.Ident); ok && moderatedTypes[id.Name] {
							signals["sig:"+id.Name] = true
						}
						return true
					})
				}
			}

			var usesDB, hasScoped, callsGuard bool
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				switch x := n.(type) {
				case *ast.SelectorExpr:
					if x.Sel.Name == "db" {
						usesDB = true
					}
					if x.Sel.Name == "scoped" {
						hasScoped = true
					}

				case *ast.Ident:
					// R1a — a moderated model named in the body.
					if moderatedTypes[x.Name] {
						signals["type:"+x.Name] = true
					}

				case *ast.BasicLit:
					// R1c — a moderated table named in raw SQL.
					if x.Kind == token.STRING {
						for _, m := range moderatedTableRe.FindAllStringSubmatch(x.Value, -1) {
							signals["sql:"+m[2]] = true
						}
					}

				case *ast.CallExpr:
					// Only the callee counts. Matching any identifier beginning with
					// "require" meant a local variable named `required` satisfied the
					// guard rule with no call in the function at all — weaker than the
					// rule's own description of itself.
					if isGuardCall(x) {
						callsGuard = true
					}
				}
				return true
			})

			if len(signals) == 0 {
				continue
			}

			// The exemption must come from this function's own doc comment. Scanning a
			// range of preceding lines looks equivalent and is not: it silently inherits
			// the previous function's exemption, spreading a waiver to code nobody
			// waived. That bug was written, and case (4) below is why it stayed dead.
			exempt := ""
			if fn.Doc != nil {
				for _, c := range fn.Doc.List {
					if idx := strings.Index(c.Text, "moderation:exempt"); idx >= 0 {
						reason := strings.TrimSpace(strings.TrimPrefix(
							strings.TrimSpace(c.Text[idx+len("moderation:exempt"):]), ":"))
						// An empty reason defeats the point of demanding one, so it does
						// not count as an exemption at all.
						if reason != "" {
							exempt = reason
						}
					}
				}
			}

			var sig []string
			for k := range signals {
				sig = append(sig, k)
			}
			sort.Strings(sig)

			out = append(out, moderationFinding{
				fn:         fn.Name.Name,
				line:       fset.Position(fn.Pos()).Line,
				signals:    sig,
				usesDB:     usesDB,
				exempt:     exempt,
				hasScop:    hasScoped,
				callsGuard: callsGuard,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].line < out[j].line })
	return out
}

func parseServicesPackage(t *testing.T) (*token.FileSet, []*ast.File) {
	t.Helper()
	fset := token.NewFileSet()
	paths, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	var files []*ast.File
	for _, p := range paths {
		if strings.HasSuffix(p, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(fset, p, nil, parser.ParseComments)
		if err != nil {
			t.Fatalf("parse %s: %v", p, err)
		}
		files = append(files, f)
	}
	if len(files) == 0 {
		t.Fatal("no source files found; the check would trivially pass")
	}
	return fset, files
}

// The check itself: nothing in the package may reach for a raw handle while a moderated
// table is in play, unless it says in writing why.
func TestModerationStaticNoUnfilteredQueries(t *testing.T) {
	fset, files := parseServicesPackage(t)
	findings := analyzeModeration(fset, files)

	var violations []moderationFinding
	for _, f := range findings {
		if f.violates() {
			violations = append(violations, f)
		}
	}

	if len(violations) > 0 {
		var b strings.Builder
		fmt.Fprintf(&b, "%d function(s) query a moderated table through a raw handle.\n", len(violations))
		b.WriteString("Obtain the query from s.scoped(viewer, tbl, requested) instead, or add\n")
		b.WriteString("//moderation:exempt: <reason> to the function's own doc comment and list it\n")
		b.WriteString("in goldenExemptions.\n\n")
		for _, v := range violations {
			note := ""
			if v.hasScop {
				note = "  <- calls scoped() but still reaches for s.db"
			}
			fmt.Fprintf(&b, "  %-28s line %-5d  %s%s\n",
				v.fn, v.line, strings.Join(v.signals, ","), note)
		}
		t.Error(b.String())
	}
}

// Every exemption must also be listed here, so adding one is a visible diff in a test
// file rather than a line buried in a doc comment.
func TestModerationExemptionsMatchGoldenList(t *testing.T) {
	fset, files := parseServicesPackage(t)

	granted := map[string]bool{}
	for _, f := range analyzeModeration(fset, files) {
		if f.exempt == "" {
			continue
		}
		granted[f.fn] = true
		if _, ok := goldenExemptions[f.fn]; !ok {
			t.Errorf("%s (line %d) is exempt but is not in goldenExemptions: %q",
				f.fn, f.line, f.exempt)
		}
	}
	for name := range goldenExemptions {
		if !granted[name] {
			t.Logf("note: goldenExemptions lists %q but it currently carries no exemption "+
				"(fine while that code is still being written)", name)
		}
	}
}

// ListGymFavorites is the path the hand-written enumeration missed, and AddGymFavorite is
// the write side that made it exploitable. Neither has a test of its own, which is the
// whole point: if a future change narrows the detection rules, these stop being detected
// and this test says so.
func TestModerationStaticPinsThePathsHandEnumerationMissed(t *testing.T) {
	fset, files := parseServicesPackage(t)
	byName := map[string]moderationFinding{}
	for _, f := range analyzeModeration(fset, files) {
		byName[f.fn] = f
	}

	cases := []struct {
		fn         string
		wantSignal string
	}{
		{"ListGymFavorites", "sql:gyms"},  // R1: reads gyms through a join
		{"AddGymFavorite", "param:gymID"}, // R2: carries only the foreign key
	}
	for _, tc := range cases {
		f, ok := byName[tc.fn]
		if !ok {
			t.Errorf("%s is not detected as a moderation candidate at all", tc.fn)
			continue
		}
		found := false
		for _, s := range f.signals {
			if s == tc.wantSignal {
				found = true
			}
		}
		if !found {
			t.Errorf("%s signals = %v, want one of them to be %q", tc.fn, f.signals, tc.wantSignal)
		}
	}
}

// gym_machines is a link table, not a moderated one. Flagging it would train people to
// exempt things reflexively, which is how a check stops meaning anything.
func TestModerationTableRegexRespectsWordBoundaries(t *testing.T) {
	shouldMatch := []string{
		"SELECT * FROM gyms WHERE id = ?",
		"INNER JOIN machines ON machines.id = gm.machine_id",
		"FROM gym_photos t1",
		"FROM machine_photos WHERE status = 'active'",
		"`gyms`.`id`",
	}
	shouldNotMatch := []string{
		"SELECT gym_id, COUNT(*) FROM gym_machines GROUP BY gym_id",
		"INNER JOIN gym_machines gm ON gm.machine_id = x",
		"FROM gym_favorites gf",
		"FROM gym_edit_requests",
	}
	for _, s := range shouldMatch {
		if !moderatedTableRe.MatchString(s) {
			t.Errorf("should match but did not: %q", s)
		}
	}
	for _, s := range shouldNotMatch {
		if moderatedTableRe.MatchString(s) {
			t.Errorf("should NOT match but did: %q", s)
		}
	}
}

// queryVerbs are the GORM finishers and builders worth noticing. Several of these names
// are shared with unrelated APIs — huma.Delete registers a route — so the receiver is
// what decides, not the method name.
var queryVerbs = map[string]bool{
	"Where": true, "Find": true, "First": true, "Raw": true, "Create": true,
	"Delete": true, "Updates": true, "Scan": true, "Table": true, "Model": true,
	"Joins": true, "Save": true, "Exec": true,
}

// rootIdent walks a selector chain back to the identifier it starts from, so that
// s.db.Where(...) reports "db" and huma.Delete(...) reports "huma".
func rootIdent(e ast.Expr) string {
	for {
		switch x := e.(type) {
		case *ast.SelectorExpr:
			// s.db.Where -> the receiver of Where is s.db, whose Sel is "db".
			if id, ok := x.X.(*ast.Ident); ok {
				if x.Sel.Name == "db" || x.Sel.Name == "tx" {
					return x.Sel.Name
				}
				return id.Name
			}
			e = x.X
		case *ast.CallExpr:
			e = x.Fun
		case *ast.Ident:
			return x.Name
		default:
			return ""
		}
	}
}

// queryExceptions are the query sites outside internal/services that are known and
// accepted. Right now there is exactly one: the auth middleware reads users.status and
// users.role on every request, which is how the role reaches a handler at all.
//
// users is not a moderated table, so the static check has no opinion about it. It is
// listed rather than skipped because the walk below previously omitted internal/middlewares
// altogether — which made the test pass by excluding its only counter-example, and left
// the premise it claims to pin quietly false.
var queryExceptions = map[string]bool{
	"../middlewares/auth.go": true,
}

// The check only reads internal/services, which is sound only while that is the only
// place queries are issued. This pins that premise instead of assuming it.
func TestQueriesStayInsideTheServicesPackage(t *testing.T) {
	for _, dir := range []string{"../handlers", "../models", "../routes", "../middlewares", "../db", "../../cmd"} {
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") ||
				strings.HasSuffix(path, "_test.go") {
				return nil
			}
			fset := token.NewFileSet()
			f, perr := parser.ParseFile(fset, path, nil, 0)
			if perr != nil {
				return perr
			}
			ast.Inspect(f, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || !queryVerbs[sel.Sel.Name] {
					return true
				}
				switch rootIdent(sel.X) {
				case "db", "tx":
					if queryExceptions[path] {
						return true
					}
					t.Errorf("%s:%d issues a query outside internal/services, so the static "+
						"check cannot see it: %s(...). If this is intended, add the file to "+
						"queryExceptions with a note about what it reads.",
						path, fset.Position(call.Pos()).Line, sel.Sel.Name)
				}
				return true
			})
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v", dir, err)
		}
	}
}

// --- meta tests: the check must actually distinguish these six shapes ---

func analyzeSnippet(t *testing.T, src string) map[string]moderationFinding {
	t.Helper()
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "meta.go", src, parser.ParseComments)
	if err != nil {
		t.Fatalf("parse snippet: %v", err)
	}
	byName := map[string]moderationFinding{}
	for _, fi := range analyzeModeration(fset, []*ast.File{f}) {
		byName[fi.fn] = fi
	}
	return byName
}

func TestModerationStaticMetaCases(t *testing.T) {
	const src = `package meta

type Gym struct{ ID string }

// 1. obtains the handle from scoped: never touches s.db, so it is not even a candidate.
func (s *S) ViaScoped(v Viewer) ([]Gym, error) {
	var rows []Gym
	q, err := s.scoped(v, tblGyms, "")
	if err != nil { return nil, err }
	return rows, q.Find(&rows).Error
}

// 2. raw handle, no waiver.
func (s *S) RawHandle() ([]Gym, error) {
	var rows []Gym
	return rows, s.db.Find(&rows).Error
}

//moderation:exempt: 集計は status='active' を直接指定している
// 3. waiver on its own doc comment.
func (s *S) ProperlyExempt() {
	s.db.Raw(` + "`SELECT gym_id FROM gym_photos WHERE status = 'active'`" + `)
}

// 4. no waiver of its own — it must not inherit the one above.
func (s *S) NeighbourOfExempt(gymID string) error {
	return s.db.Table("gyms").Error
}

// 5. calls scoped but throws the result away, then queries raw anyway.
func (s *S) ScopedThenDiscarded(gymID string) error {
	_, _ = s.scoped(Viewer{}, tblGyms, "")
	return s.db.Table("gyms").Where("id = ?", gymID).Error
}

// 6. two queries, only the first one scoped.
func (s *S) TwoQueriesOneScoped(gymID string) error {
	q, _ := s.scoped(Viewer{}, tblGyms, "")
	q.Find(nil)
	s.db.Raw(` + "`SELECT * FROM machines WHERE gym_id = ?`" + `, gymID).Scan(nil)
	return nil
}

//moderation:exempt:
// 7. waiver with no reason: not a waiver.
func (s *S) EmptyReason(gymID string) error {
	return s.db.Table("gyms").Error
}
`
	got := analyzeSnippet(t, src)

	cases := []struct {
		fn            string
		wantCandidate bool
		wantViolation bool
		why           string
	}{
		// Still a candidate — it names a moderated type — but not a violation, because it
		// never reaches for a raw handle. That distinction is the whole design.
		{"ViaScoped", true, false, "s.scoped 経由なら s.db に触れないので違反にならない"},
		{"RawHandle", true, true, "生ハンドルで moderated テーブルを読んでいる"},
		{"ProperlyExempt", true, false, "自身の doc に理由つきの除外がある"},
		{"NeighbourOfExempt", true, true, "直前の関数の除外を継承してはいけない"},
		{"ScopedThenDiscarded", true, true, "scoped を呼んでも戻り値を捨てれば無意味"},
		{"TwoQueriesOneScoped", true, true, "1本目を守っても2本目が無防備"},
		{"EmptyReason", true, true, "理由が空の除外は除外として扱わない"},
	}

	for _, tc := range cases {
		t.Run(tc.fn, func(t *testing.T) {
			f, ok := got[tc.fn]
			if ok != tc.wantCandidate {
				t.Fatalf("detected as candidate = %v, want %v (%s)", ok, tc.wantCandidate, tc.why)
			}
			if !ok {
				return
			}
			if f.violates() != tc.wantViolation {
				t.Errorf("violation = %v, want %v (%s); signals=%v usesDB=%v exempt=%q",
					f.violates(), tc.wantViolation, tc.why, f.signals, f.usesDB, f.exempt)
			}
		})
	}
}

// The parameter-name rule is deliberately narrow, and its blind spots are worth knowing
// rather than discovering. A function that names its key "id" or "targetID", or that
// takes the table as a value, is invisible to this check.
func TestModerationStaticRecallLimitsAreKnown(t *testing.T) {
	const gymsTableConst = "gyms"
	const src = `package meta

func (s *S) LowerCaseD(gymId string) error   { return s.db.Table("gyms").Error }
func (s *S) PlainID(id string) error         { return s.db.Table("some_view").Error }
func (s *S) TargetID(targetID string) error  { return s.db.Table("some_view").Error }
func (s *S) PluralIDs(gymIDs []string) error { return s.db.Table("some_view").Error }

// The table named through a constant rather than a literal.
func (s *S) ViaConst() error { return s.db.Table(gymsTableConst).Error }

// The name assembled at runtime.
func (s *S) ViaConcat() error { return s.db.Raw("SELECT * FROM " + "gy" + "ms").Error }

// A handle held under a name other than db.
func (s *S) ViaOtherFieldName() error { return s.conn.Table("gyms").Error }
`
	got := analyzeSnippet(t, src)

	if _, ok := got["LowerCaseD"]; !ok {
		t.Error("gymId (lower-case d) must still be detected; the rule lower-cases names")
	}
	for _, blind := range []string{"PlainID", "TargetID", "PluralIDs", "ViaConst", "ViaConcat"} {
		if _, ok := got[blind]; ok {
			t.Logf("%s is now detected — the recall limit documented in the plan has improved", blind)
		}
	}
	// ViaOtherFieldName is seen as a candidate (it holds a table literal) but not as a
	// violation, because usesDB keys off a field literally named db. Renaming the handle
	// would slip past; nothing in the codebase does, and the convention is one line to
	// check in review.
	if f, ok := got["ViaOtherFieldName"]; ok && f.violates() {
		t.Log("a handle under another field name is now caught — recall has improved")
	}
}

// A waiver that claims a guard elsewhere in the function must still have one.
//
// This closes the gap measured while reviewing this work: deleting requireVisibleGym from
// AddGymFavorite left the whole suite green, even though it reinstates the bypass — a
// pending gym bookmarked and then read back out of the favourites listing — that the
// static check's own header comment describes as the reason this file exists.
//
// It is a narrower promise than the read path gets. scoped() makes the wrong thing
// unreachable; this only notices that the right thing was removed outright. Calling a
// guard and ignoring its error would still pass, which is the same weakness the earlier
// "did you call visibilityFilter" design had.
func TestGuardedExemptionsStillCallAGuard(t *testing.T) {
	fset, files := parseServicesPackage(t)

	seen := map[string]bool{}
	for _, f := range analyzeModeration(fset, files) {
		if !guardedExemptions[f.fn] {
			continue
		}
		seen[f.fn] = true
		if f.exempt == "" {
			t.Errorf("%s (line %d) is listed as a guarded exemption but carries no exemption",
				f.fn, f.line)
			continue
		}
		if !f.callsGuard {
			t.Errorf("%s (line %d) is exempt because %q, but its body calls no require* "+
				"helper. Either the guard was removed, or the reason is no longer true.",
				f.fn, f.line, f.exempt)
		}
	}
	for name := range guardedExemptions {
		if !seen[name] {
			t.Errorf("guardedExemptions lists %q but no such function was found; "+
				"rename or remove the entry so the list keeps meaning something", name)
		}
	}
}

// The guard rule has to distinguish a function that lost its check from one that never
// claimed to have one, and it must not be satisfiable by an unrelated call.
func TestGuardedExemptionMetaCases(t *testing.T) {
	const src = `package meta

type Gym struct{ ID string }

//moderation:exempt: 対象ジムの可視性は requireVisibleGym で検証済み
func (s *S) WithGuard(gymID string) error {
	if err := s.requireVisibleGym(Viewer{}, gymID); err != nil { return err }
	return s.db.Create(nil).Error
}

//moderation:exempt: 対象ジムの可視性は requireVisibleGym で検証済み
func (s *S) GuardDeleted(gymID string) error {
	return s.db.Create(nil).Error
}

//moderation:exempt: threads だけを読む
func (s *S) UnguardedByDesign(gymID string) error {
	return s.db.Table("threads").Error
}
`
	got := analyzeSnippet(t, src)

	if !got["WithGuard"].callsGuard {
		t.Error("WithGuard calls requireVisibleGym but was not seen to call a guard")
	}
	if got["GuardDeleted"].callsGuard {
		t.Error("GuardDeleted calls no guard, yet one was detected")
	}
	// The rule only applies to names on the list; a waiver that never claimed a guard is
	// unaffected, which is what keeps the list from becoming a blanket requirement.
	if got["UnguardedByDesign"].callsGuard {
		t.Error("UnguardedByDesign calls no guard, yet one was detected")
	}
}

// isGuardCall reports whether a call is one of the visibility or authorisation helpers.
//
// It looks at the function being called, not at identifiers in general. Both forms exist:
// a method on the service (s.requireVisibleGym) and the free function that services
// without their own scoped method use (scopedOn).
func isGuardCall(call *ast.CallExpr) bool {
	switch fn := call.Fun.(type) {
	case *ast.SelectorExpr:
		return strings.HasPrefix(fn.Sel.Name, "require")
	case *ast.Ident:
		return fn.Name == "scopedOn" || strings.HasPrefix(fn.Name, "require")
	}
	return false
}

// The guard rule must be satisfied by a call and nothing else. A name that merely looks
// like one is the easiest way to defeat it by accident: `required := ...` reads as
// unrelated bookkeeping, not as a way around a security check.
func TestGuardDetectionRequiresAnActualCall(t *testing.T) {
	const src = `package meta

func (s *S) LocalVariableNamedLikeAGuard(gymID string) error {
	required := true
	_ = required
	return s.db.Create(nil).Error
}

func (s *S) StructFieldNamedLikeAGuard(gymID string) error {
	cfg := struct{ required bool }{required: true}
	_ = cfg
	return s.db.Create(nil).Error
}

func (s *S) ActuallyCallsAGuard(gymID string) error {
	if err := s.requireVisibleGym(Viewer{}, gymID); err != nil { return err }
	return s.db.Create(nil).Error
}
`
	got := analyzeSnippet(t, src)

	for _, name := range []string{"LocalVariableNamedLikeAGuard", "StructFieldNamedLikeAGuard"} {
		if got[name].callsGuard {
			t.Errorf("%s calls no guard, but a similarly-named identifier satisfied the rule", name)
		}
	}
	if !got["ActuallyCallsAGuard"].callsGuard {
		t.Error("ActuallyCallsAGuard calls requireVisibleGym but was not credited with a guard")
	}
}

// The golden list catches an exemption being added. This catches the mirror image: a
// waiver that claims a guard quietly dropping off the list that enforces the claim.
func TestExemptionsClaimingAGuardAreListedAsGuarded(t *testing.T) {
	claimsAGuard := []string{"require", "scopedOn", "検証済み", "確認済み"}

	// The two factories are what a guard is made of, not code that relies on one. Their
	// reasons name scopedOn because that is what they are, so the marker search would
	// otherwise read them as claiming a check they should be listed for.
	factories := map[string]bool{"scoped": true, "scopedOn": true}

	for name, reason := range goldenExemptions {
		if factories[name] {
			continue
		}
		claimed := false
		for _, marker := range claimsAGuard {
			if strings.Contains(reason, marker) {
				claimed = true
			}
		}
		if claimed && !guardedExemptions[name] {
			t.Errorf("%s is exempt because %q — a reason that asserts a check elsewhere — "+
				"but it is not in guardedExemptions, so nothing verifies the check is still there",
				name, reason)
		}
		if !claimed && guardedExemptions[name] {
			t.Errorf("%s is in guardedExemptions but its reason %q does not claim a check; "+
				"either the reason or the listing is wrong", name, reason)
		}
	}
}
