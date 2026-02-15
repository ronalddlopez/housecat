# Pydantic AI Framework — Deep Research

## 1. What is Pydantic AI

A Python agent framework for building production-grade AI applications. Describes itself as bringing "that FastAPI feeling to GenAI app and agent development."

- **Built by**: The Pydantic team (same org behind Pydantic validation used by OpenAI SDK, Anthropic SDK, LangChain, etc.)
- **GitHub**: [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) — 14.9k stars
- **Latest version**: v1.58.0 (Feb 11, 2026)
- **Maturity**: V1 stable (released September 2025). No intentional breaking changes in V1 minor releases.
- **License**: MIT

---

## 2. Does It Work with Anthropic API Keys?

**Yes. Claude is a first-class provider.**

```bash
pip install "pydantic-ai-slim[anthropic]"
```

```bash
# Set your existing API key
export ANTHROPIC_API_KEY='sk-ant-...'
```

```python
from pydantic_ai import Agent

# That's it — uses your ANTHROPIC_API_KEY automatically
agent = Agent('anthropic:claude-haiku-4-5-20251001')
result = agent.run_sync('Hello!')
```

Or pass the key explicitly:

```python
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.providers.anthropic import AnthropicProvider

model = AnthropicModel(
    'claude-haiku-4-5-20251001',
    provider=AnthropicProvider(api_key='sk-ant-...')
)
agent = Agent(model)
```

---

## 3. Core Concepts

### Agent — The Orchestrator

```python
from pydantic_ai import Agent

agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    instructions='You are a QA testing agent.',
)

result = agent.run_sync('Check if example.com loads')
print(result.output)
```

### Tools — Functions the LLM Can Call

Two types:

**`@agent.tool_plain`** — simple, no context needed:

```python
@agent.tool_plain
async def browse(url: str, goal: str) -> str:
    """Navigate to URL in a real browser and perform the goal."""
    result = await call_tinyfish(url, goal)
    return json.dumps(result)
```

**`@agent.tool`** — has access to dependencies (Redis, config, etc.):

```python
@agent.tool
async def store_result(ctx: RunContext[AgentDeps], key: str, value: str) -> str:
    """Store a value in Redis."""
    ctx.deps.redis.set(key, value)
    return "Stored"
```

Tool descriptions are auto-generated from **docstrings**. Parameter schemas are auto-generated from **type hints**. No manual JSON schema definition needed.

### Dependencies — Inject Context into Tools

```python
from dataclasses import dataclass

@dataclass
class AgentDeps:
    redis: Redis
    http_client: httpx.AsyncClient
    test_id: str

agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    deps_type=AgentDeps,
)

@agent.tool
async def get_previous_result(ctx: RunContext[AgentDeps]) -> str:
    """Get the previous test result for comparison."""
    result = ctx.deps.redis.hgetall(f"results:{ctx.deps.test_id}")
    return json.dumps(result)

# Pass deps at runtime
result = await agent.run('Run the test', deps=AgentDeps(
    redis=redis_client,
    http_client=httpx.AsyncClient(),
    test_id="abc123",
))
```

### Structured Output — Return Typed Pydantic Models

```python
from pydantic import BaseModel, Field

class TestResult(BaseModel):
    passed: bool
    duration_ms: int
    details: str = Field(description='Human-readable test summary')
    error: str | None = Field(default=None, description='Error message if failed')

agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    output_type=TestResult,
    instructions='You are a QA testing agent...',
)

result = await agent.run(f'Test URL: {url}, Goal: {goal}')
print(result.output.passed)        # True
print(result.output.duration_ms)   # 3200
print(result.output.details)       # "Dashboard loaded successfully"
```

If the LLM returns invalid data, Pydantic AI **automatically retries** by sending the validation error back to the model.

---

## 4. The Tool-Use Loop

Pydantic AI handles the entire loop internally:

1. Model receives tool schemas + user prompt
2. Model decides which tool(s) to call
3. Framework validates arguments against tool's type hints
4. Framework executes the tool function
5. Result sent back to model
6. Repeat until model produces final output (no more tool calls)

**You don't write the loop.** You define tools, call `agent.run()`, and get the result.

### Controlling the Loop

```python
from pydantic_ai import UsageLimits

result = await agent.run(
    'Run the test',
    usage_limits=UsageLimits(
        request_limit=5,          # Max LLM calls (prevents infinite loops)
        tool_calls_limit=10,      # Max total tool invocations
    )
)
```

### Retry on Tool Failure

```python
from pydantic_ai import ModelRetry

@agent.tool_plain(retries=3)
async def browse(url: str, goal: str) -> str:
    """Navigate to URL in a real browser."""
    try:
        result = await call_tinyfish(url, goal)
        return json.dumps(result)
    except TinyFishError as e:
        raise ModelRetry(f'Browser automation failed: {e}. Try a simpler goal.')
```

When `ModelRetry` is raised, the error message is sent back to the model so it can adjust its approach.

---

## 5. Streaming — For Live Execution View

### Stream Events (Best for SSE)

```python
async for event in agent.run_stream_events(f'Test: {url}, Goal: {goal}'):
    # Event types: PartStartEvent, PartDeltaEvent,
    # FunctionToolCallEvent, FunctionToolResultEvent, etc.
    print(event)
```

### FastAPI SSE Endpoint

