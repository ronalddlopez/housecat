# Phase 7 Refactor — Per-Step TinyFish Execution + Screenshots

This is a significant pipeline restructure. Instead of calling TinyFish once with all steps combined, we now call TinyFish **once per step**, capturing a Playwright screenshot after each step completes. This also fixes the QStash 401 bug and the broken browser preview iframe.

---

## Overview of Changes

| File | What Changes |
|------|-------------|
| `backend/models.py` | Add `StepExecution` model, update `TestPlan` to have per-step goals, update `BrowserResult` |
| `backend/agents/planner.py` | Generate per-step `tinyfish_goal` for each step (not one combined goal) |
| `backend/agents/browser.py` | New `execute_step()` function for single-step execution (replaces `execute_test()`) |
| `backend/agents/pipeline.py` | Loop over steps: call TinyFish per step, screenshot after each, collect `StepExecution` list |
| `backend/services/screenshot.py` | Replace `capture_step_screenshots()` with simpler `capture_before_after()` |
| `backend/services/result_store.py` | Store `step_executions[]` instead of flat `tinyfish_raw`/`tinyfish_data`/`streaming_url` |
| `backend/main.py` | Fix QStash `receiver.verify()` URL, update return tuple handling |
| `backend/api/tests.py` | Update return tuple handling |
| `backend/run_pipeline.py` | Update return tuple handling |
| `client/src/pages/test-detail.tsx` | Per-step screenshots, per-step evidence, per-step raw JSON |
| `client/src/components/live-execution-panel.tsx` | Replace iframe with "Open Live Preview" button |

---

## Fix 1: Backend Models (`backend/models.py`)

### Add `StepExecution` model

Add this new model after `StepResult`:

```python
class StepExecution(BaseModel):
    step_number: int
    description: str = Field(description="What this step does")
    tinyfish_goal: str = Field(description="The single-step goal sent to TinyFish")
    tinyfish_raw: str | None = Field(default=None, description="Raw JSON string from TinyFish for this step")
    tinyfish_data: dict | None = Field(default=None, description="Parsed TinyFish result for this step")
    streaming_url: str | None = Field(default=None, description="TinyFish live browser preview URL for this step")
    screenshot: dict | None = Field(default=None, description="Screenshot captured after this step")
    passed: bool = False
    details: str = ""
    error: str | None = None
```

### Update `TestPlan` — add per-step goals

Change the `TestStep` model to include a `tinyfish_goal` field:

```python
class TestStep(BaseModel):
    step_number: int
    description: str = Field(description="What to do in this step")
    success_criteria: str = Field(description="How to know this step passed")
    tinyfish_goal: str = Field(description="The TinyFish goal prompt for just this step, including JSON output format")
```

The `TestPlan` model keeps its existing `tinyfish_goal` field (for backward compat / display in the Plan tab), but now each step also has its own `tinyfish_goal`.

### Update `BrowserResult` — add `step_executions`

Replace the current `BrowserResult` with:

```python
class BrowserResult(BaseModel):
    success: bool
    step_results: list[StepResult] = Field(description="Per-step pass/fail breakdown")
    step_executions: list[StepExecution] = Field(default_factory=list, description="Per-step TinyFish execution data")
    raw_result: str | None = Field(default=None, description="Combined raw result (legacy, kept for compat)")
    streaming_url: str | None = Field(default=None, description="Last TinyFish streaming URL (legacy)")
    error: str | None = None
```

Keep the full models file intact. Just add `StepExecution` after `StepResult`, update `TestStep`, and update `BrowserResult`. Do NOT remove `CreateTestSuite`, `UpdateTestSuite`, or `TestSuiteResponse`.

---

## Fix 2: Planner (`backend/agents/planner.py`)

Update the planner instructions to generate per-step TinyFish goals. Each `TestStep` in the output now needs its own `tinyfish_goal`.

Replace the entire `instructions` string with:

