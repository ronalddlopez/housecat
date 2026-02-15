# Phase 7 — Three Bug Fixes

Fix three issues in the current Phase 7 implementation.

---

## Fix 1: QStash callback 401 Unauthorized

**Problem:** QStash callbacks return 401 because `receiver.verify()` uses `str(request.url)` which resolves to the internal URL (e.g., `http://0.0.0.0:8000/api/callback/...`) instead of the public URL that QStash signed (e.g., `https://xxx.replit.dev/api/callback/...`).

**File:** `backend/main.py`

**Change line 86 from:**
```python
receiver.verify(body=body.decode(), signature=upstash_signature, url=str(request.url))
```

**To:**
```python
public_url = get_public_url()
verify_url = f"{public_url}/api/callback/{test_id}"
receiver.verify(body=body.decode(), signature=upstash_signature, url=verify_url)
```

`get_public_url()` is already imported from `services.config`.

---

## Fix 2: Screenshots — capture Before and After instead of just one

**Problem:** Currently `capture_step_screenshots()` is called once after all TinyFish steps complete, producing a single screenshot labeled with the last step number. Since TinyFish controls the browser (we don't get control between individual steps), we can't screenshot each step. Instead, capture a **before** (initial page state) and **after** (final page state) screenshot — this is actually more useful for QA comparison.

### File: `backend/services/screenshot.py`

Replace the `capture_step_screenshots` function with:

```python
async def capture_before_after(url: str, step_count: int, phase: str = "after") -> dict | None:
    """Capture a single screenshot and return it as a dict.

    Args:
        url: The URL to screenshot
        step_count: Total steps in the test plan
        phase: "before" or "after" — determines step_number (0 for before, step_count for after)
    """
    screenshot_b64 = await capture_screenshot(url)
    if not screenshot_b64:
        return None
    return {
        "step_number": 0 if phase == "before" else step_count,
        "label": "Initial page state" if phase == "before" else "Final page state",
        "url": url,
        "image_base64": screenshot_b64,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
```

Keep the existing `capture_screenshot()` function unchanged — it's the low-level function that the new function calls. You can remove the old `capture_step_screenshots` function since it will no longer be used.

### File: `backend/agents/pipeline.py`

Replace the single screenshot capture block (around lines 51-57) with before/after captures:

```python
from services.screenshot import capture_before_after

async def run_test(url: str, goal: str, test_id: str | None = None) -> tuple[TestPlan, BrowserResult, TestResult, list]:
    start = time.time()

    # ... existing event stream clearing and _log helper ...

    try:
        # === PLANNER PHASE (unchanged) ===
        _log("plan_start", f"Planning test for {url}")
        plan = await create_plan(url, goal)
        steps_json = json.dumps([{"step_number": s.step_number, "description": s.description} for s in plan.steps])
        _log("plan_complete", f"Plan created: {plan.total_steps} steps", steps=steps_json)

        # NEW: Capture BEFORE screenshot (initial page state)
        screenshots = []
        try:
            before_ss = await capture_before_after(url, plan.total_steps, phase="before")
            if before_ss:
                screenshots.append(before_ss)
                if test_id:
                    _log("screenshot_captured", "Captured initial page state screenshot")
        except Exception:
            pass

        # === BROWSER PHASE (unchanged) ===
        _log("browser_start", "Executing test with TinyFish")
        browser_result = await execute_test(url, plan.tinyfish_goal)
        # ... existing streaming_url logging and step_complete logging ...
        _log("browser_complete", f"Browser execution finished: {len(browser_result.step_results)} steps")

        # NEW: Capture AFTER screenshot (final page state)
        try:
            after_ss = await capture_before_after(url, plan.total_steps, phase="after")
            if after_ss:
                screenshots.append(after_ss)
                if test_id:
                    _log("screenshot_captured", f"Captured {len(screenshots)} screenshot(s) total")
        except Exception:
            pass

        # === EVALUATOR PHASE (unchanged) ===
        _log("eval_start", "Evaluating results")
        # ... rest unchanged ...

        return plan, browser_result, final_result, screenshots
```

Make sure to keep all existing code between the phases — only add the before screenshot before the browser phase and the after screenshot after the browser phase. Remove the old single `capture_step_screenshots` call.

### File: `client/src/pages/test-detail.tsx`

Add `label` to the `Screenshot` interface at the top of the file:

```typescript
interface Screenshot {
  step_number: number;
  label?: string;        // ← ADD this field
  url: string;
  image_base64: string;
  captured_at: string;
}
```

In the `RunDetailPanel` Screenshots tab, update the label display to use the `label` field from the screenshot dict instead of just "Step {number}". Replace the screenshot rendering section (inside `TabsContent value="screenshots"`) with:

```tsx
<TabsContent value="screenshots" className="mt-4">
  {run.screenshots && run.screenshots.length > 0 ? (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {run.screenshots.map((ss, idx) => (
        <div key={idx} className="space-y-1.5">
          <img
            src={`data:image/jpeg;base64,${ss.image_base64}`}
            alt={ss.label || `Step ${ss.step_number} screenshot`}
            className="rounded-md w-full"
            data-testid={`img-screenshot-${ss.step_number}`}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium">
              {ss.label || `Step ${ss.step_number}`}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(ss.captured_at), "MMM d, HH:mm:ss")}
            </span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No screenshots captured for this run.</p>
  )}
</TabsContent>
```

---

## Fix 3: Browser preview "There is no service on this URL"

**Problem:** The TinyFish streaming URL (`stream.tinyfish.ai`) can't load inside an iframe within Replit's webview. Replit's internal proxy intercepts the request and shows "There is no service on this URL." The "Open Preview" button (which opens a new tab) works fine.

**File:** `client/src/components/live-execution-panel.tsx`

The iframe approach won't work reliably in Replit's webview. Replace the iframe with a prominent "Open Preview" button and a status message. Change the browser preview section (around lines 351-388) from:

```tsx
{streamingUrl && (
  <div className="space-y-2">
    <p className="text-xs font-medium text-muted-foreground">Browser Preview</p>
    <div className="rounded-md overflow-hidden border aspect-video bg-muted">
      <iframe
        src={streamingUrl}
        className="w-full h-full"
        title="Browser Preview"
        sandbox="allow-same-origin allow-scripts"
        data-testid="iframe-preview"
      />
    </div>
    <Button size="sm" variant="outline" asChild>
      <a href={streamingUrl} target="_blank" rel="noopener noreferrer" data-testid="link-preview">
        <ExternalLink className="h-3.5 w-3.5" />
        Open Preview
      </a>
    </Button>
  </div>
)}

{!streamingUrl && phase === "browsing" && (
  <div className="rounded-md border aspect-video bg-muted flex items-center justify-center">
    <div className="text-center space-y-2">
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      <p className="text-xs text-muted-foreground">Waiting for browser preview...</p>
    </div>
  </div>
)}
```

**To:**

```tsx
{streamingUrl && (
  <div className="space-y-2">
    <p className="text-xs font-medium text-muted-foreground">Browser Preview</p>
    <div className="rounded-md border aspect-video bg-muted flex items-center justify-center">
      <div className="text-center space-y-3">
        <Globe className="h-8 w-8 mx-auto text-emerald-500" />
        <p className="text-sm font-medium">TinyFish is browsing...</p>
        <p className="text-xs text-muted-foreground">Watch the live browser session</p>
        <Button size="sm" variant="default" asChild>
          <a href={streamingUrl} target="_blank" rel="noopener noreferrer" data-testid="link-preview">
            <ExternalLink className="h-3.5 w-3.5" />
            Open Live Preview
          </a>
        </Button>
      </div>
    </div>
  </div>
)}

{!streamingUrl && phase === "browsing" && (
  <div className="rounded-md border aspect-video bg-muted flex items-center justify-center">
    <div className="text-center space-y-2">
      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      <p className="text-xs text-muted-foreground">Waiting for browser preview...</p>
    </div>
  </div>
)}
```

Note: `Globe` is already imported from lucide-react in this file.

When the phase is `"complete"`, the live panel auto-hides after 8 seconds, so the streaming URL card disappears naturally. No additional changes needed.

---

## Summary of file changes

| File | Change |
|------|--------|
| `backend/main.py` | Fix `receiver.verify()` to use public URL instead of `request.url` |
| `backend/services/screenshot.py` | Add `capture_before_after()` function, remove old `capture_step_screenshots()` |
| `backend/agents/pipeline.py` | Capture before + after screenshots instead of one post-run screenshot |
| `client/src/pages/test-detail.tsx` | Add `label` to Screenshot interface, display label in screenshots tab |
| `client/src/components/live-execution-panel.tsx` | Replace iframe with "Open Live Preview" button + status card |

## Testing

1. **QStash fix:** Wait for a scheduled QStash callback (or manually trigger via QStash console) — should return 200 instead of 401
2. **Screenshots:** Run a test manually → expand the row → Screenshots tab should show 2 images: "Initial page state" and "Final page state"
3. **Browser preview:** Run a test → live panel shows "TinyFish is browsing..." card with "Open Live Preview" button → clicking opens TinyFish stream in new tab
