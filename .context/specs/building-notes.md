# HouseCat — Building Notes

Running notes and architectural decisions made during the hackathon build. These capture discussions and insights that inform implementation but don't belong in the formal docs.

---

## 1. TinyFish Is Already an Agent (2026-02-14)

### The Realization

TinyFish is **not a dumb browser API**. It's itself an AI agent. When you call it:

1. You send a URL + a natural language `goal`
2. TinyFish spins up a **real browser** in the cloud
3. **TinyFish's own AI** navigates the page, clicks buttons, fills forms, extracts data
4. It streams progress back via SSE (`STEP` events)
5. It returns structured JSON (`COMPLETE` event with `resultJson`)

TinyFish already handles multi-step flows **in a single API call**:

```
STEP 1: Click "Log In"
STEP 2: Enter email "user@example.com" in the email field
STEP 3: Enter password "password123" in the password field
STEP 4: Click the "Sign In" button
STEP 5: Wait for the dashboard to load
STEP 6: Extract the account balance
```

All 6 steps execute in one call. So the question was: **what does our multi-agent pipeline actually add?**

### Key Constraint: No Persistent Sessions

TinyFish has **no persistent sessions** — each API call starts a fresh browser. Step 2 can't continue where step 1 left off. This makes per-step TinyFish calls awkward for flows like login (you can't log in on call 1 then check the dashboard on call 2).

### Three Approaches Considered

**Option A: Lean into TinyFish's capabilities**
- Planner creates the full goal prompt (formatted as TinyFish STEP instructions)
- **One TinyFish call** executes the entire flow
- Evaluator assesses the result
- Pros: Faster (one TinyFish call vs. many), simpler
- Cons: Less visible agentic behavior, one big black box

**Option B: Our agents control each step individually**
- Planner breaks into steps
- Browser Agent makes **separate TinyFish calls per step** (each with a focused goal)
- Agent evaluates each step result and decides whether to proceed, retry, or adapt
- Pros: Visible multi-step reasoning, real agent decision-making between steps, better error recovery
- Cons: Slower (3-6 TinyFish calls at 10-30s each = 30-180s total), more API credits
- **Problem:** No persistent sessions means this doesn't work for sequential flows

**Option C: Hybrid — best of both (CHOSEN)**
- Planner creates the full TinyFish goal prompt with numbered steps AND expected JSON output format
- **One TinyFish call** runs the whole flow
- TinyFish returns **per-step results** (because we asked for it in the goal prompt)
- If TinyFish reports a step failure, Browser Agent **retries just that step** with a new call
- Evaluator synthesizes everything
- Pros: Fast happy path, real retry/adaptation on failure, still multi-agent
- Cons: Slightly more complex orchestration

---

## 2. The Planner Agent Is a TinyFish Prompt Engineer (2026-02-14)

### The Insight

The Planner Agent's real value isn't "decomposing a goal into steps" — it's **translating a vague human description into a TinyFish-optimized prompt**. The agent needs to understand TinyFish's goal format and capabilities to generate effective instructions.

### What the Planner Needs to Know

1. **Numbered STEP format** — TinyFish follows sequential instructions best
2. **Explicit JSON output schema** — must end with `Return JSON: {...}` and `Return valid JSON only.`
3. **What TinyFish can and can't do** — form filling, clicking, navigation, extraction. No file downloads, no cookies between calls, no CAPTCHA solving.
4. **Verification language** — asking TinyFish to *verify* something and report back, not just act
5. **Failure handling** — include conditional logic like "If the login fails, return {success: false, error: '...'}"

### The Transformation

Human writes:
> "Test the login flow with test credentials"

Planner Agent generates:
```
STEP 1: Navigate to the login page and verify the login form is visible
STEP 2: Enter "test@example.com" in the email field
STEP 3: Enter "password123" in the password field
STEP 4: Click the "Login" or "Sign In" button
STEP 5: Wait for the page to load and verify the dashboard appears
STEP 6: Verify a welcome message or user indicator is visible

If any step fails, stop and report which step failed and why.

Return JSON:
{
  "success": true/false,
  "steps_completed": number,
  "failed_at_step": number or null,
  "observations": ["what happened at each step"],
  "error": "error description if failed" or null
}
Return valid JSON only.
```

