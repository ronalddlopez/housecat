import json
from pydantic_ai import Agent, UsageLimits
from backend.models import TestResult

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
