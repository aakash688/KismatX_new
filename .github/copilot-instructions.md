# KismatX AI Coding Guide

## Big picture architecture
- Primary backend is Cloudflare Workers (Hono) in cloudflare-workers/. The Node.js backend in src/ is legacy/alternate.
- Game lifecycle is 5-minute cycles in IST with settlement redundancy: Durable Object alarm (primary) + cron fallback.
- Admin UI is React + Vite in adminpanelui/ and talks to the API via VITE_API_BASE_URL.

## Key entry points and flows
- Worker entry: cloudflare-workers/src/index.js mounts routes and exports cron + DO.
- Cron logic: cloudflare-workers/src/cron.js (minute-aligned “smart cron”, keep-alive).
- Settlement DO: cloudflare-workers/src/durable-objects/SettlementAlarmDO.js (exact ms alarms).
- Core services: cloudflare-workers/src/services/ (gameService, settlementService, slipCancellationService).
- Shared utilities: cloudflare-workers/src/utils/ (timezone.js, winningCardSelector.js, auditLogger.js).

## Data + integration points
- Cloudflare Workers uses Supabase (PostgreSQL REST) configured in cloudflare-workers/src/config/supabase.js; secrets in wrangler.
- JWT auth + RBAC enforced in cloudflare-workers/src/middleware/auth.js.
- Node backend uses TypeORM + MySQL with entities in src/entities/ and controllers in src/controllers/.

## Conventions and patterns
- All game times are IST; use timezone helpers in cloudflare-workers/src/utils/timezone.js.
- Settlement and claim logic must be idempotent; look at services + tests in tests/ (race-condition/idempotency).
- API structure mirrors Node backend routes: cloudflare-workers/src/routes/.

## Developer workflows
- Cloudflare Workers dev/deploy: cloudflare-workers/README.md (wrangler dev/deploy, secrets).
- Node backend dev: root README.md + src/README.md (npm run dev, init-db).
- Admin UI dev: adminpanelui/README.md (npm run dev, VITE_API_BASE_URL).
- DB backup utility: dbbackup/README.md (PM2 scheduler).

## Files to reference first
- root README.md for architecture + cron/settlement overview.
- cloudflare-workers/README.md for active backend behavior and optimization details.
- adminpanelui/src/services/api.ts for Axios config and auth interceptors.