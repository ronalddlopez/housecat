# TinyFish (formerly Mino) Browser Automation API -- Deep Research

---

## 1. What is TinyFish

**TinyFish** is a web agents API that turns any website into a programmable data source. Instead of managing headless browsers, CSS selectors, proxies, and edge cases yourself, you make a single HTTP API call with a target URL and a natural language goal, and get back structured JSON data.

### How It Works

You send a POST request with a URL and a plain-English description of what you want done (the "goal"). TinyFish spins up a real browser session, uses AI to navigate the page, interact with elements, fill forms, click buttons, and extract data -- then returns the results as JSON. The entire session streams progress back to you via Server-Sent Events (SSE), including a live browser preview URL.

### How It Differs from Playwright/Selenium

| Feature | Playwright/Selenium | TinyFish |
|---------|-------------------|----------|
| Selectors | CSS/XPath you write and maintain | Natural language -- no selectors needed |
| Breakage | Brittle -- breaks when DOM changes | AI-driven -- adapts to page changes |
| Anti-bot | You manage stealth, fingerprinting, proxies | Built-in stealth profiles + rotating proxies |
| Infrastructure | You host browsers, manage scaling | Fully managed cloud browsers |
| Multi-step flows | Coded step by step | Described in plain English |
| Output | Raw DOM data you parse | Structured JSON in the shape you specify |
| Setup | Install browser binaries, drivers | Single HTTP API call |

### Who Built It

TinyFish was founded by **Sudheesh Nair** (former President of Nutanix), **Shuhao Zhang** (former Engineering Leader at Meta), and **Keith Zhai** (former senior correspondent at The Wall Street Journal). The company launched with **$47 million in funding** led by ICONIQ, with participation from USVP, Mango Capital, MongoDB Ventures, ASG, and Sandberg Bernthal Venture Partners. TinyFish reports running **30M+ operations monthly** in production for enterprises including Google Hotels, DoorDash, and ClassPass.

TinyFish also builds **AgentQL**, an open-source query language and Playwright integration for structured web data extraction (separate product from the Mino/TinyFish web agent API).

> **Note:** TinyFish was formerly called "Mino" -- the API key prefix is still `sk-mino-` and many code references use "Mino" naming. The API endpoint has migrated from `mino.ai` to `agent.tinyfish.ai`.

---

## 2. API Endpoint and Authentication

### Endpoint

```
POST https://agent.tinyfish.ai/v1/automation/run-sse
```

> **Important:** The old endpoint `https://mino.ai/v1/automation/run-sse` is deprecated. Always use `agent.tinyfish.ai`.

### Headers

```
X-API-Key: sk-mino-xxxxx
Content-Type: application/json
```

### API Key

- Format: `sk-mino-` prefix followed by a random string
- Obtain from: https://tinyfish.ai (sign up, no credit card required for free tier)
- Legacy dashboard: https://mino.ai/api-keys
- Environment variable convention: `TINYFISH_API_KEY` (formerly `MINO_API_KEY`)

### curl Example

```bash
curl -N -X POST https://agent.tinyfish.ai/v1/automation/run-sse \
  -H "X-API-Key: $TINYFISH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://amazon.com",
    "goal": "Find me the price of airpods pro 3",
    "proxy_config": { "enabled": false }
  }'
```

The `-N` flag disables output buffering, which is important for SSE streaming.

---

## 3. Request Body

```json
{
  "url": "https://example.com",
  "goal": "Extract all product names and prices. Return as JSON array.",
  "browser_profile": "lite",
  "proxy_config": {
    "enabled": true,
    "country_code": "US"
  },
  "timeout": 120000
}
```

### Parameter Reference

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | `string` | Yes | -- | Target URL to navigate to and automate |
| `goal` | `string` | Yes | -- | Natural language instructions describing what to do and what to return |
| `browser_profile` | `"lite" \| "stealth"` | No | `"lite"` | Browser fingerprint profile (see Section 7) |
| `proxy_config` | `object` | No | `{ enabled: false }` | Proxy configuration (see Section 8) |
| `proxy_config.enabled` | `boolean` | Yes (if proxy_config present) | `false` | Whether to route through rotating proxies |
| `proxy_config.country_code` | `string` | No | -- | Geo-target country for the proxy exit node |
| `timeout` | `number` | No | -- | Maximum execution time in milliseconds |

### Valid Country Codes for Proxy

`"US"`, `"GB"`, `"CA"`, `"DE"`, `"FR"`, `"JP"`, `"AU"`

---

## 4. SSE Response Format

