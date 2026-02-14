import time
from backend.models import TestPlan, BrowserResult, TestResult
from backend.agents.planner import create_plan
from backend.agents.browser import execute_test
from backend.agents.evaluator import evaluate_test


async def run_test(url: str, goal: str) -> tuple[TestPlan, BrowserResult, TestResult]:
    start = time.time()

    print(f"[Planner] Creating test plan for: {goal}")
    plan = await create_plan(url, goal)
    print(f"[Planner] {plan.total_steps} steps planned")

    print(f"[Browser] Executing test with TinyFish...")
    browser_result = await execute_test(url, plan.tinyfish_goal)

    for sr in browser_result.step_results:
        status = "+" if sr.passed else "x"
        print(f"[Browser] Step {sr.step_number}: {status} {sr.details[:80]}")

    print(f"[Evaluator] Synthesizing results...")
    final_result = await evaluate_test(
        url=url,
        goal=goal,
        browser_result=browser_result.model_dump(),
        step_results=[sr.model_dump() for sr in browser_result.step_results],
    )

    final_result.duration_ms = int((time.time() - start) * 1000)

    status = "PASSED" if final_result.passed else "FAILED"
    print(f"[Result] {status} -- {final_result.steps_passed}/{final_result.steps_total} steps in {final_result.duration_ms}ms")
    print(f"[Result] {final_result.details}")

    return plan, browser_result, final_result
