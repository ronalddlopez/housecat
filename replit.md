# HouseCat

## Overview
HouseCat is a service health monitoring dashboard that connects to external services (Upstash Redis, QStash, TinyFish, Anthropic Claude) and provides a visual dashboard for monitoring their connection status and running sanity checks.

## Project Architecture
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui components
- **Backend:** Express.js API server
- **External Services:**
  - Upstash Redis (data store)
  - QStash (message queue)
  - TinyFish (browser automation)
  - Anthropic Claude (AI agent)

## Key Files
- `client/src/pages/dashboard.tsx` - Main dashboard page
- `server/routes.ts` - API endpoints (health check, sanity tests, callbacks)
- `server/storage.ts` - Redis and QStash client initialization
- `shared/schema.ts` - Shared TypeScript types

## API Endpoints
- `GET /api/health` - Health check for all services
- `POST /api/callback/:testId` - QStash callback endpoint
- `POST /api/tests/:testId/run` - Manual test trigger
- `POST /api/test/tinyfish` - TinyFish sanity check
- `POST /api/test/agent` - Claude AI sanity check
- `POST /api/test/qstash` - QStash delivery test

## Environment Variables (Secrets)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `QSTASH_TOKEN` - QStash token
- `TINYFISH_API_KEY` - TinyFish API key (starts with sk-mino-)
- `ANTHROPIC_API_KEY` - Anthropic API key (starts with sk-ant-)

## Recent Changes
- 2026-02-14: Phase 0 scaffold created with health check dashboard and sanity test endpoints
