import asyncio
import sys
import json


async def main():
    if len(sys.argv) < 3:
        print("Usage: python -m backend.run_pipeline <url> <goal>")
        print('Example: python -m backend.run_pipeline "https://example.com" "Verify the page has a heading"')
        sys.exit(1)

    url = sys.argv[1]
    goal = sys.argv[2]

    from agents.pipeline import run_test
    _plan, _browser_result, final_result, _screenshots = await run_test(url, goal)

    print("\n" + "=" * 60)
    print("FULL RESULT:")
    print(json.dumps(final_result.model_dump(), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