### Planner System Prompt

```python
planner_agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestPlan,
    instructions="""You are a QA test planner that generates browser automation instructions
for TinyFish, an AI-powered browser agent.

TinyFish accepts a URL and a "goal" — a natural language instruction describing what to do
in a real browser. It executes the goal and returns structured JSON.

RULES FOR WRITING TINYFISH GOALS:
- Use numbered STEP format: "STEP 1: ...", "STEP 2: ..."
- Be specific about actions: "Click the Login button", not "log in"
- For form fields, specify the value: "Enter 'test@example.com' in the email field"
- Always end with the expected JSON output format
- Always include "Return valid JSON only." at the end
- Include verification steps: "Verify the dashboard page loads and contains a welcome message"
- Include conditional failure handling: "If the login fails, return {success: false, error: '...'}"
- TinyFish sees the page visually (screenshots) — reference visible text, not CSS selectors

WHAT TINYFISH HANDLES WELL:
- Multi-step navigation across pages
- Form filling (text inputs, dropdowns, date pickers)
- Clicking buttons and links
- Waiting for dynamic content (SPAs, AJAX)
- Extracting visible text and data

WHAT TINYFISH CANNOT DO:
- No persistent sessions between calls (each call = fresh browser)
- No file downloads
- No CAPTCHA solving
- Non-deterministic — same goal may produce slightly different results

Given a test URL and a human-written test goal, generate a single TinyFish goal prompt
that executes the full test scenario and returns a structured JSON result with per-step
pass/fail status.""",
)
```

### Why This Matters for Optics

Even though TinyFish runs the full flow in one call, our agent pipeline adds genuine value:

- **Planner Agent** — transforms vague human intent into precise, structured TinyFish instructions (prompt engineering is real work)
- **Browser Agent** — handles retry logic if TinyFish reports a step failure
- **Evaluator Agent** — compares TinyFish's JSON result against the original human goal, generates detailed assessment, sends alerts

The agents aren't just wrapping an API — they're orchestrating, translating, evaluating, and recovering.

---

## 3. Fallback: Workflow-Style Execution (2026-02-14)

### The Idea

If a single TinyFish call with a complex multi-step goal proves unreliable, we can break it into **multiple small, focused TinyFish calls** that together form a workflow.

Instead of one big "test the login flow" test, the user (or Planner) creates a **workflow** of smaller tests:

1. **Test: "Homepage loads"** — verify the page renders with expected elements
2. **Test: "Login form accepts credentials"** — fill form, click submit, check for errors
3. **Test: "Dashboard loads after auth"** — navigate to dashboard URL, verify content

Each one is a standalone TinyFish call with a focused, self-contained goal. No session dependency between calls.

### Why This Works

- **Sidesteps "no persistent sessions"** — each test is independent, not relying on state from a previous call
- **Better for multi-agent optics** — Planner decomposes the goal into multiple tests, Browser Agent runs each as its own TinyFish call, Evaluator synthesizes across the workflow
- **Better error isolation** — if step 2 fails, you know exactly which piece broke
- **More visible agentic behavior** — multiple LLM calls + multiple TinyFish calls with reasoning between each

### Workflow Logic

- If test N fails, remaining tests in the workflow can be skipped (fail-fast)
- Or continue all tests and report which ones passed/failed (full report)
- The Evaluator decides the overall workflow pass/fail based on all results

### When to Use This vs. Single-Call

| Scenario | Approach |
|----------|----------|
| Simple verification ("page loads, has heading") | Single TinyFish call |
| Multi-step flow on same page (fill form, submit) | Single TinyFish call with STEP instructions |
| Multi-page flow (login → dashboard → settings) | Workflow of independent tests |
| Complex flow that's failing as a single call | Break into workflow as fallback |
