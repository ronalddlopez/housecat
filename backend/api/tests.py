from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from backend.models import CreateTestSuite, UpdateTestSuite
from backend.services.test_suite import (
    create_test_suite,
    list_test_suites,
    get_test_suite,
    update_test_suite,
    delete_test_suite,
)

router = APIRouter(prefix="/api/tests", tags=["tests"])


@router.post("")
async def create_test(request: Request):
    try:
        body = await request.json()
        data = CreateTestSuite(**body)
        test = create_test_suite(data.model_dump())
        return test
    except Exception as e:
        return JSONResponse(content={"error": str(e)[:300]}, status_code=400)


@router.get("")
async def list_tests():
    tests = list_test_suites()
    return {"tests": tests, "total": len(tests)}


@router.get("/{test_id}")
async def get_test(test_id: str):
    test = get_test_suite(test_id)
    if not test:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)
    return test


@router.put("/{test_id}")
async def update_test(test_id: str, request: Request):
    try:
        body = await request.json()
        data = UpdateTestSuite(**body)
        test = update_test_suite(test_id, data.model_dump(exclude_unset=True))
        if not test:
            return JSONResponse(content={"error": "Test not found"}, status_code=404)
        return test
    except Exception as e:
        return JSONResponse(content={"error": str(e)[:300]}, status_code=400)


@router.delete("/{test_id}")
async def delete_test(test_id: str):
    deleted = delete_test_suite(test_id)
    if not deleted:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)
    return {"status": "deleted", "id": test_id}


@router.post("/{test_id}/run")
async def run_test_now(test_id: str):
    from backend.agents.pipeline import run_test

    test = get_test_suite(test_id)
    if not test:
        return JSONResponse(content={"error": "Test not found"}, status_code=404)

    try:
        plan, browser_result, final_result = await run_test(test["url"], test["goal"])
        return {
            "plan": plan.model_dump(),
            "browser_result": browser_result.model_dump(),
            "result": final_result.model_dump(),
        }
    except Exception as e:
        return JSONResponse(content={"error": f"Pipeline failed: {str(e)[:300]}"}, status_code=500)