```python
instructions="""You are a QA test planner that generates browser automation instructions
for TinyFish, an AI-powered browser agent.

TinyFish accepts a URL and a "goal" — a natural language instruction describing what to do
in a real browser. It executes the goal and returns structured JSON.

YOUR JOB: Given a test URL and a human-written test description, generate:
1. A `tinyfish_goal` — the full combined goal for display purposes (all steps together)
2. A `steps` list — discrete steps, each with its own `tinyfish_goal` for individual execution

RULES FOR EACH STEP'S tinyfish_goal:
- Each step's tinyfish_goal is a SELF-CONTAINED prompt for a SINGLE action
- Be specific about actions: "Click the Login button", not "log in"
- For form fields, specify the value: "Enter 'test@example.com' in the email field"
- Include what to verify after the action: "Verify the dashboard page loads"
- TinyFish sees the page visually (screenshots) — reference visible text and labels, NOT CSS selectors or XPaths
- IMPORTANT: Each step starts in a FRESH browser session at the target URL. If a step depends on prior navigation, include the full navigation in that step's goal.
- Always end each step goal with the expected JSON output format and "Return valid JSON only."

JSON OUTPUT FORMAT TO REQUEST (for each step):
Always ask TinyFish to return this structure:
{
  "success": true/false,
  "action_performed": "description of what was done",
  "verification": "what was observed after the action",
  "error": null or "error description"
}

RULES FOR THE COMBINED tinyfish_goal:
- Use numbered STEP format: "STEP 1: ...", "STEP 2: ..."
- This is for display in the Plan tab — it shows the full test plan at a glance
- Include the full JSON output format at the end

WHAT TINYFISH HANDLES WELL:
- Multi-step navigation across pages
- Form filling (text inputs, dropdowns, checkboxes)
- Clicking buttons and links
- Waiting for dynamic content (SPAs, AJAX loading)
- Extracting visible text and data from the page

WHAT TINYFISH CANNOT DO:
- No persistent sessions between calls (each call = fresh browser)
- No file downloads or uploads
- No CAPTCHA solving
- Cannot access browser DevTools or network tab

IMPORTANT SESSION NOTE: Each TinyFish call starts a fresh browser session. If Step 3 requires
being on a page that Step 2 navigated to, Step 3's tinyfish_goal must include navigating there
from scratch. Make each step self-contained.

STEP COUNT: Aim for 3-6 steps. Simple checks = 2-3 steps. Complex flows = 5-6 steps. Never exceed 8.

The `steps` list should mirror the STEP instructions in the combined goal.""",
```

No changes to the `create_plan` function itself — it still just calls the agent and returns `TestPlan`.

---

## Fix 3: Browser Agent (`backend/agents/browser.py`)

Add a new `execute_step()` function for single-step execution. Keep `execute_test()` for backward compatibility but it won't be called from pipeline anymore.

Replace the entire file with:

