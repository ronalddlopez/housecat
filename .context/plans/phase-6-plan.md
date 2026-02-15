# Phase 6: Live Execution View — Implementation Plan

**Goal:** Watch the AI agents work in real-time. Click "Run Now" → see Planner create steps → Browser execute in a live browser preview → Evaluator deliver verdict. The demo closer.

**Time estimate:** ~40 minutes for Replit agent

---

## What Exists Today

### Backend (complete — no changes needed for core functionality)
- `GET /api/tests/{id}/live` SSE endpoint streams events from Redis Stream
- Supports event replay, 1s polling, 15s keepalive, 5min timeout, `Last-Event-ID` resume
- Pipeline logs these event types during execution:

| Event Type | Fields | When |
|-----------|--------|------|
| `plan_start` | message | Before Planner runs |
| `plan_complete` | message | After Planner returns plan |
| `browser_start` | message | Before TinyFish call |
| `step_complete` | message, step_number, passed | After each step result extracted |
| `browser_complete` | message | After all steps done |
| `eval_start` | message | Before Evaluator runs |
| `eval_complete` | message, passed | After Evaluator returns verdict |
| `error` | message | On pipeline exception |

### Frontend (current state)
- Test detail page has Run Now button → triggers `POST /api/tests/{id}/run`
- After run completes, queries refresh and results appear in history table
- **No live streaming** — user sees a spinner until the entire pipeline finishes (~15-60s)

### Missing piece
- `streaming_url` from TinyFish is captured in `BrowserResult` but **not logged to the event stream**. Need to add it so the live view can show the browser preview.

---

## What Phase 6 Delivers

1. **Live execution panel** on the test detail page — appears when a run is in progress
2. **Phase indicator** — visual progress: Planning → Browsing → Evaluating → Complete
3. **Step tracker** — planned steps appear, then tick off pass/fail as they complete
4. **Browser preview** — embedded iframe showing TinyFish's live browser stream
5. **Event log** — scrolling log of agent activity with timestamps
6. **Auto-transition** — panel appears on Run Now, auto-hides when execution completes

---

## Design

### Layout (within test detail page)

When a run is triggered, the live panel appears between the metric cards and the tabs:

```
┌──────────────────────────────────────────────────┐
│ ← Back to Tests                                   │
│ Login Flow  [Active] [Passed]                     │
│ [Run Now ⏳ Running...] [Pause]                   │
├──────────┬───────────────┬───────────────────────┤
│  Uptime  │  Last Result  │   Avg Response Time   │
├──────────┴───────────────┴───────────────────────┤
│                                                    │
│  ┌─ Live Execution ─────────────────────────────┐ │
│  │                                               │ │
│  │  Phase: [■ Plan] [■ Browse] [□ Evaluate]     │ │
│  │                                               │ │
│  │  ┌─ Browser Preview ──────┐  ┌─ Steps ─────┐ │ │
│  │  │                        │  │ ✓ Step 1     │ │ │
│  │  │   (TinyFish iframe)    │  │ ✓ Step 2     │ │ │
│  │  │                        │  │ ⏳ Step 3    │ │ │
│  │  │                        │  │ ○ Step 4     │ │ │
│  │  └────────────────────────┘  └──────────────┘ │ │
│  │                                               │ │
│  │  Event Log:                                   │ │
│  │  10:00:01  Planning test for myapp.com...     │ │
│  │  10:00:03  Plan created: 4 steps              │ │
│  │  10:00:03  Executing test with TinyFish       │ │
│  │  10:00:15  Step 1: passed — Page loaded       │ │
│  │  10:00:22  Step 2: passed — Form found        │ │
│  │                                               │ │
│  └───────────────────────────────────────────────┘ │
│                                                    │
│  [History 5]  [Incidents]                         │
│  ... (existing tabs) ...                          │
└──────────────────────────────────────────────────┘
```

### When no run is active
The live panel is hidden. Only the existing metric cards + tabs show.

### When Run Now is clicked
1. Run Now button changes to "Running..." with spinner
2. Live panel fades in (use framer-motion for animation)
3. SSE connection opens to `/api/tests/{id}/live`
4. Events stream in, updating phase indicator + step tracker + event log
5. When `eval_complete` event arrives → show result badge, auto-collapse panel after 5 seconds
6. Queries refresh to show new result in history table

---

## Implementation Plan

### Step 1: Backend — Log `streaming_url` to event stream

**File:** `backend/agents/pipeline.py`

Currently the `streaming_url` from TinyFish is only stored in `BrowserResult`. Add a log event after the browser call with the URL:

```python
# After browser_result = await execute_test(url, plan.tinyfish_goal)
if browser_result.streaming_url:
    _log("browser_preview", f"Browser preview available", streaming_url=browser_result.streaming_url)
```

