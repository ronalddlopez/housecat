import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext, UsageLimits
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
    result = await call_tinyfish(url, goal)
    return json.dumps(result)


async def execute_test(url: str, tinyfish_goal: str) -> BrowserResult:
    deps = BrowserDeps(url=url, tinyfish_goal=tinyfish_goal)
    result = await browser_agent.run(
        f"Execute this test:\nURL: {url}\nGoal:\n{tinyfish_goal}",
        deps=deps,
        usage_limits=UsageLimits(request_limit=4),
    )
    return result.output