The API returns a `text/event-stream` response. Each event is a line prefixed with `data: ` followed by a JSON object.

### Event Types

#### STREAMING_URL -- Live Browser Preview

Sent early in the stream. Provides a URL to watch the browser session in real time.

```
data: {"type":"STREAMING_URL","streamingUrl":"https://stream.tinyfish.ai/session/abc123"}
```

Fields:
- `type`: `"STREAMING_URL"`
- `streamingUrl`: URL to the live browser preview

#### STEP -- Progress Update

Sent multiple times during execution. Describes what the agent is currently doing.

```
data: {"type":"STEP","message":"Navigating to pricing page...","purpose":"Find pricing information","action":"click","step":"2"}
```

Fields:
- `type`: `"STEP"`
- `message`: Human-readable description of current action (optional)
- `purpose`: Why the step is being performed (optional)
- `action`: What action is being taken (optional)
- `step`: Step number or identifier (optional)
- `description`: Alternative description field (optional)
- `timestamp`: Unix timestamp (optional)

**Note:** Not all fields are present on every STEP event. Use a fallback chain: `purpose || action || message || step || description || "Processing..."`.

#### COMPLETE -- Successful Completion

Sent once when the task finishes successfully.

```
data: {"type":"COMPLETE","status":"COMPLETED","resultJson":{"tiers":[{"name":"Free","price":"$0"},{"name":"Pro","price":"$29/mo"}]}}
```

Fields:
- `type`: `"COMPLETE"`
- `status`: `"COMPLETED"`
- `resultJson`: The structured data result (shape depends on your goal prompt)

#### ERROR -- Failure

Sent when the automation fails.

```
data: {"type":"ERROR","status":"FAILED","message":"Navigation timeout: page did not load within 30s"}
```

Fields:
- `type`: `"ERROR"`
- `status`: `"FAILED"`
- `message`: Error description

**Important:** Check for errors using BOTH `event.type === "ERROR"` and `event.status === "FAILED"` -- some error events may use one or the other.

#### HEARTBEAT / PING -- Keep-Alive

System keep-alive events sent periodically to prevent connection timeout.

```
data: {"type":"HEARTBEAT"}
data: {"type":"PING"}
```

These should be silently ignored. Other system event types that may appear: `"STARTED"`, `"CONNECTED"`, `"INIT"`.

### System Events to Filter Out

When displaying progress to users, filter out these system event types:
`STARTED`, `STREAMING_URL`, `HEARTBEAT`, `PING`, `CONNECTED`, `INIT`

---

## 5. Streaming URL / Live Browser Preview

### What Is It

The `streamingUrl` returned in the `STREAMING_URL` event is a URL pointing to a real-time video/interactive feed of the browser session as it executes your task. You can watch the AI agent navigate pages, click buttons, fill forms, and extract data in real time.

### Format

```
https://stream.tinyfish.ai/session/<session-id>
```

### Usage

- **Debugging:** Open in a browser tab to watch what the agent is doing
- **Embedding:** The cookbook recipes embed it in iframes for live preview UIs:
  ```html
  <iframe src={streamingUrl} className="w-full h-full" />
  ```
- **Duration:** Active only while the automation session is running. Once the COMPLETE or ERROR event fires, the stream becomes inactive.
- **Availability:** Not every request necessarily returns a streaming URL (though in practice most do). Always check for its presence before using it.

### In the Cookbook

Several recipes display the streaming URL as a live preview panel next to the results, giving users visual feedback of the automation in progress.

---

## 6. Goal Prompt Engineering

The `goal` parameter is the most important part of a TinyFish request. It is a natural language instruction that tells the AI agent what to do and what to return.

### Best Practices

1. **Be specific about the output format.** Always tell the agent exactly what JSON shape you want back.
2. **Use numbered steps for multi-step flows.** The agent follows sequential instructions well.
3. **Include conditional logic.** Tell the agent what to do if something is not found.
4. **Specify the return format explicitly.** End with "Return JSON:" followed by the expected schema.
5. **Add "Return valid JSON only."** at the end to prevent narrative text in results.

### Example Goals by Use Case

#### Simple Data Extraction

```
Extract all product names and prices from this page.
Return as JSON array: [{"name": "...", "price": "..."}]
Return valid JSON only.
```

#### Multi-Step Navigation

```
STEP 1: Navigate to the pricing page
STEP 2: Extract all pricing tiers including name, price, and feature list
STEP 3: Return JSON with format:
{
  "tiers": [
    { "name": "...", "price": "...", "features": ["..."] }
  ]
}
Return valid JSON only.
```