This gives the frontend the URL to embed in an iframe.

---

### Step 2: Backend — Log planned steps to event stream

Currently `plan_complete` only logs the count. Add the actual step descriptions so the frontend can show them before execution starts:

```python
# After plan = await create_plan(url, goal)
_log("plan_complete", f"Plan created: {plan.total_steps} steps",
     steps=json.dumps([{"step_number": s.step_number, "description": s.description} for s in plan.steps]))
```

---

### Step 3: Frontend — Create `LiveExecutionPanel` component

**File:** `client/src/components/live-execution-panel.tsx` (NEW)

Props:
```typescript
interface LiveExecutionPanelProps {
  testId: string;
  isRunning: boolean;       // true when runMutation.isPending
  onComplete?: () => void;  // callback to refresh queries
}
```

**SSE connection logic:**
```typescript
useEffect(() => {
  if (!isRunning) return;

  const eventSource = new EventSource(`/api/tests/${testId}/live`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Update state based on event type
    setEvents(prev => [...prev, data]);

    switch (data.type) {
      case "plan_start":
        setPhase("planning");
        break;
      case "plan_complete":
        setPhase("browsing");
        if (data.steps) setPlannedSteps(JSON.parse(data.steps));
        break;
      case "browser_preview":
        setStreamingUrl(data.streaming_url);
        break;
      case "step_complete":
        updateStepResult(data.step_number, data.passed === "true");
        break;
      case "eval_start":
        setPhase("evaluating");
        break;
      case "eval_complete":
        setPhase("complete");
        setResult(data.passed === "true" ? "passed" : "failed");
        onComplete?.();
        break;
      case "error":
        setPhase("error");
        break;
    }
  };

  return () => eventSource.close();
}, [isRunning, testId]);
```

**Important SSE note:** The frontend dev server (Vite/Express) proxies `/api` to FastAPI. SSE should work through the proxy, but if there are buffering issues, may need to set `proxy: { '/api': { changeOrigin: true, ws: true } }` or similar in the Vite config.

---

### Step 4: Frontend — Phase Indicator Component

Three-step progress indicator: Planning → Browsing → Evaluating

```
[■ Planning] ——→ [■ Browsing] ——→ [□ Evaluating]
```

Use shadcn/ui `Badge` or custom component:
- Completed phase: filled with check icon
- Active phase: filled with spinner
- Pending phase: outline/muted
- Error phase: red

Could also use shadcn/ui `progress.tsx` for a simpler linear indicator.

---

### Step 5: Frontend — Step Tracker Component

Shows planned steps with real-time status:

```
✓ Step 1: Navigate to homepage
✓ Step 2: Find login form
⏳ Step 3: Enter credentials (executing...)
○ Step 4: Verify dashboard loads
```

States per step:
- `pending` (○) — not yet executed
- `running` (⏳ with spinner) — currently executing (between step N-1 complete and step N complete)
- `passed` (✓ green) — step_complete with passed=true
- `failed` (✗ red) — step_complete with passed=false

---

### Step 6: Frontend — Browser Preview

Embed the TinyFish streaming URL in an iframe:

```tsx
{streamingUrl && (
  <div className="rounded-md overflow-hidden border">
    <iframe
      src={streamingUrl}
      className="w-full h-64"
      title="Browser Preview"
      sandbox="allow-same-origin allow-scripts"
    />
  </div>
)}
```

If `streamingUrl` is not available yet, show a skeleton placeholder. The URL arrives via the `browser_preview` event.

**Note:** TinyFish streaming URLs may require specific iframe policies or may not support embedding. If iframe doesn't work, fall back to an "Open Preview" external link button (like the current run-test.tsx page does).

---

### Step 7: Frontend — Event Log

Scrolling log of events with timestamps:

```tsx
<div className="font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
  {events.map((e, i) => (
    <div key={i} className="flex gap-2">
      <span className="text-muted-foreground shrink-0">
        {format(new Date(e.timestamp), "HH:mm:ss")}
      </span>
      <span>{e.message}</span>
    </div>
  ))}
</div>
```

Auto-scroll to bottom as new events arrive using a `ref` + `scrollIntoView`.

---

### Step 8: Frontend — Integrate into Test Detail Page

**File:** `client/src/pages/test-detail.tsx`

Add the `LiveExecutionPanel` between the metric cards and the tabs:

```tsx
{/* After metric cards grid */}

<LiveExecutionPanel
  testId={id}
  isRunning={runMutation.isPending}
  onComplete={() => {
    queryClient.invalidateQueries({ queryKey: ["/api/tests", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "results"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "timing"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "uptime"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tests", id, "incidents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  }}
/>

{/* Existing tabs */}
```

---

## Potential Issue: SSE and Run Timing