```python
@app.post('/api/tests/{test_id}/run-stream')
async def run_test_stream(test_id: str):
    test = redis.hgetall(f"test:{test_id}")

    async def event_generator():
        async for event in agent.run_stream_events(
            f'Test URL: {test["url"]}, Goal: {test["goal"]}'
        ):
            yield f"data: {event.model_dump_json()}\n\n"

    return StreamingResponse(event_generator(), media_type='text/event-stream')
```

### Built-in Vercel AI Adapter (optional)

```python
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

@app.post('/chat')
async def chat(request: Request) -> Response:
    return await VercelAIAdapter.dispatch_request(request, agent=agent)
```

---

## 6. Async Support

Fully async-native. Works perfectly with FastAPI.

```python
# Async (preferred with FastAPI)
result = await agent.run('Hello!')

# Sync convenience wrapper (for scripts/testing)
result = agent.run_sync('Hello!')
```

Both sync and async tools are supported. Sync tools are automatically run in a thread pool.

---

## 7. What Pydantic AI Gives You vs Raw Anthropic SDK

| Feature | Raw Anthropic SDK | Pydantic AI |
|---------|-------------------|-------------|
| Tool schema definition | Manual JSON schema dicts | Auto from type hints + docstrings |
| Tool-use loop | You write the while loop (~50 lines) | Automatic — just call `run()` |
| Argument validation | Manual JSON parsing | Automatic Pydantic validation |
| Structured output | Manual JSON parsing/prompting | `output_type=MyModel` with auto-retry |
| Retry on bad output | Manual error handling | Automatic — validation errors sent back to model |
| Dependency injection | Pass via closures or globals | Type-safe `RunContext[T]` |
| Streaming | Manual SSE parsing | `run_stream_events()` + built-in SSE adapters |
| Type safety | Raw dicts | Full IDE autocomplete |
| Boilerplate | ~50-100 lines | ~10-20 lines |

---

## 8. How HouseCat Would Use It

```python
from dataclasses import dataclass
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext, UsageLimits
from upstash_redis import Redis
import httpx

# --- Dependencies ---

@dataclass
class HouseCatDeps:
    redis: Redis
    test_id: str
    alert_webhook: str | None

# --- Structured Output ---

class TestResult(BaseModel):
    passed: bool
    duration_ms: int
    details: str = Field(description='What happened during the test')
    error: str | None = Field(default=None, description='Error details if failed')

# --- Agent ---

agent = Agent(
    'anthropic:claude-haiku-4-5-20251001',
    deps_type=HouseCatDeps,
    output_type=TestResult,
    instructions="""You are a QA testing agent. You receive test scenarios in natural language
and execute them using your tools. Browse the URL, perform the described actions,
and assess whether the test passed or failed.""",
)

# --- Tools ---

@agent.tool_plain
async def browse(url: str, goal: str) -> str:
    """Navigate to a URL in a real browser and perform actions described in the goal.

    Args:
        url: The URL to navigate to
        goal: What to do on the page (e.g., "click login, enter credentials, verify dashboard loads")
    """
    result = await call_tinyfish(url, goal)
    return json.dumps(result)

@agent.tool_plain
async def http_request(url: str, method: str = "GET", body: str = "") -> str:
    """Make an HTTP request. Used for API health checks and sending alert webhooks.

    Args:
        url: The URL to request
        method: HTTP method (GET, POST, PUT, DELETE)
        body: Optional JSON body for POST/PUT
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.request(method, url, content=body)
        return json.dumps({"status_code": response.status_code, "body": response.text[:1000]})

# --- Run It ---

async def run_test(test_url: str, test_goal: str, deps: HouseCatDeps) -> TestResult:
    result = await agent.run(
        f'Test URL: {test_url}\nGoal: {test_goal}',
        deps=deps,
        usage_limits=UsageLimits(request_limit=5),
    )
    return result.output  # ← This is a validated TestResult Pydantic model
```

---

## 9. Installation

```bash
pip install "pydantic-ai-slim[anthropic]"
```

Environment variable:
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

That's it. No other setup needed.

---

## 10. Gotchas

1. **Token limit truncation** — if `max_tokens` is too low, Anthropic may truncate tool call arguments (missing closing braces). Set adequate `max_tokens`.
2. **`run_stream()` stops at first output match** — use `run_stream_events()` for full execution visibility.
3. **Rapid release cadence** — at v1.58 in ~5 months. Pin your version.
4. **Sync tools run in thread pool** — fine usually, but be aware of thread-safety with shared mutable state.
5. **Observability** — built-in tracing is coupled to Pydantic Logfire (commercial). Standard OpenTelemetry also works.

---

## Sources

- [Pydantic AI Official Docs](https://ai.pydantic.dev/)
- [Pydantic AI GitHub](https://github.com/pydantic/pydantic-ai)
- [Pydantic AI on PyPI](https://pypi.org/project/pydantic-ai/)
- [Anthropic Model Config](https://ai.pydantic.dev/models/anthropic/)
- [Tools Documentation](https://ai.pydantic.dev/tools/)
- [Dependencies Documentation](https://ai.pydantic.dev/dependencies/)
- [Output Documentation](https://ai.pydantic.dev/output/)
- [Streaming/UI Documentation](https://ai.pydantic.dev/ui/overview/)
