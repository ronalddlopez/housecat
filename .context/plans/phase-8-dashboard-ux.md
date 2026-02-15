# Phase 8 — Dashboard UX Overhaul

Upgrade the dashboard from a passive stats page to an active command center. Two changes:
1. Replace 5 shallow count cards with 4 QA-focused informational cards
2. Add an always-visible Create Test Suite form directly on the dashboard

---

## Change 1: Richer Stats Cards (4 QA-focused cards)

**Problem:** Current 5 cards (Total, Active, Passing, Failing, Pending) are just raw counts — they don't answer the questions a QA owner actually has when they open the dashboard.

**Solution:** 4 cards that answer real questions: "Is my site healthy?", "Do I need to act?", "Am I covered?", "Is the system alive?"

### New Card Layout

| # | Card | Headline | Sub-detail | Icon | Color Logic |
|---|------|----------|------------|------|-------------|
| 1 | **Site Health** | "All Passing" or "1 Failing" | "3 of 3 tests healthy" or "2 of 3 tests healthy" | `ShieldCheck` (green) / `ShieldAlert` (red) | Green when all pass, red when any fail, muted when no tests |
| 2 | **Needs Attention** | `0` or `2` | "No action needed" or "2 tests need review" | `AlertTriangle` | Amber when > 0, muted when 0 |
| 3 | **Coverage** | `3 Suites` | "2 active · 1 paused" | `FlaskConical` | Blue always |
| 4 | **Last Activity** | "2 min ago" | "Next run in ~13 min" | `Clock` | Neutral/muted |

### Card States

**Card 1 — Site Health:**
- Green: `passing === total_tests && total_tests > 0` → "All Passing" / "{total} of {total} tests healthy"
- Red: `failing > 0` → "{failing} Failing" / "{passing} of {total} tests healthy"
- Neutral: `total_tests === 0` → "No Tests" / "Create a test to get started"

**Card 2 — Needs Attention:**
- Count = `failing + pending` (failing tests + tests that have never run)
- `> 0`: amber, "{count}", "{count} tests need review"
- `=== 0`: muted, "0", "No action needed"

**Card 3 — Coverage:**
- Always: "{total_tests} Suites" / "{active} active · {paused} paused"

**Card 4 — Last Activity:**
- Has runs: relative time via `formatDistanceToNow(last_run_at_global)` / "Next run in ~{N} min"
- No runs: "No runs yet" / "Create a test to start"
- No active schedules: "No scheduled runs" as sub-detail

### Backend: `backend/api/results.py` → `get_dashboard()`

Add 2 new fields to the existing response (keep all existing fields for backward compat):

```python
{
    # ... existing fields unchanged ...
    "last_run_at_global": str | None,       # most recent last_run_at across ALL tests
    "next_run_approx_minutes": int | None,  # estimated minutes until next scheduled run
}
```

**`last_run_at_global`:** Already have `sorted_tests` sorted by `last_run_at` desc — just grab the first one's `last_run_at`.

**`next_run_approx_minutes` logic:** Match active test schedules against known cron intervals. No full cron parser needed — just a lookup dict:

```python
CRON_INTERVAL_MINUTES = {
    "*/5 * * * *": 5,
    "*/15 * * * *": 15,
    "*/30 * * * *": 30,
    "0 * * * *": 60,
    "0 */6 * * *": 360,
    "0 */12 * * *": 720,
    "0 9 * * *": 1440,
}
```

Find shortest interval among active tests. Calculate `next = interval - minutes_since_last_run`. Clamp to `>= 0`. Return `None` if no active tests.

### Frontend: `client/src/pages/dashboard.tsx`

**New imports needed:**
- `ShieldCheck`, `ShieldAlert`, `AlertTriangle` from `lucide-react`

**Replace** the 5-card `grid-cols-5` section with a 4-card `grid-cols-4` layout using the card designs above.

**Update `DashboardData` interface** to include:
```typescript
last_run_at_global: string | null;
next_run_approx_minutes: number | null;
```

---

## Change 2: Always-Visible Create Test Suite Form