#### Form Filling and Search

```
Fill in the search form with:
- Location: "San Francisco"
- Check-in: "2026-03-01"
- Check-out: "2026-03-05"
Click search and extract the first 10 hotel results with name, price per night, and rating.
Return JSON: {"hotels": [{"name": "...", "price": "...", "rating": "..."}]}
```

#### Conditional Logic

```
Search for "wireless headphones" on this website.
If results are found, extract the top 5 results with title, price, and URL.
If no results, return { "found": false, "reason": "..." }.
Return valid JSON only.
```

#### QA Testing / Verification

```
Execute the following test steps in order:

1. Click the "Sign Up" button
2. Fill in email with "test@example.com"
3. Fill in password with "SecurePass123"
4. Click "Create Account"
5. Verify the confirmation message appears

After completing all steps, return:
{
  "success": true/false,
  "stepsCompleted": number,
  "failedAtStep": number or null,
  "error": "error message if failed" or null,
  "observations": ["list of what happened"]
}
```

#### Content Extraction (Documentation)

```
Extract technical documentation content from this page.
Extract:
1. Main concepts and explanations
2. API methods, parameters, return types
3. Code examples and usage patterns
4. Important notes, warnings, or tips

Return JSON:
{
  "title": "Page title",
  "content": "Full extracted content in markdown format",
  "codeExamples": ["code snippet 1", "code snippet 2"],
  "keyPoints": ["important point 1", "important point 2"]
}
Return valid JSON only.
```

### What TinyFish Handles Well

- Multi-step navigation across pages
- Form filling (text inputs, dropdowns, date pickers, checkboxes)
- Clicking buttons and links
- Waiting for dynamic content to load (JavaScript-heavy SPAs)
- Calendar/date picker interactions
- Search with filters
- Extracting tabular data
- Handling pagination (to a degree -- best to specify "first N results")
- Cookie consent banners and popups

---

## 7. Browser Profiles

### "lite" (Default)

- Faster execution
- Standard browser fingerprint
- Suitable for most websites that do not have aggressive anti-bot protections
- Lower resource usage, quicker startup
- **Use when:** Scraping public pages, documentation sites, blogs, news sites, simple forms

### "stealth"

- Full anti-detection fingerprinting
- Mimics real human browser characteristics (screen resolution, WebGL, Canvas, fonts, etc.)
- Rotating user agents and fingerprints
- Bypasses common anti-bot systems (Cloudflare, DataDome, PerimeterX, etc.)
- Slower due to additional setup
- **Use when:** Accessing sites with bot protection, e-commerce sites (Amazon, etc.), login-protected sites, any site that blocks scrapers

### Recommendation

Start with `"lite"`. If you get blocked or see empty/error results, switch to `"stealth"`. The cookbook recipes default to `"lite"` with a UI toggle for stealth.

---

## 8. Proxy Configuration

### How Proxies Work

TinyFish provides built-in rotating residential proxies at **no extra charge**. When enabled, requests are routed through proxy servers in the specified country, making the browser appear to be a real user from that location.

### Configuration

```json
{
  "proxy_config": {
    "enabled": true,
    "country_code": "US"
  }
}
```

### Available Country Codes

| Code | Country |
|------|---------|
| `US` | United States |
| `GB` | United Kingdom |
| `CA` | Canada |
| `DE` | Germany |
| `FR` | France |
| `JP` | Japan |
| `AU` | Australia |

### When to Use Proxies

- **Geo-restricted content:** Accessing country-specific pricing, content, or features
- **Anti-bot bypass:** Some sites block requests from data center IPs
- **Rate limit avoidance:** Rotating IPs help distribute requests
- **Regional testing:** Verify how a site appears in different countries

### When to Skip Proxies

- Public APIs or documentation sites (unnecessary overhead)
- When speed is critical (proxies add latency)
- When `browser_profile: "lite"` works fine without proxies

---

## 9. Timeout and Performance

### Typical Request Duration

- **Simple extraction** (single page, no navigation): 10-30 seconds
- **Multi-step flow** (navigation, form filling, extraction): 30-90 seconds
- **Complex flows** (multi-page navigation, heavy JS sites): 60-180 seconds

### Timeout Parameter

- Set via `timeout` field in the request body (in milliseconds)
- If not specified, TinyFish uses a server-side default (exact value not publicly documented, but appears to be around 120-180 seconds based on cookbook patterns)
- If the task exceeds the timeout, you will receive an ERROR event

### What Affects Speed

