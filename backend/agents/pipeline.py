import json
import time
from models import TestPlan, BrowserResult, TestResult
from agents.planner import create_plan
from agents.browser import execute_test
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
        _log("plan_start", f"Planning test for {url}")
        print(f"[Planner] Creating test plan for: {goal}")
        plan = await create_plan(url, goal)
        print(f"[Planner] {plan.total_steps} steps planned")
        steps_json = json.dumps([{"step_number": s.step_number, "description": s.description} for s in plan.steps])
        _log("plan_complete", f"Plan created: {plan.total_steps} steps", steps=steps_json)

        screenshots = []
        try:
            before_ss = await capture_before_after(url, plan.total_steps, phase="before")
            if before_ss:
                screenshots.append(before_ss)
                if test_id:
                    _log("screenshot_captured", "Captured initial page state screenshot")
        except Exception:
            pass

        _log("browser_start", "Executing test with TinyFish")
        print(f"[Browser] Executing test with TinyFish...")
        browser_result = await execute_test(url, plan.tinyfish_goal)

        if browser_result.streaming_url:
            _log("browser_preview", "Browser preview available", streaming_url=browser_result.streaming_url)

        for sr in browser_result.step_results:
            status = "+" if sr.passed else "x"
            print(f"[Browser] Step {sr.step_number}: {status} {sr.details[:80]}")
            _log("step_complete", f"Step {sr.step_number}: {'passed' if sr.passed else 'failed'} — {sr.details[:120]}", step_number=sr.step_number, passed=sr.passed)

        _log("browser_complete", f"Browser execution finished: {len(browser_result.step_results)} steps")

        try:
            after_ss = await capture_before_after(url, plan.total_steps, phase="after")
            if after_ss:
                screenshots.append(after_ss)
                if test_id:
                    _log("screenshot_captured", f"Captured {len(screenshots)} screenshot(s) total")
        except Exception:
            pass

        _log("eval_start", "Evaluating results")
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
        _log("eval_complete", f"Test {status} — {final_result.steps_passed}/{final_result.steps_total} steps", passed=final_result.passed)

        return plan, browser_result, final_result, screenshots

    except Exception as e:
        _log("error", f"Pipeline error: {str(e)}")
        raise
