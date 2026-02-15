# Phase 1: Multi-Agent Engine — Detailed Plan

**Goal:** The core multi-agent pipeline (Planner → Browser → Evaluator) running from the command line. This is the hardest and most critical phase — everything else is CRUD on top of it.

**Where:** Local dev (VS Code + Claude Code). Push to GitHub → Replit picks it up.

---

## Overview

By the end of Phase 1, this command works:

```bash
python run_pipeline.py "https://example.com" "Verify the page loads and has a heading that says Example Domain"
```

And outputs:
```
[Planner] Creating test plan...
[Planner] 3 steps planned
[Browser] Step 1/3: Navigate to https://example.com...
[Browser] Step 1/3: ✓ Passed
[Browser] Step 2/3: Verify the main heading is visible...
[Browser] Step 2/3: ✓ Passed
[Browser] Step 3/3: Verify the heading text is "Example Domain"...
[Browser] Step 3/3: ✓ Passed
[Evaluator] Synthesizing results...
[Result] PASSED — 3/3 steps passed in 12,450ms
```

---

## File Structure

All new files go in `backend/`. Keep it flat for now — no deep nesting.

```
backend/
├── main.py                  ← existing FastAPI app (Phase 0)
├── models.py                ← Pydantic models (TestStep, TestPlan, StepResult, TestResult)
├── agents/
│   ├── __init__.py
│   ├── planner.py           ← Planner Agent definition + system prompt
│   ├── browser.py           ← Browser Agent definition + TinyFish tool
│   ├── evaluator.py         ← Evaluator Agent definition + http_request tool
│   └── pipeline.py          ← Orchestrator: run_test() function
├── services/
│   ├── __init__.py
│   └── tinyfish.py          ← TinyFish API client (SSE parsing)
└── run_pipeline.py          ← CLI entry point for testing
```

---

## Step 1: Pydantic Models (`models.py`)

Create the structured output models that all three agents use. These are the contracts between agents.

```python
from pydantic import BaseModel, Field

class TestStep(BaseModel):
    """A single step in a test plan."""
    step_number: int
    description: str = Field(description="What to do in this step")
    success_criteria: str = Field(description="How to know this step passed")

class TestPlan(BaseModel):
    """Output of the Planner Agent."""
    tinyfish_goal: str = Field(description="The full TinyFish goal prompt with numbered STEP instructions and JSON output format")
    steps: list[TestStep] = Field(description="Discrete steps for tracking/display (mirrors the STEP instructions)")
    total_steps: int

class StepResult(BaseModel):
    """Result of a single step execution."""
    step_number: int
    passed: bool
    details: str = Field(description="What happened during this step")
    retry_count: int = 0

class BrowserResult(BaseModel):
    """Output of the Browser Agent after executing the full TinyFish goal."""
    success: bool
    step_results: list[StepResult] = Field(description="Per-step breakdown from TinyFish result")
    raw_result: str | None = Field(default=None, description="Raw JSON string from TinyFish")
    streaming_url: str | None = Field(default=None, description="TinyFish live browser preview URL")
    error: str | None = None

class TestResult(BaseModel):
    """Final output from the Evaluator Agent."""
    passed: bool
    duration_ms: int = 0
    steps_passed: int
    steps_total: int
    details: str = Field(description="Overall assessment of the test")
    step_results: list[StepResult] = Field(description="Per-step breakdown")
    error: str | None = Field(default=None, description="Error details if failed")
```

### Key Design Decisions

- `TestPlan.tinyfish_goal` — the Planner outputs the actual TinyFish prompt string, not just steps. This is the core insight from building-notes.md: the Planner is a TinyFish prompt engineer.
- `BrowserResult` — intermediate model between Browser and Evaluator. Includes `raw_result` so the Evaluator can re-interpret if needed.
- `StepResult` lives in both `BrowserResult` and `TestResult` — Browser produces them, Evaluator may refine them.

---

## Step 2: TinyFish Service (`services/tinyfish.py`)

Extract the TinyFish API call into a reusable async function. This already works in `main.py` — refactor it into a proper service.