1. **Browser profile:** `"lite"` is faster than `"stealth"`
2. **Proxy usage:** Adds latency from routing through proxy servers
3. **Target site complexity:** Heavy JavaScript sites take longer to render
4. **Number of steps:** More navigation steps = more time
5. **Dynamic content:** Waiting for AJAX/fetch calls to complete
6. **Anti-bot challenges:** CAPTCHAs and challenges add time (stealth mode may handle some)

### Performance Tips

- Use `"lite"` profile unless you need stealth
- Disable proxies unless needed for geo-targeting or anti-bot bypass
- Keep goals focused -- extract from one page rather than navigating across many
- Use `asyncio.gather()` for parallel scraping of multiple URLs rather than sequential
- Set reasonable timeouts to fail fast rather than waiting for default timeout

---

## 10. Error Handling

### Error Types

| Error | Cause | Handling |
|-------|-------|----------|
| HTTP 401/403 | Invalid or missing API key | Check `X-API-Key` header |
| HTTP 429 | Rate limit exceeded | Implement exponential backoff |
| HTTP 500 | Server error | Retry with backoff |
| SSE `ERROR` event | Automation failed | Parse `message` field for details |
| SSE `FAILED` status | Task could not complete | Check if site is accessible |
| Stream ends without COMPLETE | Unexpected disconnect | Treat as failure, retry |
| Network timeout | Connection dropped | Implement client-side timeout |
| JSON parse error | Malformed SSE data | Skip the line, continue reading |

### Common Error Scenarios

1. **Navigation timeout:** Page did not load. Site may be down or blocking.
2. **Element not found:** The agent could not find a target element. Goal may need refinement.
3. **Anti-bot block:** Site detected automation. Switch to `"stealth"` profile with proxy.
4. **Rate limit:** Too many concurrent requests. Implement concurrency controls.

### Defensive Patterns

```python
# Always handle: success, error, and unexpected stream end
if event_type == "COMPLETE" and event.get("status") == "COMPLETED":
    return event["resultJson"]
elif event_type == "ERROR" or event.get("status") == "FAILED":
    raise Exception(event.get("message", "Automation failed"))
# If loop ends without COMPLETE or ERROR:
raise Exception("Stream ended without completion event")
```

### Rate Limiting Strategy

For production use, implement concurrency controls:
- `MAX_GLOBAL_CONCURRENCY`: Total parallel requests (e.g., 5-10)
- `MAX_PER_SITE_CONCURRENCY`: Parallel requests to same domain (e.g., 2)
- `MAX_ATTEMPTS_PER_SITE`: Retries per target (e.g., 2)

---

## 11. Python Implementation

### Simple Sync Version (httpx)

```python
import httpx
import json
import os
from dataclasses import dataclass
from typing import Any

TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"


@dataclass
class TinyFishResult:
    success: bool
    result: Any | None = None
    error: str | None = None
    streaming_url: str | None = None


def run_tinyfish(
    url: str,
    goal: str,
    api_key: str | None = None,
    browser_profile: str = "lite",
    proxy_enabled: bool = False,
    proxy_country: str | None = None,
    timeout: int | None = None,
) -> TinyFishResult:
    """Run a TinyFish browser automation task (synchronous)."""

    key = api_key or os.environ.get("TINYFISH_API_KEY")
    if not key:
        raise ValueError("TINYFISH_API_KEY is required")

    payload: dict[str, Any] = {"url": url, "goal": goal}

    if browser_profile != "lite":
        payload["browser_profile"] = browser_profile

    if proxy_enabled:
        proxy_config: dict[str, Any] = {"enabled": True}
        if proxy_country:
            proxy_config["country_code"] = proxy_country
        payload["proxy_config"] = proxy_config

    if timeout:
        payload["timeout"] = timeout

    streaming_url = None

    with httpx.Client(timeout=httpx.Timeout(300.0)) as client:
        with client.stream(
            "POST",
            TINYFISH_API_URL,
            headers={
                "X-API-Key": key,
                "Content-Type": "application/json",
            },
            json=payload,
        ) as response:
            response.raise_for_status()

            buffer = ""
            for chunk in response.iter_text():
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop()  # Keep incomplete line in buffer

                for line in lines:
                    if not line.startswith("data: "):
                        continue

                    try:
                        event = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue

                    event_type = event.get("type", "")

                    if event_type == "STREAMING_URL":
                        streaming_url = event.get("streamingUrl")

                    elif event_type == "COMPLETE" and event.get("status") == "COMPLETED":
                        return TinyFishResult(
                            success=True,
                            result=event.get("resultJson"),
                            streaming_url=streaming_url,
                        )

                    elif event_type == "ERROR" or event.get("status") == "FAILED":
                        return TinyFishResult(
                            success=False,
                            error=event.get("message", "Automation failed"),
                            streaming_url=streaming_url,
                        )

    return TinyFishResult(
        success=False,
        error="Stream ended without completion event",
        streaming_url=streaming_url,
    )
```

