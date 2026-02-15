# Hackathon Brainstorm

## Hackathon Details

- **Event:** February 2026 Online Open Source Agents Hackathon
- **Hosted by:** Open Source for AI (r/AI_Agents community — 200k+ members)
- **Hack time:** 2/14 9am PST to 2/15 9pm PST (36 hours)
- **Team Size:** 1 to 3
- **Goal:** Build an AI Agent that can scale into a real business, no vertical limits
- **Open source required**

### Prizes

- Interview for a 30k investment from Gravitational Ventures (first place only)
- Potential acceptance into AI Explorer program by Beta Fund
- Cash prizes from TinyFish for use of Mino ($250+credits 1st, $150+credits 2nd)
- 10k in Redis credits (if you use Redis)

---

## Design Constraints: What Impresses the Sponsors

### TinyFish — Go Beyond "Scrape Once"

Most hackathon projects will call TinyFish once, scrape a page, display results. That's their cookbook — they've built 10 demos of that already. To impress them, show TinyFish used in ways they haven't seen:

1. **Multi-hop browsing** — agent scrapes page 1, reasons about results, decides to scrape page 2. The LLM drives a research loop across multiple sites.
2. **Actions, not just reading** — filling forms, submitting applications, completing flows. The agent doesn't just observe the web, it *acts* on it.
3. **Verification** — agent calls an API, then uses TinyFish to *verify it worked* by browsing the live site.
4. **Comparative intelligence** — parallel scraping of N sources, then LLM reasons across all results to produce insights no single scrape could.
5. **Scheduled monitoring** — TinyFish as infrastructure that runs repeatedly, not just once.

### Redis/Upstash — Go Beyond `SET`/`GET`

Most projects will use Redis as a simple cache. To impress Upstash, use Redis as a core architectural component:

1. **Redis Streams** — event-source every agent step. Frontend consumes the stream in real-time. Proper event-driven architecture.
2. **Sorted Sets for time-series** — store price/sentiment/metric history with timestamps. Query trends. Detect anomalies.
3. **Agent memory across runs** — Redis isn't caching, it's the agent's *long-term memory*. Run N retrieves context from runs 1 through N-1.
4. **QStash cron** — scheduled autonomous agents, not just one-shot triggers.
5. **Pub/Sub for real-time** — agent publishes steps to a channel, dashboard subscribes live. No polling.

### General — "Scale Into a Real Business"

The judges want to see something that could be a company, not a toy demo:

- **Clear target customer** — who pays for this?
- **Recurring value** — not one-shot, something users come back to daily/weekly
- **Defensible** — the AI agent adds intelligence, not just wrapper-over-an-API

---

## Tech Stack (Shared Across All Ideas)

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) — single server |
| Frontend | React + Vite + Tailwind + shadcn/ui |
| Database | Upstash Redis (no Postgres) |
| Job Queue | QStash (scheduling + async dispatch) |
| Browser Agent | TinyFish API (SSE) |
| LLM | Claude (Haiku for cost) via Anthropic API |
| Deployment | Railway or Fly.io |

---

## Idea 1: "Pricewise" — Autonomous Price Intelligence

### Pitch
An AI agent that continuously monitors competitor pricing across any website — even ones with no API. Set up a product to track, and the agent scrapes prices on a schedule, builds a price history, detects significant changes, and alerts you.

### Why It Impresses

| Sponsor | How It's Used Deeply |
|---------|---------------------|
| **TinyFish** | Multi-hop browsing (search → product page → variant pricing), scheduled recurring scrapes, handles dynamic JS pricing pages that defeat simple scrapers |
| **Redis** | Sorted sets for price time-series, Streams for change events, pub/sub for live dashboard updates, hashes for product metadata |
| **QStash** | Cron-scheduled monitoring (every 6h), alert dispatch on price changes |

### How It Works