```python
import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext, UsageLimits
from models import BrowserResult, StepResult, StepExecution
from services.tinyfish import call_tinyfish


@dataclass
class BrowserDeps:
    url: str
    tinyfish_goal: str


browser_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    deps_type=BrowserDeps,
    output_type=BrowserResult,
    instructions="""You are a browser testing agent. You execute test plans by calling the
browse tool with a URL and goal.

YOUR JOB:
1. Call the browse tool with the URL and the TinyFish goal provided to you
2. Parse the result and construct a BrowserResult with per-step breakdown
3. If TinyFish returns step_results in its JSON, use those directly
4. If TinyFish returns a simpler result, infer step pass/fail from the data

HANDLING FAILURES:
- If TinyFish reports a specific step failed, mark that step and all subsequent steps as failed
- If TinyFish returns an error, mark all steps as failed with the error message
- Do NOT retry automatically — just report what happened accurately

CONSTRUCTING step_results:
- Each StepResult needs: step_number, passed (bool), details (string)
- Use the TinyFish result data to determine pass/fail for each step
- Be specific in details: "Login form was visible" not just "passed"
""",
)


@browser_agent.tool
async def browse(ctx: RunContext[BrowserDeps], url: str, goal: str) -> str:
    result = await call_tinyfish(url, goal)
    return json.dumps(result)


async def execute_test(url: str, tinyfish_goal: str) -> BrowserResult:
    """Execute a full test with all steps combined (legacy)."""
    deps = BrowserDeps(url=url, tinyfish_goal=tinyfish_goal)
    result = await browser_agent.run(
        f"Execute this test:\nURL: {url}\nGoal:\n{tinyfish_goal}",
        deps=deps,
        usage_limits=UsageLimits(request_limit=4),
    )
    return result.output


async def execute_step(url: str, step_number: int, description: str, tinyfish_goal: str) -> StepExecution:
    """Execute a single step via TinyFish and return a StepExecution with raw data."""
    tinyfish_result = await call_tinyfish(url, tinyfish_goal)

    # Parse the TinyFish result
    tinyfish_data = None
    tinyfish_raw = tinyfish_result.get("raw")
    if tinyfish_raw:
        try:
            tinyfish_data = json.loads(tinyfish_raw) if isinstance(tinyfish_raw, str) else tinyfish_raw
        except (json.JSONDecodeError, TypeError):
            pass

    # Determine pass/fail from TinyFish result
    passed = tinyfish_result.get("success", False)
    details = ""
    error = tinyfish_result.get("error")

    if tinyfish_data:
        # Try to extract meaningful details from the parsed result
        details = tinyfish_data.get("verification", "") or tinyfish_data.get("action_performed", "") or tinyfish_data.get("message", "")
        if tinyfish_data.get("success") is False:
            passed = False
        elif tinyfish_data.get("success") is True:
            passed = True
    elif error:
        details = error
        passed = False
    else:
        details = "Step executed" if passed else "Step failed"

    return StepExecution(
        step_number=step_number,
        description=description,
        tinyfish_goal=tinyfish_goal,
        tinyfish_raw=tinyfish_raw if isinstance(tinyfish_raw, str) else json.dumps(tinyfish_raw) if tinyfish_raw else None,
        tinyfish_data=tinyfish_data,
        streaming_url=tinyfish_result.get("streaming_url"),
        screenshot=None,  # Will be filled by pipeline after screenshot capture
        passed=passed,
        details=details,
        error=error,
    )
```

Key change: `execute_step()` calls `call_tinyfish()` directly (no AI agent overhead) for a single step and returns a `StepExecution` object with all the raw data.

---

## Fix 4: Pipeline (`backend/agents/pipeline.py`)

This is the biggest change. Replace the entire file with:

```python
import json
import time
from models import TestPlan, BrowserResult, StepResult, StepExecution, TestResult
from agents.planner import create_plan
from agents.browser import execute_step
from agents.evaluator import evaluate_test
from services.result_store import log_event
from services.config import get_redis
from services.screenshot import capture_before_after


async def run_test(url: str, goal: str, test_id: str | None = None) -> tuple[TestPlan, BrowserResult, TestResult, list]:
    start = time.time()

    if test_id:
        try:
            redis = get_redis()
            redis.delete(f"events:{test_id}")
        except Exception as e:
            print(f"[EventLog] Failed to clear events stream: {e}")

    def _log(event_type: str, message: str, **kwargs):
        if test_id:
            try:
                log_event(test_id, event_type, message, **kwargs)
            except Exception as e:
                print(f"[EventLog] Failed to log event: {e}")

    try:
        # === PLANNER PHASE ===
        _log("plan_start", f"Planning test for {url}")
        print(f"[Planner] Creating test plan for: {goal}")
        plan = await create_plan(url, goal)
        print(f"[Planner] {plan.total_steps} steps planned")
        steps_json = json.dumps([{"step_number": s.step_number, "description": s.description} for s in plan.steps])
        _log("plan_complete", f"Plan created: {plan.total_steps} steps", steps=steps_json)

        # === BEFORE SCREENSHOT ===
        screenshots = []
        try:
            before_ss = await capture_before_after(url, plan.total_steps, phase="before")
            if before_ss:
                screenshots.append(before_ss)
                _log("screenshot_captured", "Captured initial page state screenshot")
        except Exception:
            pass

        # === BROWSER PHASE — PER-STEP EXECUTION ===
        _log("browser_start", "Executing test with TinyFish")
        print(f"[Browser] Executing {plan.total_steps} steps individually...")

        step_executions: list[StepExecution] = []
        step_results: list[StepResult] = []

        for step in plan.steps:
            step_num = step.step_number
            _log("step_start", f"Step {step_num}: {step.description}", step_number=step_num)
            print(f"[Browser] Step {step_num}/{plan.total_steps}: {step.description}")

            try:
                # Execute this single step via TinyFish
                execution = await execute_step(
                    url=url,
                    step_number=step_num,
                    description=step.description,
                    tinyfish_goal=step.tinyfish_goal,
                )

                # Log streaming URL if available
                if execution.streaming_url:
                    _log("browser_preview", f"Step {step_num} preview available", streaming_url=execution.streaming_url)

                # Capture screenshot after this step
                try:
                    ss = await capture_before_after(url, plan.total_steps, phase="after")
                    if ss:
                        ss["step_number"] = step_num
                        ss["label"] = f"Step {step_num}: {step.description[:60]}"
                        execution.screenshot = ss
                        screenshots.append(ss)
                        _log("screenshot_captured", f"Screenshot captured for step {step_num}")
                except Exception:
                    pass

                step_executions.append(execution)

                # Build StepResult for evaluator
                sr = StepResult(
                    step_number=step_num,
                    passed=execution.passed,
                    details=execution.details,
                )
                step_results.append(sr)

                status = "+" if execution.passed else "x"
                print(f"[Browser] Step {step_num}: {status} {execution.details[:80]}")
                _log("step_complete", f"Step {step_num}: {'passed' if execution.passed else 'failed'} — {execution.details[:120]}", step_number=step_num, passed=execution.passed)

            except Exception as e:
                error_msg = f"Step {step_num} execution error: {str(e)[:200]}"
                print(f"[Browser] {error_msg}")
                _log("step_complete", error_msg, step_number=step_num, passed=False)

                # Create a failed execution record
                failed_exec = StepExecution(
                    step_number=step_num,
                    description=step.description,
                    tinyfish_goal=step.tinyfish_goal,
                    passed=False,
                    details=error_msg,
                    error=str(e)[:200],
                )
                step_executions.append(failed_exec)
                step_results.append(StepResult(
                    step_number=step_num,
                    passed=False,
                    details=error_msg,
                ))

        _log("browser_complete", f"Browser execution finished: {len(step_executions)} steps")

        # Build BrowserResult from collected per-step data
        # Combine all raw results for legacy compat
        combined_raw = json.dumps([
            {"step": se.step_number, "raw": se.tinyfish_raw, "data": se.tinyfish_data}
            for se in step_executions
        ])
        last_streaming_url = next(
            (se.streaming_url for se in reversed(step_executions) if se.streaming_url),
            None,
        )

        browser_result = BrowserResult(
            success=all(se.passed for se in step_executions),
            step_results=step_results,
            step_executions=[se.model_dump() for se in step_executions] if step_executions else [],
            raw_result=combined_raw,
            streaming_url=last_streaming_url,
        )

        # === EVALUATOR PHASE ===
        _log("eval_start", "Evaluating results")
        print(f"[Evaluator] Synthesizing results...")
        final_result = await evaluate_test(
            url=url,
            goal=goal,
            browser_result=browser_result.model_dump(),
            step_results=[sr.model_dump() for sr in step_results],
        )

        final_result.duration_ms = int((time.time() - start) * 1000)

        status = "PASSED" if final_result.passed else "FAILED"
        print(f"[Result] {status} -- {final_result.steps_passed}/{final_result.steps_total} steps in {final_result.duration_ms}ms")
        print(f"[Result] {final_result.details}")
        _log("eval_complete", f"Test {status} — {final_result.steps_passed}/{final_result.steps_total} steps", passed=final_result.passed)

        return plan, browser_result, final_result, screenshots

    except Exception as e:
        _log("error", f"Pipeline error: {str(e)}")
        raise
```

Key changes:
- Loops over `plan.steps` individually
- Calls `execute_step()` (not `execute_test()`) for each step
- Captures a screenshot with `capture_before_after(url, ..., phase="after")` after each step
- Builds `StepExecution` objects with all per-step data
- Captures a "before" screenshot of the initial page state before any steps run
- Constructs `BrowserResult` at the end from collected data

**Note about `step_executions` field:** The `BrowserResult` model has `step_executions: list[StepExecution]` but when we build the browser_result, we pass `[se.model_dump() for se in step_executions]` — this works because Pydantic will accept dicts for model fields. However, the `result_store` will receive these as dicts already, which is what we want for JSON serialization.