**Usage:**

```python
result = run_tinyfish(
    url="https://example.com/pricing",
    goal='Extract all pricing tiers. Return JSON: {"tiers": [{"name": "...", "price": "..."}]}',
)

if result.success:
    print(json.dumps(result.result, indent=2))
else:
    print(f"Error: {result.error}")
```

### Full-Featured Async Version (httpx)

```python
import httpx
import json
import os
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"

SYSTEM_EVENT_TYPES = {"STARTED", "STREAMING_URL", "HEARTBEAT", "PING", "CONNECTED", "INIT"}


@dataclass
class TinyFishEvent:
    type: str
    status: str | None = None
    message: str | None = None
    result_json: Any | None = None
    streaming_url: str | None = None
    purpose: str | None = None
    action: str | None = None
    step: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TinyFishEvent":
        return cls(
            type=data.get("type", "UNKNOWN"),
            status=data.get("status"),
            message=data.get("message"),
            result_json=data.get("resultJson"),
            streaming_url=data.get("streamingUrl"),
            purpose=data.get("purpose"),
            action=data.get("action"),
            step=data.get("step"),
            raw=data,
        )

    @property
    def step_message(self) -> str:
        return self.purpose or self.action or self.message or self.step or "Processing..."

    @property
    def is_complete(self) -> bool:
        return self.type == "COMPLETE" and self.status == "COMPLETED"

    @property
    def is_error(self) -> bool:
        return self.type == "ERROR" or self.status == "FAILED"

    @property
    def is_system(self) -> bool:
        return self.type.upper() in SYSTEM_EVENT_TYPES


@dataclass
class TinyFishResult:
    success: bool
    result: Any | None = None
    error: str | None = None
    streaming_url: str | None = None
    events: list[TinyFishEvent] = field(default_factory=list)
    step_messages: list[str] = field(default_factory=list)


@dataclass
class TinyFishCallbacks:
    on_streaming_url: Callable[[str], None] | None = None
    on_step: Callable[[str, TinyFishEvent], None] | None = None
    on_complete: Callable[[Any], None] | None = None
    on_error: Callable[[str], None] | None = None


async def run_tinyfish_async(
    url: str,
    goal: str,
    api_key: str | None = None,
    browser_profile: str = "lite",
    proxy_enabled: bool = False,
    proxy_country: str | None = None,
    timeout_ms: int | None = None,
    client_timeout: float = 300.0,
    callbacks: TinyFishCallbacks | None = None,
) -> TinyFishResult:
    """Run a TinyFish browser automation task with full event handling (async)."""

    key = api_key or os.environ.get("TINYFISH_API_KEY")
    if not key:
        raise ValueError("TINYFISH_API_KEY is required")

    payload: dict[str, Any] = {"url": url, "goal": goal}

    if browser_profile != "lite":
        payload["browser_profile"] = browser_profile

    if proxy_enabled:
        proxy_config: dict[str, Any] = {"enabled": True}
        if proxy_country:
            proxy_config["country_code"] = proxy_country
        payload["proxy_config"] = proxy_config

    if timeout_ms:
        payload["timeout"] = timeout_ms

    events: list[TinyFishEvent] = []
    step_messages: list[str] = []
    streaming_url: str | None = None

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(client_timeout)) as client:
            async with client.stream(
                "POST",
                TINYFISH_API_URL,
                headers={
                    "X-API-Key": key,
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as response:
                response.raise_for_status()

                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    lines = buffer.split("\n")
                    buffer = lines.pop()

                    for line in lines:
                        if not line.startswith("data: "):
                            continue

                        try:
                            raw = json.loads(line[6:])
                        except json.JSONDecodeError:
                            logger.warning("Failed to parse SSE line: %s", line[:100])
                            continue

                        event = TinyFishEvent.from_dict(raw)
                        events.append(event)

                        if event.streaming_url:
                            streaming_url = event.streaming_url
                            if callbacks and callbacks.on_streaming_url:
                                callbacks.on_streaming_url(event.streaming_url)

                        if event.type == "STEP" and not event.is_system:
                            step_messages.append(event.step_message)
                            if callbacks and callbacks.on_step:
                                callbacks.on_step(event.step_message, event)

                        if event.is_complete:
                            if callbacks and callbacks.on_complete:
                                callbacks.on_complete(event.result_json)
                            return TinyFishResult(
                                success=True,
                                result=event.result_json,
                                streaming_url=streaming_url,
                                events=events,
                                step_messages=step_messages,
                            )

                        if event.is_error:
                            error_msg = event.message or "Automation failed"
                            if callbacks and callbacks.on_error:
                                callbacks.on_error(error_msg)
                            return TinyFishResult(
                                success=False,
                                error=error_msg,
                                streaming_url=streaming_url,
                                events=events,
                                step_messages=step_messages,
                            )

        return TinyFishResult(
            success=False,
            error="Stream ended without completion event",
            streaming_url=streaming_url,
            events=events,
            step_messages=step_messages,
        )

    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        if callbacks and callbacks.on_error:
            callbacks.on_error(error_msg)
        return TinyFishResult(success=False, error=error_msg, events=events, step_messages=step_messages)

    except httpx.TimeoutException:
        error_msg = "Client timeout: TinyFish request exceeded time limit"
        if callbacks and callbacks.on_error:
            callbacks.on_error(error_msg)
        return TinyFishResult(success=False, error=error_msg, events=events, step_messages=step_messages)

    except Exception as e:
        error_msg = str(e)
        if callbacks and callbacks.on_error:
            callbacks.on_error(error_msg)
        return TinyFishResult(success=False, error=error_msg, events=events, step_messages=step_messages)
```