```
User adds a product to track:
  "iPhone 16 Pro" → [bestbuy.com, amazon.com, walmart.com]
        |
QStash cron triggers every 6 hours
        |
LLM Agent receives: "Check current prices for tracked products"
        |
Agent loop:
  → retrieve("products:iphone16pro:sources")     ← Redis
  → retrieve("products:iphone16pro:last_prices")  ← Redis (previous run)
  → browse(bestbuy.com, "Find iPhone 16 Pro price") ← TinyFish
  → browse(amazon.com, "Find iPhone 16 Pro price")  ← TinyFish
  → browse(walmart.com, "Find iPhone 16 Pro price") ← TinyFish
  → Compares new prices vs. stored history
  → store("products:iphone16pro:history", sorted set with timestamp) ← Redis
  → IF significant change detected:
      → http_request(slack, "Price drop alert!")
        |
Dashboard shows: price chart over time, alert history, live agent activity
```

### Demo Moment
Show the live TinyFish browser navigating BestBuy, pulling the price, then the Redis sorted set building up a price chart in real-time on the dashboard.

### Target Customer
E-commerce teams, dropshippers, pricing analysts, deal-hunting apps.

### Deliverability: 7/10
Straightforward agent logic. Main risk is TinyFish reliably extracting prices from varied retail sites.

---

## Idea 2: "Sentinel" — Web Change Detection Agent

### Pitch
An AI agent that monitors any webpage for meaningful changes — not just "did the HTML change" but "did the *meaning* change?" Uses TinyFish to capture page content, Redis to store snapshots, and an LLM to diff semantically.

### Why It Impresses

| Sponsor | How It's Used Deeply |
|---------|---------------------|
| **TinyFish** | Captures full page content including dynamic JS (not just static HTML), handles login walls, navigates to specific sections |
| **Redis** | Hashes for page snapshots, Streams for change events with semantic diffs, sorted sets for change frequency tracking, pub/sub for instant alerts |
| **QStash** | Cron-scheduled checks (configurable per page), webhook callbacks on change detection |

### How It Works

```
User adds pages to monitor:
  - "competitor.com/pricing" — check every 4 hours
  - "regulator.gov/rules" — check daily
  - "myapp.com/status" — check every 30 min
        |
QStash cron triggers per-page schedule
        |
LLM Agent receives: "Check {url} for changes"
        |
Agent loop:
  → retrieve("snapshots:{url}:latest")            ← Redis (previous snapshot)
  → browse(url, "Extract all text content")        ← TinyFish
  → LLM compares new content vs previous snapshot
  → IF meaningful change:
      → Generates semantic diff: "Pricing tier 'Pro' increased from $49 to $59"
      → store("snapshots:{url}:latest", new content)           ← Redis
      → XADD to "changes:{url}" stream with diff details       ← Redis Stream
      → http_request(webhook_url, change_notification)
        |
Dashboard shows: monitored pages, change timeline, semantic diffs, alert config
```

### Demo Moment
Monitor a competitor's pricing page. Show the agent detecting a price change and generating a human-readable diff: "The Enterprise plan increased from $99/mo to $129/mo. A new 'Startup' tier was added at $29/mo."

### Target Customer
Competitive intelligence teams, compliance officers, brand managers, legal teams monitoring regulatory changes.

### Deliverability: 8/10
Clean scope. LLM semantic diffing is the killer feature and it's straightforward to implement.

---

## Idea 3: "Scout" — AI Lead Research Agent

### Pitch
Give the agent a target customer profile ("Series A SaaS companies in fintech") and it researches leads by browsing company websites, extracting key info (team size, funding, tech stack, decision makers), and builds enriched lead profiles — all from public web data.

### Why It Impresses

| Sponsor | How It's Used Deeply |
|---------|---------------------|
| **TinyFish** | Multi-hop research: search engine → company website → about page → team page → job postings. Form-based directory searches. Navigates complex company sites. |
| **Redis** | Hashes for lead profiles (company data, contacts, scores), sorted sets for lead scoring/ranking, Streams for research progress events, key expiry for data freshness |
| **QStash** | Batch processing of lead lists, scheduled re-enrichment of stale leads |

### How It Works

```
User defines a research task:
  "Find 10 Series A fintech companies with 20-50 employees"
        |
LLM Agent receives: research criteria + trigger
        |
Agent loop:
  → browse(google.com, "Search for Series A fintech startups 2025 2026") ← TinyFish
  → For each company found:
      → browse(company.com, "Extract: founding year, team size, product description") ← TinyFish
      → browse(company.com/careers, "Count open positions, identify tech stack") ← TinyFish
      → LLM scores the lead based on criteria
      → store("leads:{company}", enriched profile hash) ← Redis
      → ZADD "leads:scored" with score ← Redis sorted set
        |
Dashboard shows: lead list ranked by score, company profiles, research trail
```