---

## Fix 5: Screenshot Service (`backend/services/screenshot.py`)

Replace `capture_step_screenshots` with `capture_before_after`. Keep `capture_screenshot` and all other functions unchanged.

Replace the file with:

```python
import base64
import asyncio
from datetime import datetime, timezone

_browser = None
_context = None
_playwright = None


async def _get_browser():
    global _browser, _context, _playwright
    if _browser is None or not _browser.is_connected():
        from playwright.async_api import async_playwright
        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--disable-setuid-sandbox",
            ],
        )
        _context = await _browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
    return _browser


async def capture_screenshot(url: str, wait_seconds: int = 2) -> str | None:
    try:
        await _get_browser()
        page = await _context.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=15000)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            screenshot_bytes = await page.screenshot(
                type="jpeg",
                quality=80,
                full_page=False,
            )
            return base64.b64encode(screenshot_bytes).decode("utf-8")
        finally:
            await page.close()
    except Exception as e:
        print(f"[Screenshot] Failed to capture {url}: {e}")
        return None


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


async def cleanup_browser():
    global _browser, _context, _playwright
    if _context:
        await _context.close()
        _context = None
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None
```

The old `capture_step_screenshots` function is removed. `capture_before_after` is used by the pipeline for both the initial "before" screenshot and per-step "after" screenshots.

---

## Fix 6: Result Store (`backend/services/result_store.py`)

Update `store_run_result` to store `step_executions` from the `BrowserResult`. Replace the function:

```python
def store_run_result(test_id: str, final_result, plan, browser_result, triggered_by: str = "manual", screenshots: list | None = None) -> dict:
    redis = get_redis()
    now = datetime.now(timezone.utc)
    run_id = str(uuid.uuid4())[:8]

    # Extract step_executions from browser_result
    step_executions = []
    if hasattr(browser_result, 'step_executions'):
        step_executions = browser_result.step_executions
    elif hasattr(browser_result, 'model_dump'):
        step_executions = browser_result.model_dump().get('step_executions', [])

    # Legacy: extract tinyfish_data from first execution or combined
    tinyfish_data = None
    if browser_result.raw_result:
        try:
            tinyfish_data = json.loads(browser_result.raw_result)
        except (json.JSONDecodeError, TypeError):
            pass

    run_record = {
        "run_id": run_id,
        "test_id": test_id,
        "passed": final_result.passed,
        "duration_ms": final_result.duration_ms,
        "steps_passed": final_result.steps_passed,
        "steps_total": final_result.steps_total,
        "details": final_result.details,
        "step_results": [sr.model_dump() for sr in final_result.step_results],
        "error": final_result.error,
        "triggered_by": triggered_by,
        "started_at": now.isoformat(),
        "completed_at": now.isoformat(),
        "plan": plan.model_dump(),
        "tinyfish_raw": browser_result.raw_result,
        "tinyfish_data": tinyfish_data,
        "streaming_url": browser_result.streaming_url,
        "step_executions": step_executions if isinstance(step_executions, list) else [],
        "screenshots": screenshots or [],
    }

    timestamp = now.timestamp()

    redis.zadd(f"results:{test_id}", {json.dumps(run_record): timestamp})

    redis.zadd(f"timing:{test_id}", {f"{run_id}:{final_result.duration_ms}": timestamp})

    redis.hset(f"test:{test_id}", values={
        "last_result": "passed" if final_result.passed else "failed",
        "last_run_at": now.isoformat(),
    })

    if not final_result.passed:
        incident = {
            "run_id": run_id,
            "test_id": test_id,
            "error": final_result.error or final_result.details,
            "details": final_result.details,
            "started_at": now.isoformat(),
            "alert_sent": False,
        }
        redis.lpush(f"incidents:{test_id}", json.dumps(incident))

    return run_record
```

The key addition is `step_executions` in the `run_record`. The `log_event` function stays unchanged.

---

## Fix 7: QStash Callback 401 (`backend/main.py`)

**Line 86** — change from:

```python
receiver.verify(body=body.decode(), signature=upstash_signature, url=str(request.url))
```

**To:**

```python
public_url = get_public_url()
verify_url = f"{public_url}/api/callback/{test_id}"
receiver.verify(body=body.decode(), signature=upstash_signature, url=verify_url)
```