**Usage:**

```python
async def main():
    result = await run_tinyfish_async(
        url="https://example.com/pricing",
        goal='Extract pricing tiers. Return JSON: {"tiers": [{"name": "...", "price": "..."}]}',
        browser_profile="stealth",
        proxy_enabled=True,
        proxy_country="US",
        callbacks=TinyFishCallbacks(
            on_streaming_url=lambda url: print(f"Live preview: {url}"),
            on_step=lambda msg, _: print(f"  > {msg}"),
            on_complete=lambda result: print(f"Done: {json.dumps(result, indent=2)}"),
            on_error=lambda err: print(f"Error: {err}"),
        ),
    )

    if result.success:
        print(json.dumps(result.result, indent=2))
    else:
        print(f"Failed: {result.error}")

asyncio.run(main())
```

---

## 12. Implementation as a Pydantic AI Tool

### Basic `@agent.tool_plain` Implementation

```python
import json
from pydantic_ai import Agent
from pydantic import BaseModel

# Import your TinyFish client from Section 11
# from tinyfish_client import run_tinyfish_async, TinyFishResult

agent = Agent(
    "openai:gpt-4o",  # or any model
    system_prompt=(
        "You are a helpful assistant with access to a browser automation tool. "
        "You can use the `browse_website` tool to navigate websites, extract data, "
        "fill forms, and perform actions. The tool takes a URL and a natural language "
        "goal describing what to do. Always request JSON output in your goals."
    ),
)


@agent.tool_plain
async def browse_website(url: str, goal: str) -> str:
    """Browse a website and perform an action or extract data.

    Args:
        url: The target URL to navigate to.
        goal: Natural language instructions describing what to do on the page.
              Always specify the desired JSON output format in the goal.

    Returns:
        JSON string with the result, or an error message.
    """
    result = await run_tinyfish_async(
        url=url,
        goal=goal,
        browser_profile="lite",
    )

    if result.success:
        return json.dumps({
            "success": True,
            "data": result.result,
            "steps_taken": result.step_messages,
        })
    else:
        return json.dumps({
            "success": False,
            "error": result.error,
            "steps_taken": result.step_messages,
        })
```

### Full-Featured Version with Dependency Injection