There's a race condition to handle: when the user clicks "Run Now", the pipeline starts server-side, but the SSE connection may not be established before events start being written. This is fine because:

1. The SSE endpoint replays **all existing events** from the Stream on connect (`XRANGE ... - +`)
2. New events since connection are picked up by the 1s polling
3. So even if the SSE connects a few seconds after the run starts, it catches up

However, there's a subtlety: if this test has been run before, the Stream contains **old events** from previous runs. The frontend needs to filter to only show events from the current run.

**Fix options:**
- **Option A (simple):** Clear the event stream before each new run — add `redis.delete(f"events:{test_id}")` at the start of the pipeline. Old events are already captured in `results:{test_id}`.
- **Option B (cleaner):** Add a `run_id` field to each event in `log_event()`, and filter by run_id on the frontend. More work but preserves history.

**Recommendation:** Option A for hackathon — simple and effective. The events stream is for live view, not historical replay. Historical data lives in the results Sorted Set.

---

## File Changes

### New Files

| File | Description |
|------|-------------|
| `client/src/components/live-execution-panel.tsx` | Live execution panel with SSE, phase indicator, step tracker, browser preview, event log |

### Updated Files

| File | Changes |
|------|---------|
| `backend/agents/pipeline.py` | Log `browser_preview` event with streaming_url, log step descriptions in `plan_complete` |
| `client/src/pages/test-detail.tsx` | Import and render `LiveExecutionPanel` between metrics and tabs |

---

## Implementation Order

| Step | Task | Time |
|------|------|------|
| 1 | Backend: Add `browser_preview` + step descriptions to event logging | 5 min |
| 2 | Backend: Clear events stream at pipeline start (Option A) | 2 min |
| 3 | Frontend: Create `LiveExecutionPanel` component with SSE connection | 10 min |
| 4 | Frontend: Phase indicator (Planning → Browsing → Evaluating) | 5 min |
| 5 | Frontend: Step tracker with real-time status | 5 min |
| 6 | Frontend: Browser preview iframe (with fallback to link) | 5 min |
| 7 | Frontend: Event log with auto-scroll | 3 min |
| 8 | Frontend: Integrate into test-detail.tsx | 3 min |
| 9 | Test: Run a test, verify live view works end-to-end | 5 min |
| | **Total** | **~43 min** |

---

## Testing Plan

### Test 1: Live View End-to-End
1. Navigate to a test's detail page (`/tests/{id}`)
2. Click "Run Now"
3. Live panel should appear with "Planning" phase active
4. After 2-3s: phase switches to "Browsing", planned steps appear
5. Steps tick off one by one as they complete (pass/fail icons)
6. Browser preview shows (if iframe works) or "Open Preview" link
7. Phase switches to "Evaluating"
8. Final result appears (PASSED/FAILED badge)
9. Panel auto-collapses, history table refreshes with new entry

### Test 2: Event Log
1. During live execution, event log should show timestamped entries
2. Log should auto-scroll as new events arrive
3. All event types should render readable messages

### Test 3: Error Handling
1. Run a test that will fail (bad URL or impossible goal)
2. Error event should show in the panel
3. Phase indicator should show error state
4. Panel should still auto-close gracefully

### Test 4: SSE Reconnection
1. Start a run, observe live view
2. If the page is refreshed during execution, the panel should replay events on reconnect

### Test 5: No Interference
1. When no run is active, the live panel should be completely hidden
2. Existing test detail page functionality should be unaffected

---

## Exit Criteria

- [ ] Live execution panel appears when Run Now is clicked
- [ ] Phase indicator shows correct stage (Planning → Browsing → Evaluating → Complete)
- [ ] Planned steps appear after plan_complete, tick off as step_complete events arrive
- [ ] Browser preview shows (iframe or external link)
- [ ] Event log shows timestamped entries with auto-scroll
- [ ] Panel shows final result (PASSED/FAILED) on eval_complete
- [ ] Panel disappears/collapses after execution completes
- [ ] Old events from previous runs don't interfere (stream cleared before each run)
- [ ] History table and metrics refresh after run completes

---

## Notes

- **Framer Motion** is already installed — use `AnimatePresence` + `motion.div` for panel appear/disappear transitions
- **TinyFish iframe**: May not work if TinyFish blocks embedding. Fall back to external link if `X-Frame-Options` prevents it. Test this early.
- **Event stream clearing**: Option A (delete before run) means you lose the ability to replay the live view of a historical run. This is fine for hackathon — the results table has all the data.
- **SSE proxy**: Vite dev server proxies `/api` to FastAPI. SSE should work but may need `ws: true` in proxy config if events buffer.
- **Mobile**: On small screens, stack the browser preview and step tracker vertically instead of side-by-side.