`get_public_url()` is already imported from `services.config` at the top of the file.

---

## Fix 8: Callers — Return Tuple Handling

The `run_test()` return signature stays the same: `tuple[TestPlan, BrowserResult, TestResult, list]`. No changes needed to the callers in:
- `backend/main.py` lines 100, 164
- `backend/api/tests.py` line 72
- `backend/run_pipeline.py` line 16

They all already unpack `plan, browser_result, final_result, screenshots`. No changes needed.

---

## Fix 9: Frontend — Test Detail Page (`client/src/pages/test-detail.tsx`)

### Update TypeScript interfaces

Add `StepExecution` interface and update `Screenshot` and `RunResult`:

```typescript
interface Screenshot {
  step_number: number;
  label?: string;        // NEW
  url: string;
  image_base64: string;
  captured_at: string;
}

interface StepExecution {
  step_number: number;
  description: string;
  tinyfish_goal: string;
  tinyfish_raw: string | null;
  tinyfish_data: any | null;
  streaming_url: string | null;
  screenshot: Screenshot | null;
  passed: boolean;
  details: string;
  error: string | null;
}

interface RunResult {
  run_id: string;
  test_id: string;
  passed: boolean;
  duration_ms: number;
  steps_passed: number;
  steps_total: number;
  details: string;
  error: string | null;
  triggered_by: string;
  started_at: string;
  completed_at: string;
  step_results?: StepResult[];
  plan?: Plan;
  tinyfish_raw?: string;
  tinyfish_data?: any;
  streaming_url?: string;
  step_executions?: StepExecution[];   // NEW
  screenshots?: Screenshot[];
}
```

### Update Screenshots tab

Replace the screenshots `TabsContent` (around line 252-275) with:

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

### Update Evidence tab — per-step evidence

Replace the evidence `TabsContent` (around line 277-322) with:

```tsx
<TabsContent value="evidence" className="mt-4">
  {run.step_executions && run.step_executions.length > 0 ? (
    <div className="space-y-4">
      {run.step_executions.map((exec) => (
        <div key={exec.step_number} className="space-y-2 border rounded-md p-3">
          <div className="flex items-center gap-2">
            {exec.passed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <span className="text-sm font-medium">Step {exec.step_number}: {exec.description}</span>
            {exec.streaming_url && (
              <a
                href={exec.streaming_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-blue-500 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Preview
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{exec.details}</p>
          {exec.error && (
            <p className="text-xs text-red-500">Error: {exec.error}</p>
          )}
          {exec.tinyfish_data && (
            <Table>
              <TableBody>
                {Object.entries(exec.tinyfish_data).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-xs font-mono py-1">{key}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ))}
    </div>
  ) : run.tinyfish_data ? (() => {
    const v = run.tinyfish_data.verification || run.tinyfish_data;
    const checks = v?.checks;
    return (
      <div className="space-y-3">
        <Table>
          <TableBody>
            {(v?.goal || run.tinyfish_data.goal) && (
              <TableRow>
                <TableCell className="font-medium text-sm">Goal</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v?.goal || run.tinyfish_data.goal}</TableCell>
              </TableRow>
            )}
            {(v?.status || run.tinyfish_data.status) && (
              <TableRow>
                <TableCell className="font-medium text-sm">Status</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v?.status || run.tinyfish_data.status}</TableCell>
              </TableRow>
            )}
            {(v?.message || run.tinyfish_data.message) && (
              <TableRow>
                <TableCell className="font-medium text-sm">Message</TableCell>
                <TableCell className="text-sm text-muted-foreground">{v?.message || run.tinyfish_data.message}</TableCell>
              </TableRow>
            )}
            {checks && typeof checks === "object" && !Array.isArray(checks) && Object.entries(checks).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-medium text-sm font-mono">{key}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{String(value)}</TableCell>
              </TableRow>
            ))}
            {checks && Array.isArray(checks) && checks.map((check: any, idx: number) => (
              <TableRow key={idx}>
                <TableCell className="font-medium text-sm">{check.name || `Check ${idx + 1}`}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{check.result || check.status || JSON.stringify(check)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  })() : (
    <p className="text-sm text-muted-foreground">No verification data available.</p>
  )}
</TabsContent>
```