```python
import json
import os
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel
from dataclasses import dataclass

# from tinyfish_client import run_tinyfish_async, TinyFishResult


@dataclass
class BrowseDeps:
    tinyfish_api_key: str
    default_browser_profile: str = "lite"
    default_proxy_enabled: bool = False
    default_proxy_country: str | None = None
    timeout_ms: int = 120000


agent = Agent(
    "openai:gpt-4o",
    deps_type=BrowseDeps,
    system_prompt=(
        "You are an assistant with browser automation capabilities. "
        "Use `browse_website` to interact with any website. Tips:\n"
        "- Always specify the JSON format you want in the goal\n"
        "- End goals with 'Return valid JSON only.'\n"
        "- For complex tasks, number your steps\n"
        "- Use stealth mode for sites that block bots\n"
    ),
)


@agent.tool
async def browse_website(
    ctx: RunContext[BrowseDeps],
    url: str,
    goal: str,
    use_stealth: bool = False,
    use_proxy: bool = False,
    proxy_country: str | None = None,
) -> str:
    """Browse a website and perform actions or extract data.

    Args:
        ctx: The run context with dependencies.
        url: The target URL to navigate to.
        goal: Natural language instructions. Always specify desired JSON output format.
        use_stealth: Use stealth browser profile for anti-bot protection. Default False.
        use_proxy: Route through a proxy for geo-targeting. Default False.
        proxy_country: Country code for proxy (US, GB, CA, DE, FR, JP, AU).

    Returns:
        JSON string with success/failure status and extracted data or error.
    """
    deps = ctx.deps

    result = await run_tinyfish_async(
        url=url,
        goal=goal,
        api_key=deps.tinyfish_api_key,
        browser_profile="stealth" if use_stealth else deps.default_browser_profile,
        proxy_enabled=use_proxy or deps.default_proxy_enabled,
        proxy_country=proxy_country or deps.default_proxy_country,
        timeout_ms=deps.timeout_ms,
    )

    if result.success:
        return json.dumps({
            "success": True,
            "data": result.result,
            "steps_taken": result.step_messages[-5:],  # Last 5 steps to save tokens
        }, indent=2)
    else:
        return json.dumps({
            "success": False,
            "error": result.error,
            "steps_taken": result.step_messages[-3:],
        }, indent=2)


# Usage
async def main():
    deps = BrowseDeps(
        tinyfish_api_key=os.environ["TINYFISH_API_KEY"],
    )

    result = await agent.run(
        "Find the current prices for all OpenAI API models from their pricing page.",
        deps=deps,
    )
    print(result.data)
```

### What to Return to the LLM Agent

When the tool returns data to the LLM:

1. **Always return JSON** -- the LLM can parse and reason about structured data.
2. **Include success/failure status** -- so the agent can decide whether to retry.
3. **Include a few step messages** -- gives the LLM context about what happened (limit to last 3-5 to save tokens).
4. **Truncate very large results** -- if `resultJson` is huge, summarize or truncate to avoid blowing the context window.
5. **Do NOT return the streaming URL** -- it is ephemeral and useless to the LLM.

---

## 13. Limitations and Gotchas

### Known Limitations

1. **No SDK** -- TinyFish is HTTP-only. You must implement SSE parsing yourself (no official Python/JS SDK library).
2. **No CAPTCHA solving** -- While stealth mode helps avoid bot detection, if a CAPTCHA appears, the agent may fail.
3. **Non-deterministic** -- AI-driven navigation means results can vary between runs. The same goal on the same page may produce slightly different results.
4. **Latency** -- Minimum 10-30 seconds per request. Not suitable for real-time user interactions that need sub-second responses.
5. **Token/context limits** -- Very large pages may exceed the AI agent's internal context window, causing incomplete extraction.
6. **Single-page focus** -- While multi-step navigation works, very deep multi-page crawls (follow 50 links) are unreliable. Better to make parallel single-page requests.
7. **No file downloads** -- Cannot download files from websites (PDFs, images, etc.).
8. **No persistent sessions** -- Each API call starts a fresh browser session. No cookie persistence between calls.

### Gotchas

1. **SSE buffer handling is critical.** Chunks from the HTTP stream can split in the middle of a JSON line. Always use a buffer (accumulate text, split on newlines, keep the last incomplete line in the buffer).
2. **Check BOTH `type` and `status`** for errors. Some errors come as `type: "ERROR"`, others as `status: "FAILED"`.
3. **`resultJson` can be any shape.** It depends entirely on what you asked for in the goal. It could be an object, array, string, or even null.
4. **The API key prefix is still `sk-mino-`** even though the product is now called TinyFish. Do not be confused by this.
5. **Environment variable naming:** Legacy code uses `MINO_API_KEY`, newer code uses `TINYFISH_API_KEY`. Use the latter.
6. **Endpoint migration:** Old endpoint `mino.ai` is deprecated. Always use `agent.tinyfish.ai`.
7. **STEP events have inconsistent fields.** Some have `purpose`, others have `action` or `message`. Use a fallback chain when extracting the step description.
8. **Stream can end without COMPLETE or ERROR.** Always handle this case as a failure.
9. **Large concurrent requests may hit rate limits.** Implement concurrency controls for production use.

---

## 14. Use Cases That Work Well

### Login Flows / Authenticated Pages

