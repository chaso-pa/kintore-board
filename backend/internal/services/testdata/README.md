# testdata

Fixtures shared by the Go server and the Expo app. Changing a file here changes what
both sides are tested against.

| File | Pins | Read by |
|---|---|---|
| `e1rm_cases.json` | `EstimateOneRM` / `estimateOneRM` | `e1rm_test.go`, `expo/src/utils/rm.test.ts` |
| `workout_dates_cases.json` | `GetWorkoutDates` → `GET /workouts/dates` | `workout_golden_test.go`, TS port of the record aggregates |
| `workout_stats_cases.json` | `GetWorkoutStats` → `GET /workouts/stats` | same |
| `last_sets_cases.json` | `GetLastExerciseSets` → `GET /workouts/last-exercise-sets` | same |
| `max_e1rm_cases.json` | `GetExerciseMaxE1RM` → `GET /workouts/exercise-max-e1rm` | same |
| `exercise_history_cases.json` | `GetExerciseHistory` → `GET /workouts/exercise-history` | same |
| `exercise_list_cases.json` | `ListExercises` → `GET /workouts/exercises` | same |
| `unclassified_cases.json` | `UnclassifiedExerciseNames` → `GET /workouts/unclassified-exercises` | same |

## Aggregate case files (`*_cases.json` except `e1rm_cases.json`)

```jsonc
{
  "description": "string — the rule this file pins, in one paragraph",
  "cases": [
    {
      "name": "string, unique in the file",
      "note": "string, optional — why the case exists",
      "user_id": "string — the caller; only workouts with this user_id are theirs",
      "query": {
        // Only the fields the endpoint takes; absent means the zero value.
        "year": 2026, "month": 8,               // workout_dates
        "exercise_name": "ベンチプレス",         // last_sets, max_e1rm, exercise_history
        "body_part": "胸",                       // optional; "" / absent = every part
        "unclassified": true,                    // optional; only body_part NULL or ""
        "before_workout_id": "w05"               // max_e1rm
      },
      "workouts": [
        {
          "id": "string",
          "user_id": "string — may be another user's, to check scoping",
          "trained_on": "RFC 3339 instant, e.g. 2026-08-14T15:30:00Z",
          "memo": "string | null",
          "sets": [
            {
              "id": "string",
              "exercise_name": "string",
              "weight": "number | null",
              "reps": "integer | null",
              "sets": "integer | null",
              "memo": "string | null",
              "spotted": "boolean",
              "body_part": "string | null — null and \"\" both mean unclassified",
              "sort_order": "integer"
            }
          ]
        }
      ],
      // The response body exactly as the endpoint returns it (same JSON field names and
      // shapes as the models in internal/models/workout.go). null means the endpoint
      // answers 404 (last_sets only).
      "expected": {}
    }
  ]
}
```

A workout row has the same shape as an item of `GET /workouts/export` (minus
`created_at`), so the device can load a case into its SQLite copy the same way it imports.

### Rules the expected values encode

- **Date key = UTC.** A workout's day is `trained_on` formatted as `YYYY-MM-DD` in UTC.
  The server formats in its process time zone; the production container sets no `TZ`
  (see `backend/Dockerfile`), so that is UTC, and these files assume it. A workout at
  00:30 JST is the previous day here — the cases include that on purpose.
- **NULL.** Where the server scans into non-pointer Go fields (history, last sets, list),
  NULL weight / reps / sets / memo read as `0` / `0` / `0` / `""`. Where SQL does the work
  it follows SQL: `SUM` skips a NULL product (stats), and `weight > 0 AND reps > 0` is not
  true for NULL (max e1RM). `COALESCE(body_part, '')` groups NULL with `""` (list).
- **Ties.** "Latest workout" is `trained_on DESC, id DESC` everywhere. History sets are
  ordered by `trained_on, workout_id, sort_order, set id`. Sets of one workout by
  `sort_order, set id`. The exercise list by latest `trained_on` DESC, then
  `exercise_name`, then `body_part` (byte / code-point order).
- **Order-free output.** `unclassified` has no `ORDER BY` on the server; `expected` is
  sorted and must be compared as a set.
- **Floats** are the exact float64 the server produces; compare with `===`, not a tolerance.
- Exercise names are compared exactly. (MySQL's `utf8mb4_unicode_ci` would also match by
  case/width-insensitive collation; the cases avoid names where that would differ.)

### Regenerating

```sh
cd backend
go test ./internal/services/ -run TestGolden -update-golden   # rewrites "expected"
go test -tags integration ./internal/services/ -run TestGoldenAgainstMySQL  # checks them against real SQL
```

The integration run needs `KINTORE_TEST_MYSQL_DSN` — see `workout_golden_integration_test.go`.