**Problem:** To create a scheduled test suite, users must navigate to the Tests page and open a modal. The "Run Test" page only does one-off tests. The dashboard should let you create a monitored test without leaving.

**Solution:** An always-visible Create Test Suite card on the dashboard, below the stats cards and above Recent Test Runs.

### Dashboard Layout (top to bottom)

```
[Header: "Dashboard" + subtitle]
[4 Stats Cards Row]
[Create Test Suite Card]          ← NEW, always visible
[Recent Test Runs Section]
```

### Extract Shared Form Components

**Create new file: `client/src/components/test-form.tsx`**

Move these from `client/src/pages/tests.tsx` into the shared file:

```typescript
// Everything below gets extracted:
export const SCHEDULE_OPTIONS = [ ... ];   // lines 49-57
export function scheduleLabel(cron) { ... } // lines 59-62
export interface FormState { ... }          // lines 147-153
export const emptyForm: FormState = { ... } // lines 155-161
export function TestForm({ form, setForm, disabled }) { ... } // lines 505-583
```

**Required imports in the new file:**
- `Input` from `@/components/ui/input`
- `Textarea` from `@/components/ui/textarea`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`

### Update `client/src/pages/tests.tsx`

Replace local definitions with imports:

```typescript
import { TestForm, FormState, emptyForm, SCHEDULE_OPTIONS, scheduleLabel } from "@/components/test-form";
```

Remove the local `SCHEDULE_OPTIONS`, `scheduleLabel`, `FormState`, `emptyForm`, and `TestForm` definitions. Everything else stays the same.

### Update `client/src/pages/dashboard.tsx`

Add the create form section:

```typescript
import { TestForm, FormState, emptyForm } from "@/components/test-form";
```

**State:**
```typescript
const [form, setForm] = useState<FormState>(emptyForm);
```

**Mutation (same pattern as tests.tsx):**
```typescript
const createMutation = useMutation({
  mutationFn: (body: FormState) => apiRequest("POST", "/api/tests", body),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    setForm(emptyForm);
  },
});

const formValid = form.name.trim().length > 0
  && form.url.trim().length > 0
  && form.goal.trim().length > 0;
```

**Render (between stats cards and Recent Test Runs):**
```tsx
<Card>
  <CardContent className="p-5">
    <h3 className="text-sm font-semibold mb-4">Create Test Suite</h3>
    <TestForm form={form} setForm={setForm} disabled={createMutation.isPending} />
    <div className="flex items-center justify-end gap-2 mt-4">
      <Button
        onClick={() => createMutation.mutate(form)}
        disabled={!formValid || createMutation.isPending}
        data-testid="button-dashboard-create"
      >
        {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Create Test
      </Button>
    </div>
    {createMutation.isError && (
      <p className="text-sm text-red-600 dark:text-red-400 mt-2">
        {createMutation.error.message}
      </p>
    )}
  </CardContent>
</Card>
```

---

## Summary of File Changes

| File | Change |
|------|--------|
| `backend/api/results.py` | Add `last_run_at_global` and `next_run_approx_minutes` to `get_dashboard()` response |
| `client/src/components/test-form.tsx` | **NEW** — Extract `TestForm`, `FormState`, `emptyForm`, `SCHEDULE_OPTIONS`, `scheduleLabel` from tests.tsx |
| `client/src/pages/tests.tsx` | Import shared components from `test-form.tsx`, remove local definitions |
| `client/src/pages/dashboard.tsx` | Replace 5 count cards with 4 QA-focused cards, add always-visible create form |

---

## Testing

1. **Stats cards:** Load dashboard → 4 cards show correct health/attention/coverage/activity data
2. **Card states:** With 0 tests: neutral messaging. With failing test: Site Health turns red, Needs Attention shows count
3. **Create form:** Fill in Name + URL + Goal on dashboard → click "Create Test" → test appears in Tests page, stats update automatically
4. **Tests page regression:** Create/edit/delete dialogs still work after extracting TestForm
5. **Last Activity:** Shows relative time since most recent run, approximate next run time