```python
goal = """
STEP 1: Click "Log In"
STEP 2: Enter email "user@example.com" in the email field
STEP 3: Enter password "password123" in the password field
STEP 4: Click the "Sign In" button
STEP 5: Wait for the dashboard to load
STEP 6: Extract the account balance and recent transactions

Return JSON:
{
  "logged_in": true/false,
  "balance": "...",
  "transactions": [{"date": "...", "description": "...", "amount": "..."}]
}
"""
```

### Form Submission

```python
goal = """
Fill out the contact form with:
- Name: "John Doe"
- Email: "john@example.com"
- Subject: "Partnership Inquiry"
- Message: "We would like to discuss a potential partnership."
Click "Submit" and verify the confirmation message.

Return JSON: {"submitted": true/false, "confirmation_message": "..."}
"""
```

### Page Verification / QA Testing

```python
goal = """
Verify the following on this page:
1. The page title contains "Dashboard"
2. The navigation menu has at least 5 items
3. There is a "Settings" link in the menu
4. The footer contains a copyright notice

Return JSON:
{
  "all_passed": true/false,
  "checks": [
    {"name": "page title", "passed": true/false, "actual": "..."},
    {"name": "nav items count", "passed": true/false, "actual": number},
    {"name": "settings link", "passed": true/false},
    {"name": "copyright footer", "passed": true/false, "actual": "..."}
  ]
}
"""
```

### Content Extraction / Scraping

```python
goal = """
Extract all job listings from this page.
For each job, get: title, company, location, salary (if shown), and posting date.
Return JSON: {"jobs": [{"title": "...", "company": "...", "location": "...", "salary": "...", "date": "..."}]}
Return valid JSON only.
"""
```

### Price Comparison (Parallel)

```python
import asyncio

sites = [
    {"url": "https://store-a.com/product/123", "name": "Store A"},
    {"url": "https://store-b.com/product/456", "name": "Store B"},
    {"url": "https://store-c.com/product/789", "name": "Store C"},
]

goal_template = 'Find the price of "{product_name}". Return JSON: {{"price": "...", "in_stock": true/false, "shipping": "..."}}'

results = await asyncio.gather(*[
    run_tinyfish_async(
        url=site["url"],
        goal=goal_template.format(product_name="Sony WH-1000XM5"),
    )
    for site in sites
])
```

### Event/Listing Discovery

```python
goal = """
Navigate to the events section.
Filter by:
- Location: Mountain View, California
- Category: Music > Jazz
- Date range: next 10 days

Extract up to 10 events with name, date, time, venue, and price.
Return JSON: {"events": [{"name": "...", "date": "...", "time": "...", "venue": "...", "price": "..."}]}
Return valid JSON only.
"""
```

---

## Sources

- [TinyFish Official Website](https://www.tinyfish.ai/)
- [TinyFish Web Agent Documentation](https://docs.mino.ai)
- [TinyFish Cookbook (GitHub)](https://github.com/tinyfish-io/tinyfish-cookbook)
- [TinyFish GitHub Organization](https://github.com/tinyfish-io)
- [TinyFish launches with $47M (BusinessWire)](https://www.businesswire.com/news/home/20250820555825/en/TinyFish-launches-with-$47-million-to-define-the-era-of-Enterprise-Web-Agents)
- [TinyFish Launches Mino (Yahoo Finance)](https://finance.yahoo.com/news/tinyfish-launches-mino-operate-hidden-150000126.html)
- [Gemini 3.0 Flash + Mino API Blog Post](https://www.tinyfish.ai/blog/gemini-3-0-flash-mino-api-when-reasoning-meets-real-execution)
- [Project Blowfish with TinyFish (Medium)](https://medium.com/continuous-insights/stop-writing-brittle-scrapers-project-blowfish-with-tinyfish-web-agents-643a38a54c78)
- [TinyFish Web Agent MCP Server (PulseMCP)](https://www.pulsemcp.com/servers/web-agent)
- [TinyFish Mind2Web Benchmark Blog](https://www.tinyfish.ai/blog/mind2web)

---

## Summary for Hackathon Implementation

For the fastest path to a working Pydantic AI agent with TinyFish:

1. **Copy the async TinyFish client** from Section 11 (full-featured version) into your project
2. **Register it as a `@agent.tool`** per Section 12
3. **Set `TINYFISH_API_KEY`** in your environment
4. **Start with `browser_profile="lite"`** and no proxy
5. **Write clear goals** with explicit JSON output format and "Return valid JSON only."
6. **Handle the three outcomes:** success (use `result`), error (log and optionally retry), stream-ended (treat as failure)
7. **Use `asyncio.gather()`** for parallel requests if scraping multiple sites
8. **Install httpx:** `pip install httpx`
