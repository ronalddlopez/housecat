import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext, UsageLimits
from models import BrowserResult, StepResult, StepExecution
from services.tinyfish import call_tinyfish
from typing import Callable, Awaitable


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


async def execute_step(
    url: str,
    step_number: int,
    description: str,
    tinyfish_goal: str,
    on_streaming_url: Callable[[str], Awaitable[None]] | None = None,
) -> StepExecution:
    """Execute a single step via TinyFish and return a StepExecution with raw data."""
    tinyfish_result = await call_tinyfish(url, tinyfish_goal, on_streaming_url=on_streaming_url)

    tinyfish_data = None
    tinyfish_raw = tinyfish_result.get("raw")
    if tinyfish_raw:
        try:
            tinyfish_data = json.loads(tinyfish_raw) if isinstance(tinyfish_raw, str) else tinyfish_raw
        except (json.JSONDecodeError, TypeError):
            pass

    passed = tinyfish_result.get("success", False)
    details = ""
    error = tinyfish_result.get("error")

    if tinyfish_data:
        raw_details = tinyfish_data.get("verification", "") or tinyfish_data.get("action_performed", "") or tinyfish_data.get("message", "")
        details = ", ".join(raw_details) if isinstance(raw_details, list) else str(raw_details) if raw_details else ""
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
        screenshot=None,
        passed=passed,
        details=details,
        error=error,
    )