```python
import os
import json
import httpx

TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"

async def call_tinyfish(url: str, goal: str, timeout: float = 120.0) -> dict:
    """
    Call TinyFish to browse a URL and perform a goal.

    Returns:
        {
            "success": bool,
            "data": dict | None,      # parsed resultJson
            "raw": str | None,        # raw resultJson string
            "streaming_url": str | None,
            "error": str | None,
            "steps": list[dict],      # STEP events collected during execution
        }
    """
    tinyfish_key = os.environ.get("TINYFISH_API_KEY", "")
    steps_observed = []

    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
        async with client.stream(
            "POST",
            TINYFISH_URL,
            headers={
                "X-API-Key": tinyfish_key,
                "Content-Type": "application/json",
            },
            json={"url": url, "goal": goal},
        ) as response:
            result_json = None
            raw_result = None
            streaming_url = None

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    data = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue

                event_type = data.get("type")

                if event_type == "STREAMING_URL":
                    streaming_url = data.get("streamingUrl")
                elif event_type == "STEP":
                    steps_observed.append({
                        "message": data.get("message", ""),
                        "purpose": data.get("purpose", ""),
                        "action": data.get("action", ""),
                    })
                elif event_type == "COMPLETE":
                    raw_result = data.get("resultJson")
                    if isinstance(raw_result, str):
                        try:
                            result_json = json.loads(raw_result)
                        except json.JSONDecodeError:
                            result_json = {"raw_text": raw_result}
                    elif isinstance(raw_result, dict):
                        result_json = raw_result
                        raw_result = json.dumps(raw_result)
                elif event_type == "ERROR":
                    return {
                        "success": False,
                        "data": None,
                        "raw": None,
                        "streaming_url": streaming_url,
                        "error": data.get("message", "Unknown TinyFish error"),
                        "steps": steps_observed,
                    }

            return {
                "success": True,
                "data": result_json,
                "raw": raw_result,
                "streaming_url": streaming_url,
                "error": None,
                "steps": steps_observed,
            }
```

### Why a Separate Service

- Reusable by Browser Agent tool AND the existing test endpoint in `main.py`
- Collects `STEP` events during SSE streaming — useful for live view later (Phase 6)
- Returns both parsed `data` and `raw` string — gives the Evaluator flexibility
- Single place to add retry logic, logging, or timeout adjustments

---

## Step 3: Planner Agent (`agents/planner.py`)

The Planner is the most important agent. Its job: translate a vague human goal into a precise TinyFish prompt.

```python
from pydantic_ai import Agent, UsageLimits
from models import TestPlan

planner_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestPlan,
    instructions="""You are a QA test planner that generates browser automation instructions
for TinyFish, an AI-powered browser agent.

TinyFish accepts a URL and a "goal" — a natural language instruction describing what to do
in a real browser. It executes the goal and returns structured JSON.

YOUR JOB: Given a test URL and a human-written test description, generate:
1. A `tinyfish_goal` — the exact prompt string to send to TinyFish
2. A `steps` list — discrete steps for tracking and display

RULES FOR WRITING THE tinyfish_goal:
- Use numbered STEP format: "STEP 1: ...", "STEP 2: ..."
- Be specific about actions: "Click the Login button", not "log in"
- For form fields, specify the value: "Enter 'test@example.com' in the email field"
- Include verification at each step: "Verify the dashboard page loads"
- Include conditional failure handling: "If the login fails, report which step failed"
- TinyFish sees the page visually (screenshots) — reference visible text and labels, NOT CSS selectors or XPaths
- Always end with the expected JSON output format
- Always include "Return valid JSON only." at the end

JSON OUTPUT FORMAT TO REQUEST:
Always ask TinyFish to return this structure:
{
  "success": true/false,
  "steps_completed": number,
  "total_steps": number,
  "step_results": [
    {"step": 1, "passed": true/false, "details": "what happened"}
  ],
  "failed_at_step": number or null,
  "error": "error description" or null
}

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

STEP COUNT: Aim for 3-6 steps. Simple checks = 2-3 steps. Complex flows = 5-6 steps. Never exceed 8.

The `steps` list should mirror the STEP instructions in the goal, so the frontend can
display progress and match results to steps.""",
)

async def create_plan(url: str, goal: str) -> TestPlan:
    """Run the Planner Agent to create a test plan."""
    result = await planner_agent.run(
        f"Test URL: {url}\nTest Goal: {goal}",
        usage_limits=UsageLimits(request_limit=3),
    )
    return result.output
```

