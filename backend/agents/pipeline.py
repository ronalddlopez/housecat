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
                _log("screenshot_captured", "Captured initial page state screenshot")
        except Exception:
            pass

        _log("browser_start", "Executing test with TinyFish")
        print(f"[Browser] Executing {plan.total_steps} steps individually...")

        step_executions: list[StepExecution] = []
        step_results: list[StepResult] = []

        for step in plan.steps:
            step_num = step.step_number
            _log("step_start", f"Step {step_num}: {step.description}", step_number=step_num)
            print(f"[Browser] Step {step_num}/{plan.total_steps}: {step.description}")

            try:
                execution = await execute_step(
                    url=url,
                    step_number=step_num,
                    description=step.description,
                    tinyfish_goal=step.tinyfish_goal,
                )

                if execution.streaming_url:
                    _log("browser_preview", f"Step {step_num} preview available", streaming_url=execution.streaming_url)

                try:
                    ss = await capture_before_after(url, plan.total_steps, phase="after")
                    if ss:
                        ss["step_number"] = step_num
                        ss["label"] = f"After step {step_num} — page baseline"
                        execution.screenshot = ss
                        screenshots.append(ss)
                        _log("screenshot_captured", f"Screenshot captured for step {step_num}")
                except Exception:
                    pass

                step_executions.append(execution)

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