This shows per-step evidence cards when `step_executions` is available, falling back to the old flat `tinyfish_data` for backward compatibility with existing runs.

### Update Raw JSON tab — per-step raw data

Replace the raw-json `TabsContent` (around line 324-346) with:

```tsx
<TabsContent value="raw-json" className="mt-4">
  {run.step_executions && run.step_executions.length > 0 ? (
    <div className="space-y-3">
      {run.step_executions.map((exec) => (
        <div key={exec.step_number} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Step {exec.step_number}: {exec.description}</span>
            {exec.tinyfish_raw && (
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  navigator.clipboard.writeText(exec.tinyfish_raw!);
                  toast({ title: "Copied to clipboard" });
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
          <pre className="p-3 rounded-md text-xs overflow-auto max-h-48 bg-zinc-900 text-zinc-100 dark:bg-zinc-950">
            {exec.tinyfish_raw || "No raw data for this step"}
          </pre>
        </div>
      ))}
    </div>
  ) : run.tinyfish_raw ? (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        className="absolute top-2 right-2"
        data-testid="button-copy-json"
        onClick={() => {
          navigator.clipboard.writeText(run.tinyfish_raw!);
          toast({ title: "Copied to clipboard" });
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <pre className="p-4 rounded-md text-xs overflow-auto max-h-96 bg-zinc-900 text-zinc-100 dark:bg-zinc-950">
        {run.tinyfish_raw}
      </pre>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">No raw data available.</p>
  )}
</TabsContent>
```

---

## Fix 10: Browser Preview Iframe (`client/src/components/live-execution-panel.tsx`)

Replace the iframe browser preview section (around lines 351-388) from:

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

`Globe` is already imported from `lucide-react` in this file. The iframe is replaced with a card that has the "Open Live Preview" button which opens in a new tab.

---

## Summary of File Changes

| # | File | Change |
|---|------|--------|
| 1 | `backend/models.py` | Add `StepExecution` model, add `tinyfish_goal` to `TestStep`, add `step_executions` to `BrowserResult` |
| 2 | `backend/agents/planner.py` | Update instructions for per-step goals |
| 3 | `backend/agents/browser.py` | Add `execute_step()` function for single-step TinyFish calls |
| 4 | `backend/agents/pipeline.py` | Loop over steps individually, capture screenshot per step |
| 5 | `backend/services/screenshot.py` | Replace `capture_step_screenshots` with `capture_before_after` |
| 6 | `backend/services/result_store.py` | Store `step_executions[]` in run record |
| 7 | `backend/main.py` | Fix QStash `receiver.verify()` URL (line 86) |
| 8 | `client/src/pages/test-detail.tsx` | Add `StepExecution` interface, per-step screenshots/evidence/raw-json |
| 9 | `client/src/components/live-execution-panel.tsx` | Replace iframe with "Open Live Preview" button |

## Important Notes

- **No changes needed** to: `backend/api/tests.py`, `backend/api/results.py`, `backend/run_pipeline.py`, `backend/services/tinyfish.py`, `backend/services/config.py`, `backend/services/result_store.py:log_event()`, `backend/agents/evaluator.py`
- **Backward compatible**: Old runs stored in Redis still work — the frontend falls back to `tinyfish_data`/`tinyfish_raw` when `step_executions` is not present
- **Session isolation**: Each TinyFish call starts a fresh browser. The planner's per-step goals must be self-contained (include any navigation needed)
- **Performance**: This will be ~3x slower than the combined approach (N TinyFish calls instead of 1), but produces much richer data

## Testing

1. **QStash fix:** Trigger a scheduled callback → should return 200 instead of 401
2. **Per-step screenshots:** Run a test → expand row → Screenshots tab should show one screenshot per step plus the initial "before" screenshot
3. **Per-step evidence:** Evidence tab should show per-step cards with TinyFish data for each step
4. **Per-step raw JSON:** Raw JSON tab should show collapsible per-step raw data
5. **Browser preview:** Live panel shows "TinyFish is browsing..." card with "Open Live Preview" button
6. **Backward compat:** Existing runs in Redis still display correctly (fallback rendering)