### Demo Moment
Type "fintech startups with open engineering roles" → watch TinyFish browse 5 company websites in real-time → see enriched lead cards populate the dashboard with scores.

### Target Customer
Sales teams, recruiters, VCs doing deal sourcing, business development.

### Deliverability: 6/10
Most ambitious scope. Multi-hop browsing across unknown sites is unpredictable. Could scope down to "research 3 companies" for demo.

---

## Idea 4: "Pulse" — Brand Mention & Sentiment Monitor

### Pitch
An AI agent that monitors what people are saying about your brand/product across review sites, forums, and social media. Uses TinyFish to access sites that block traditional scrapers, Redis to track sentiment over time, and an LLM to analyze sentiment and extract actionable insights.

### Why It Impresses

| Sponsor | How It's Used Deeply |
|---------|---------------------|
| **TinyFish** | Scrapes review sites (G2, Trustpilot, Yelp, Reddit) that heavily block bots — stealth mode shines here. Navigates paginated results, filters by date. |
| **Redis** | Sorted sets for sentiment time-series (score per day), Streams for new mention events, hashes for individual review storage, pub/sub for real-time dashboard |
| **QStash** | Scheduled monitoring cycles (daily), alert triggers on sentiment drops |

### How It Works

```
User sets up monitoring:
  Brand: "Acme Corp"
  Sources: [g2.com, trustpilot.com, reddit.com/r/saas]
  Alert: notify on negative sentiment spike
        |
QStash cron triggers daily
        |
LLM Agent receives: "Check brand mentions for Acme Corp"
        |
Agent loop:
  → browse(g2.com, "Search Acme Corp, extract recent reviews with ratings") ← TinyFish (stealth)
  → browse(trustpilot.com, "Search Acme Corp, extract recent reviews") ← TinyFish (stealth)
  → browse(reddit.com/r/saas, "Search Acme Corp mentions, extract posts") ← TinyFish
  → LLM analyzes sentiment across all sources
  → store("sentiment:acme:2026-02-14", aggregate score) ← Redis sorted set
  → XADD "mentions:acme" stream with new reviews ← Redis Stream
  → retrieve("sentiment:acme:history") ← get trend
  → IF sentiment dropped significantly:
      → http_request(slack, "Sentiment alert: 3 new negative reviews on G2")
        |
Dashboard shows: sentiment chart over time, recent mentions, source breakdown, alerts
```

### Demo Moment
Show the agent browsing G2 and Trustpilot with stealth mode (live TinyFish preview), extracting reviews, then a sentiment chart updating in real-time as new data comes in.

### Target Customer
Product teams, marketing teams, customer success, brand managers. ($5B+ market)

### Deliverability: 7/10
Clean scope, impressive visuals. Stealth mode on review sites is a great TinyFish showcase. Sentiment analysis is well-understood LLM territory.

---

## Idea 5: "HouseCat" — CodeRabbit for QA

### Pitch
An AI agent that tests your web application like a real user — not just pinging URLs, but actually navigating pages, filling forms, clicking buttons, and verifying workflows work. Synthetic monitoring powered by an AI that understands your app.

### Why It Impresses

| Sponsor | How It's Used Deeply |
|---------|---------------------|
| **TinyFish** | This IS the killer use case — real browser interaction, not synthetic pings. Fill a signup form, complete a checkout, verify the confirmation page loads. Tests things no uptime monitor can. |
| **Redis** | Sorted sets for response time tracking, Streams for test execution events (live in dashboard), hashes for test result history, pub/sub for instant failure alerts |
| **QStash** | Cron-scheduled test runs (every 15 min, every hour), retry logic on failures, alert dispatch |

### How It Works

