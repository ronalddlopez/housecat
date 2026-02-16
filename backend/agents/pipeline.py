import json
import time
from models import TestPlan, BrowserResult, StepResult, StepExecution, TestResult
from agents.planner import create_plan
from agents.evaluator import evaluate_test
from services.tinyfish import call_tinyfish
from services.result_store import log_event
from services.config import get_redis
from services.variable_resolver import resolve_variables


async def run_test(url: str, goal: str, test_id: str | None = None) -> tuple[TestPlan, BrowserResult, TestResult]:
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

    # Resolve variables: planner gets real values, evaluator gets {{placeholders}}
    original_goal = goal
    if test_id:
        try:
            test_data = get_redis().hgetall(f"test:{test_id}")
            raw_vars = test_data.get("variables", "[]")
            variables = json.loads(raw_vars) if isinstance(raw_vars, str) else raw_vars
            if variables:
                goal = resolve_variables(goal, variables)
                print(f"[Pipeline] Resolved {len(variables)} variables in goal")
        except Exception as e:
            print(f"[Pipeline] Variable resolution failed: {e}")

    try:
        _log("plan_start", f"Planning test for {url}")
        print(f"[Planner] Creating test plan for: {goal}")
        plan = await create_plan(url, goal)
        print(f"[Planner] {plan.total_steps} steps planned")
        steps_json = json.dumps([{"step_number": s.step_number, "description": s.description} for s in plan.steps])
        _log("plan_complete", f"Plan created: {plan.total_steps} steps", steps=steps_json)

        # Execute ALL steps in a single continuous TinyFish session
        _log("browser_start", "Executing test with TinyFish")
        print(f"[Browser] Executing all {plan.total_steps} steps in one session...")

        async def _on_streaming_url(streaming_url: str):
            _log("browser_preview", "Live browser preview available", streaming_url=streaming_url)

        tinyfish_result = await call_tinyfish(
            url=url,
            goal=plan.tinyfish_goal,
            on_streaming_url=_on_streaming_url,
        )

        streaming_url = tinyfish_result.get("streaming_url")

        # Parse the combined result and build per-step data
        tinyfish_data = None
        tinyfish_raw = tinyfish_result.get("raw")
        if tinyfish_raw:
            try:
                tinyfish_data = json.loads(tinyfish_raw) if isinstance(tinyfish_raw, str) else tinyfish_raw
            except (json.JSONDecodeError, TypeError):
                pass

        overall_success = tinyfish_result.get("success", False)
        error = tinyfish_result.get("error")

        # Build step results from the plan steps + TinyFish result
        step_executions: list[StepExecution] = []
        step_results: list[StepResult] = []

        # Try to extract per-step results from TinyFish data
        per_step_data = {}
        if tinyfish_data:
            # TinyFish may return step_results or similar per-step breakdown
            if isinstance(tinyfish_data, dict):
                for key in ("step_results", "steps", "results"):
                    if isinstance(tinyfish_data.get(key), list):
                        for i, item in enumerate(tinyfish_data[key]):
                            per_step_data[i + 1] = item
                        break

        for step in plan.steps:
            step_num = step.step_number
            step_data = per_step_data.get(step_num)

            if step_data and isinstance(step_data, dict):
                passed = step_data.get("success", overall_success)
                raw_details = step_data.get("verification", "") or step_data.get("action_performed", "") or step_data.get("message", "")
                details = ", ".join(raw_details) if isinstance(raw_details, list) else str(raw_details) if raw_details else ""
            elif error:
                passed = False
                details = error
            else:
                passed = overall_success
                details = "Step executed as part of combined run"

            execution = StepExecution(
                step_number=step_num,
                description=step.description,
                tinyfish_goal=step.tinyfish_goal,
                tinyfish_raw=tinyfish_raw if isinstance(tinyfish_raw, str) else json.dumps(tinyfish_raw) if tinyfish_raw else None,
                tinyfish_data=step_data if step_data else tinyfish_data,
                streaming_url=streaming_url,
                passed=passed,
                details=details,
                error=error if not passed else None,
            )
            step_executions.append(execution)

            sr = StepResult(
                step_number=step_num,
                passed=passed,
                details=details,
            )
            step_results.append(sr)

            status_char = "+" if passed else "x"
            print(f"[Browser] Step {step_num}: {status_char} {details[:80]}")
            _log("step_complete", f"Step {step_num}: {'passed' if passed else 'failed'} — {details[:120]}", step_number=step_num, passed=passed)

        _log("browser_complete", f"Browser execution finished: {len(step_executions)} steps")

        browser_result = BrowserResult(
            success=overall_success,
            step_results=step_results,
            step_executions=[se.model_dump() for se in step_executions] if step_executions else [],
            raw_result=tinyfish_raw if isinstance(tinyfish_raw, str) else json.dumps(tinyfish_raw) if tinyfish_raw else None,
            streaming_url=streaming_url,
        )

        _log("eval_start", "Evaluating results")
        print("[Evaluator] Synthesizing results...")
        final_result = await evaluate_test(
            url=url,
            goal=original_goal,
            browser_result=browser_result.model_dump(),
            step_results=[sr.model_dump() for sr in step_results],
        )

        final_result.duration_ms = int((time.time() - start) * 1000)

        status = "PASSED" if final_result.passed else "FAILED"
        print(f"[Result] {status} -- {final_result.steps_passed}/{final_result.steps_total} steps in {final_result.duration_ms}ms")
        print(f"[Result] {final_result.details}")
        _log("eval_complete", f"Test {status} — {final_result.steps_passed}/{final_result.steps_total} steps", passed=final_result.passed)

        return plan, browser_result, final_result

    except Exception as e:
        _log("error", f"Pipeline error: {str(e)}")
        raise
