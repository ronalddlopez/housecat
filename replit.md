# HouseCat

## Overview
HouseCat is a service health monitoring dashboard that connects to external services (Upstash Redis, QStash, TinyFish, Anthropic Claude) and provides a visual dashboard for monitoring their connection status and running sanity checks.

## Project Architecture
- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui components (served via Vite through Express on port 5000)
- **Backend:** Python FastAPI (runs on port 8000, proxied via Express `/api/*`)
- **Dev Server:** Express.js on port 5000 handles Vite dev server + proxies API requests to FastAPI
- **External Services:**
  - Upstash Redis (data store)
  - QStash (message queue)
  - TinyFish (browser automation)
  - Anthropic Claude (AI agent)

## Key Files
- `backend/main.py` - FastAPI application with all API routes
- `client/src/pages/dashboard.tsx` - Main dashboard page (React)
- `server/index.ts` - Express dev server that starts FastAPI and serves Vite
- `server/routes.ts` - Proxy configuration (forwards /api/* to FastAPI)
- `shared/schema.ts` - Shared TypeScript types

## API Endpoints (served by FastAPI on port 8000, proxied on port 5000)
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
- `QSTASH_URL` - QStash base URL (optional, e.g., https://qstash-us-east-1.upstash.io)
- `TINYFISH_API_KEY` - TinyFish API key
- `ANTHROPIC_API_KEY` - Anthropic API key

## How It Works (Dev Mode)
1. Express starts FastAPI as a child process on port 8000
2. Express starts Vite dev server on port 5000
3. All `/api/*` requests are proxied from Express to FastAPI
4. React frontend is served by Vite with HMR

## Recent Changes
- 2026-02-14: Phase 0 scaffold created with health check dashboard and sanity test endpoints
- 2026-02-14: Migrated backend from Express/Node.js to Python/FastAPI