### What to Watch For

- The Planner might generate overly complex plans. The `UsageLimits(request_limit=3)` prevents infinite loops, but you may need to add "keep it simple" to the instructions.
- The JSON output format we ask TinyFish to return is critical — it's how the Browser Agent parses step-level results from a single TinyFish call.
- Test this agent first with simple goals before moving to the Browser Agent.

---

## Step 4: Browser Agent (`agents/browser.py`)

The Browser Agent executes the plan by calling TinyFish. In the hybrid approach (Option C from building-notes), it makes **one TinyFish call** with the full goal, then parses the per-step results.

```python
from pydantic_ai import Agent, RunContext, UsageLimits
from dataclasses import dataclass
from models import BrowserResult, StepResult
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
    """Navigate to a URL in a real browser and perform the test goal.

    Args:
        url: The URL to navigate to
        goal: The full test instructions for the browser agent
    """
    import json
    result = await call_tinyfish(url, goal)
    return json.dumps(result)

async def execute_test(url: str, tinyfish_goal: str) -> BrowserResult:
    """Run the Browser Agent to execute a test plan via TinyFish."""
    deps = BrowserDeps(url=url, tinyfish_goal=tinyfish_goal)
    result = await browser_agent.run(
        f"Execute this test:\nURL: {url}\nGoal:\n{tinyfish_goal}",
        deps=deps,
        usage_limits=UsageLimits(request_limit=4),
    )
    return result.output
```

### Design Notes

- The Browser Agent gets the `tinyfish_goal` from the Planner's output — it doesn't generate its own prompt.
- `UsageLimits(request_limit=4)` allows the agent to call TinyFish once, process the result, and potentially retry once if it wants to.
- The `browse` tool returns the raw TinyFish result as JSON string — the agent interprets it and structures the `BrowserResult`.
- We pass `url` and `goal` as tool args even though they're in deps — this gives the agent the option to modify them (e.g., retry with a tweaked goal).

### Simplification Option

If the agent overhead adds too much latency for this step, we can bypass the agent and call TinyFish directly:

```python
async def execute_test_direct(url: str, tinyfish_goal: str) -> BrowserResult:
    """Direct TinyFish call without agent overhead (fallback)."""
    result = await call_tinyfish(url, tinyfish_goal)
    # Parse result into BrowserResult manually
    ...
```

Keep this as a fallback — try the agent approach first.

---

## Step 5: Evaluator Agent (`agents/evaluator.py`)

The Evaluator receives all results and produces the final verdict.

```python
from pydantic_ai import Agent, UsageLimits
from models import TestResult, StepResult

evaluator_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestResult,
    instructions="""You are a QA test evaluator. You receive:
- The original test URL and goal (what the human wanted to test)
- The browser execution results (what actually happened)

YOUR JOB:
1. Compare what was requested vs what happened
2. Determine overall pass/fail
3. Provide a clear, concise assessment in `details`
4. Include per-step breakdown in `step_results`
5. Calculate steps_passed and steps_total

PASS CRITERIA:
- A test passes if ALL critical steps succeeded
- Minor issues (slow loading, slightly different text) can still be a PASS with a note
- If the core functionality works as described in the goal, it's a PASS

DETAILS FIELD:
- Write 1-3 sentences summarizing the test outcome
- Be specific: "The login form loaded, credentials were accepted, and the dashboard displayed the user's name"
- On failure, explain what went wrong: "The login form was present but clicking Submit returned a blank page instead of the dashboard"

ERROR FIELD:
- Only set this if there was a technical failure (TinyFish error, timeout, etc.)
- A test that ran but found the feature is broken is a FAIL, not an error
""",
)

async def evaluate_test(
    url: str,
    goal: str,
    browser_result: dict,
    step_results: list[dict],
) -> TestResult:
    """Run the Evaluator Agent to produce the final test result."""
    import json

    prompt = f"""Test URL: {url}
Test Goal: {goal}

Browser Execution Result:
{json.dumps(browser_result, indent=2)}

Step Results:
{json.dumps(step_results, indent=2)}

Evaluate whether this test passed or failed based on the original goal."""

    result = await evaluator_agent.run(
        prompt,
        usage_limits=UsageLimits(request_limit=3),
    )
    return result.output
```