```
User defines test scenarios:
  - "Login flow": browse myapp.com/login → enter credentials → verify dashboard loads
  - "Checkout flow": browse myapp.com → add item → checkout → verify confirmation
  - "API health": http_request(myapp.com/api/health)
        |
QStash cron triggers every 15 minutes
        |
LLM Agent receives: "Run test suite for myapp.com"
        |
Agent loop:
  → browse(myapp.com/login, "Enter test@test.com / password, click login, verify dashboard") ← TinyFish
  → Result: pass/fail + response time + screenshot context
  → ZADD "uptime:myapp:login" with {timestamp: response_time} ← Redis sorted set
  → XADD "tests:myapp" stream with result ← Redis Stream
  → IF failure:
      → http_request(pagerduty, "Login flow broken!")
      → store("incidents:myapp:latest", failure details) ← Redis
        |
Dashboard shows: uptime percentage, response time charts, test history, live test execution, incident log
```

### Demo Moment
Show the agent running through a real login flow on a demo app via TinyFish (live browser preview), then the dashboard showing uptime charts built from Redis sorted sets, then trigger a failure and watch the alert fire in real-time.

### Target Customer
DevOps teams, SREs, QA teams, any company with a web app. ($3B+ synthetic monitoring market — Datadog, Pingdom, etc.)

### Deliverability: 8/10
Very focused scope. Each "test" is just a TinyFish browse call with a pass/fail assessment. Redis time-series is straightforward. The visual is compelling — watching a real browser test your app.

---

## Comparison Matrix

| | Pricewise | Sentinel | Scout | Pulse | HouseCat |
|---|-----------|----------|-------|-------|----------|
| **TinyFish depth** | High (multi-site, scheduled) | Medium (content capture) | Very High (multi-hop research) | High (stealth on review sites) | Very High (interactive flows) |
| **Redis depth** | High (sorted sets, streams) | High (snapshots, streams, diffs) | Medium (hashes, sorted sets) | High (time-series, streams) | Very High (time-series, streams, pub/sub) |
| **QStash depth** | High (cron + alerts) | High (per-page schedules) | Medium (batch processing) | High (daily cron) | Very High (frequent cron, retries) |
| **Business case** | Strong (e-commerce) | Strong (compliance/competitive) | Strong (sales) | Strong (marketing) | Very Strong (DevOps — huge market) |
| **Demo impact** | Good (price charts) | Great (semantic diffs) | Good (lead cards) | Great (sentiment charts) | Excellent (live browser testing) |
| **Deliverability** | 7/10 | 8/10 | 6/10 | 7/10 | 8/10 |
| **Uniqueness** | Medium (price trackers exist) | High (semantic diffing is novel) | Medium (lead tools exist) | Medium (brand monitors exist) | High (AI-powered synthetic monitoring is emerging) |

### Top Picks

**Best overall: HouseCat (Idea 5)**
- Highest TinyFish depth (interactive browser testing is THE showcase for their technology)
- Highest Redis depth (time-series, streams, pub/sub all used naturally)
- Most frequent QStash usage (every 15 min)
- Huge addressable market (synthetic monitoring)
- Most visually impressive demo
- Very deliverable in 36 hours

**Runner-up: Sentinel (Idea 2)**
- Cleanest scope, most deliverable
- Semantic diffing is a genuinely novel feature
- Strong business case (compliance, competitive intel)
- Less TinyFish "wow factor" than HouseCat

**Sleeper pick: Pulse (Idea 4)**
- Stealth mode on review sites is a great TinyFish demo
- Sentiment tracking over time is compelling
- Marketing teams are a proven buyer

---

## Risks / Concerns (All Ideas)

1. **TinyFish reliability** — if their API goes down, everything stops. Mitigation: mock mode, cached results for demo
2. **Scope creep** — pick ONE idea and ship it. Don't try to combine ideas
3. **QStash requires public URL** — need ngrok for dev, deploy to Railway/Fly for demo
4. **Claude API costs** — use Haiku, keep prompts tight
5. **Open source** — fresh public repo, MIT license, good README
6. **36 hours** — build the agent loop first (riskiest), then layer UI on top

---

## Next Steps

1. **Pick one idea** from the 5 above
2. **Create implementation plan** with exact file structure, API endpoints, Redis key schema
3. **Set up fresh repo** with FastAPI + React + Vite scaffold
4. **Build agent engine first** — the LLM tool-use loop is the core and riskiest piece
5. **Layer UI on top** once the backend works end-to-end