### Evaluator Is Lightweight

The Evaluator doesn't need tools for now. The `http_request` tool for alert webhooks will be added in Phase 3 when we have the callback system. Keep it simple — it just reads results and produces a verdict.

---

## Step 6: Pipeline Orchestrator (`agents/pipeline.py`)

The orchestrator ties all three agents together in sequence.

```python
import time
import json
from models import TestPlan, BrowserResult, TestResult
from agents.planner import create_plan
from agents.browser import execute_test
from agents.evaluator import evaluate_test

async def run_test(url: str, goal: str) -> tuple[TestPlan, BrowserResult, TestResult]:
    """
    Run the full multi-agent test pipeline.

    Returns (plan, browser_result, final_result) for inspection/logging.
    """
    start = time.time()

    # Phase 1: Planner creates the test plan + TinyFish goal
    print(f"[Planner] Creating test plan for: {goal}")
    plan = await create_plan(url, goal)
    print(f"[Planner] {plan.total_steps} steps planned")

    # Phase 2: Browser Agent executes via TinyFish
    print(f"[Browser] Executing test with TinyFish...")
    browser_result = await execute_test(url, plan.tinyfish_goal)

    for sr in browser_result.step_results:
        status = "✓" if sr.passed else "✗"
        print(f"[Browser] Step {sr.step_number}: {status} {sr.details[:80]}")

    # Phase 3: Evaluator synthesizes final verdict
    print(f"[Evaluator] Synthesizing results...")
    final_result = await evaluate_test(
        url=url,
        goal=goal,
        browser_result=browser_result.model_dump(),
        step_results=[sr.model_dump() for sr in browser_result.step_results],
    )

    # Set duration
    final_result.duration_ms = int((time.time() - start) * 1000)

    status = "PASSED" if final_result.passed else "FAILED"
    print(f"[Result] {status} — {final_result.steps_passed}/{final_result.steps_total} steps in {final_result.duration_ms}ms")
    print(f"[Result] {final_result.details}")

    return plan, browser_result, final_result
```

---

## Step 7: CLI Entry Point (`run_pipeline.py`)

Simple script to test the pipeline from the terminal.

```python
import asyncio
import sys
import json

async def main():
    if len(sys.argv) < 3:
        print("Usage: python run_pipeline.py <url> <goal>")
        print('Example: python run_pipeline.py "https://example.com" "Verify the page has a heading"')
        sys.exit(1)

    url = sys.argv[1]
    goal = sys.argv[2]

    from agents.pipeline import run_test
    plan, browser_result, final_result = await run_test(url, goal)

    print("\n" + "=" * 60)
    print("FULL RESULT:")
    print(json.dumps(final_result.model_dump(), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Step 8: Integration with Existing Backend

After the pipeline works from CLI, wire it into `main.py` so the existing test endpoints can use it.

Update `POST /api/tests/{test_id}/run` to call the pipeline:

```python
@app.post("/api/tests/{test_id}/run")
async def run_test_manual(test_id: str):
    # For now, accept URL and goal in the request body
    # (Phase 2 will load these from Redis)
    from agents.pipeline import run_test

    body = await request.json()
    url = body.get("url", "https://example.com")
    goal = body.get("goal", "Verify the page loads")

    plan, browser_result, final_result = await run_test(url, goal)

    return {
        "plan": plan.model_dump(),
        "browser_result": browser_result.model_dump(),
        "result": final_result.model_dump(),
    }
```

---

## Build Order & Testing Strategy

### Build sequentially, test each piece before moving on:

| Order | What | Test | Expected Time |
|-------|------|------|---------------|
| 1 | `models.py` | Import and instantiate each model | 5 min |
| 2 | `services/tinyfish.py` | Call it standalone: `await call_tinyfish("https://example.com", "What is the heading?")` | 10 min |
| 3 | `agents/planner.py` | Run Planner alone: give it a URL + goal, inspect the `TestPlan` output and `tinyfish_goal` | 15 min |
| 4 | **Prompt tuning** | Run Planner 3-5 times with different goals. Tweak system prompt until `tinyfish_goal` output looks right | 20 min |
| 5 | `agents/browser.py` | Run Browser alone: give it a URL + a hand-written TinyFish goal, inspect `BrowserResult` | 15 min |
| 6 | `agents/evaluator.py` | Run Evaluator alone: give it a URL + goal + fake step results, inspect `TestResult` | 10 min |
| 7 | `agents/pipeline.py` + `run_pipeline.py` | Full pipeline end-to-end with `example.com` | 15 min |
| 8 | **Real site testing** | Try the pipeline against a real site (your own app, a public demo app) | 15 min |
| 9 | Wire into `main.py` | Hit `POST /api/tests/{test_id}/run` via the Replit dashboard | 10 min |

**Total estimated: ~2 hours** (including prompt tuning)

### Test Cases to Try

**Simple (should pass easily):**
```bash
python run_pipeline.py "https://example.com" "Verify the page loads and has a heading that says Example Domain"
```

**Medium (form interaction):**
```bash
python run_pipeline.py "https://www.google.com" "Verify the search box is visible and type 'hello world' then verify suggestions appear"
```

**Complex (multi-page flow):**
```bash
python run_pipeline.py "https://demo.realworld.io" "Navigate to the login page, verify the form is visible, and check that the Sign In button exists"
```

---

## Prompt Tuning (The Critical Part)

Step 4 in the build order — **prompt tuning the Planner** — is where you'll spend the most iteration time. This is expected and is the core value of Phase 1.

### What to Look For

1. **Is `tinyfish_goal` well-formatted?** — numbered STEPs, specific actions, JSON output format at the end
2. **Does TinyFish understand the goal?** — take the Planner's `tinyfish_goal` output and paste it directly into a TinyFish call. Does it work?
3. **Are the steps the right granularity?** — too few = TinyFish gets confused. Too many = slow and fragile.
4. **Does the JSON output schema work?** — does TinyFish actually return the structure we asked for?

### Common Adjustments

- If TinyFish ignores the JSON format → make the format request more prominent ("IMPORTANT: You MUST return..." )
- If steps are too vague → add examples to the Planner's system prompt
- If too many steps → lower the cap ("3-4 steps for simple tests, 5-6 for complex")
- If TinyFish fails on complex goals → this is where the workflow fallback kicks in (building-notes.md #3)

---

## Environment Requirements

Make sure these are set before running:

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx    # For Pydantic AI / Claude Haiku
TINYFISH_API_KEY=sk-mino-xxxxx    # For browser automation
```

### Local Dev Setup

```bash
cd housecat
python -m venv venv
venv\Scripts\activate              # Windows
pip install fastapi uvicorn httpx pydantic-ai-slim[anthropic] upstash-redis qstash python-dotenv
```

Create `backend/.env` with the API keys (or export them).

---

## Exit Criteria

- [ ] `python run_pipeline.py "https://example.com" "Verify the page loads and has a heading"` completes successfully
- [ ] Planner produces a well-formatted TinyFish goal with numbered STEPs and JSON output format
- [ ] TinyFish executes the goal and returns structured results
- [ ] Browser Agent parses TinyFish results into step-level pass/fail
- [ ] Evaluator produces a clear pass/fail verdict with details
- [ ] Full pipeline runs in under 60 seconds for a simple test
- [ ] Pipeline handles TinyFish errors gracefully (timeout, API error)
- [ ] At least 3 different test goals work (simple page check, form interaction, multi-element verification)
- [ ] `POST /api/tests/{test_id}/run` triggers the pipeline from the API

---

## Fallback Plan

If the full 3-agent pipeline is too slow (>90s) or the Browser Agent adds overhead without value:

1. **Drop Browser Agent** — have the Planner output the TinyFish goal, call TinyFish directly, pass results to Evaluator. Two agents instead of three.
2. **Drop to two agents** — Planner creates the goal, Evaluator interprets the raw TinyFish result. Simpler, faster.
3. **Single agent + direct TinyFish** — one agent that both creates the goal and evaluates the result. Least impressive for judges but most reliable.

Start with the full pipeline. Simplify only if you hit real issues.

---

## Next: Phase 2 — Test Suite API + Redis Data Model

Once Phase 1 works from CLI, Phase 2 wraps it with CRUD endpoints and Redis persistence.
