# KismatX — Cloudflare Workers Backend

Serverless REST API backend running on Cloudflare Workers with Hono framework and Supabase (PostgreSQL). Designed for **100% free-tier hosting** with Durable Objects for guaranteed settlement and smart cron optimization.

## 🌐 Live URL

**Base URL:** [https://kismatx-api.kismatx.workers.dev](https://kismatx-api.kismatx.workers.dev)

| Endpoint | URL |
|----------|-----|
| Health Check | [/health](https://kismatx-api.kismatx.workers.dev/health) |
| DB Health | [/api/db-health](https://kismatx-api.kismatx.workers.dev/api/db-health) |
| Diagnostics | [/api/diagnostic](https://kismatx-api.kismatx.workers.dev/api/diagnostic) |
| Recovery | [/api/recovery](https://kismatx-api.kismatx.workers.dev/api/recovery) |

## ⚡ Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Cloudflare Workers | V8 Isolates | Serverless runtime (edge) |
| Hono | 4.x | Lightweight HTTP framework (7KB) |
| Supabase | PostgreSQL 17 | Database + REST API |
| Durable Objects | — | Guaranteed settlement alarms (exact ms) |
| Cron Triggers | — | Game automation (every minute) |
| JWT | jsonwebtoken 9.x | Authentication (access + refresh tokens) |
| bcryptjs | 2.x | Password hashing |
| date-fns / date-fns-tz | 4.x / 3.x | IST timezone handling |
| uuid | 9.x | Unique ID generation |

## 📁 Directory Structure

```
cloudflare-workers/
├── wrangler.toml                 # Cloudflare Workers configuration (crons, DO, secrets)
├── package.json
└── src/
    ├── index.js                  # Entry point (Hono app, route mounting, cron export, DO export)
    ├── cron.js                   # Smart cron logic (game management, settlement, keep-alive)
    ├── config/
    │   └── supabase.js           # Supabase client initialization
    ├── durable-objects/
    │   └── SettlementAlarmDO.js  # Durable Object for exact settlement timing
    ├── middleware/
    │   └── auth.js               # JWT authentication + role authorization
    ├── routes/
    │   ├── admin.js              # /api/admin/* (dashboard, users, games, stats, settlement)
    │   ├── auth.js               # /api/auth/* (login, register, refresh, logout)
    │   ├── betting.js            # /api/bets/* (place, claim, cancel, stats, scan-and-claim)
    │   ├── game.js               # /api/games/* (current, previous, recent winners)
    │   ├── settings.js           # /api/settings/* (public settings)
    │   ├── user.js               # /api/user/* (profile, wallet-info, password)
    │   └── wallet.js             # /api/wallet/* (logs, transactions, summary)
    ├── services/
    │   ├── gameService.js        # Game creation, activation, completion, recovery
    │   ├── settlementService.js  # Winning card selection, payout calculation, batch updates
    │   └── slipCancellationService.js  # Bet cancellation + refund + audit
    └── utils/
        ├── auditLogger.js        # Audit trail for admin actions
        ├── barcode.js            # Barcode generation
        ├── formatters.js         # IST response formatters (formatGame, formatIST)
        ├── settings.js           # Settings cache helper
        ├── timezone.js           # IST timezone utilities (nowIST, formatIST, getISTComponents)
        └── winningCardSelector.js  # Fair winning card selection algorithm
```

## 🔧 Requirements

- **Node.js** ≥ 18.0 (for Wrangler CLI)
- **Wrangler** ≥ 3.x (`npm install -g wrangler`)
- **Supabase** project (free tier works)
- **Cloudflare** account (free tier)

## 🚀 Setup

```bash
cd cloudflare-workers
npm install

# Login to Cloudflare
npx wrangler login

# Set secrets (required — these are NOT stored in code)
npx wrangler secret put SUPABASE_URL       # e.g., https://xxx.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY # Supabase service role key
npx wrangler secret put JWT_SECRET          # JWT signing secret (match Node.js backend)
```

### Secrets Reference

| Secret | Description | Where To Find |
|--------|-------------|---------------|
| `SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Supabase Dashboard → Settings → API → service_role |
| `JWT_SECRET` | JWT signing secret | Must match the Node.js backend `ACCESS_TOKEN_SECRET` |

### Deploy

```bash
# Deploy to Cloudflare
npx wrangler deploy

# View real-time logs
npx wrangler tail

# Local development
npx wrangler dev
```

## 🔄 Cron Triggers (Cloudflare Workers)

Configured in `wrangler.toml`:

```toml
[triggers]
crons = [
  "*/5 * * * *",  # Every 5 minutes - Create next game
  "* * * * *"     # Every minute - Game state management + settlement fallback
]
```

### Smart Cron Optimization

The every-minute cron uses **time-aligned logic** to minimize CPU and Supabase subrequests. Games run on 5-minute boundaries, so heavy work only happens near those boundaries:

```
Timeline:  ...03  04  05  06  07  08  09  10  11  12  13  ...
Category:  IDLE  PRE  END POST ACT IDLE IDLE PRE  END POST ACT IDLE
DB Work:    ❌    ✅   ✅   ✅   ✅   ❌   ❌   ✅   ✅   ✅   ✅   ❌
```

| Category | Minute Pattern | What Happens | DB Queries |
|----------|---------------|--------------|------------|
| **PRE-END** | `minute % 5 === 4` (04, 09, 14...) | Safety net: check if games need completing | Yes |
| **END** | `minute % 5 === 0` (00, 05, 10...) | **Critical:** Complete games + trigger settlement | Yes |
| **POST-END** | `minute % 5 === 1` (01, 06, 11...) | Late fallback: settle any missed games | Yes |
| **ACTIVATION** | `minute % 5 === 2` (02, 07, 12...) | Activate pending games (betting opens) | Yes |
| **IDLE** | `minute % 5 === 3` (03, 08, 13...) | **Exit immediately** — zero DB queries | **No** |

**Result:** ~20% of cron invocations exit immediately with zero DB queries. Critical operations still happen within seconds of game boundaries.

### Settlement Reliability (Triple Redundancy)

```
PRIMARY   → Durable Object Alarm (exact millisecond timing, guaranteed by Cloudflare)
SECONDARY → Cron END minute (00, 05, 10...) — catches missed DO alarms
FALLBACK  → Cron POST-END minute (01, 06, 11...) — late catch-up
```

All settlement operations are **idempotent** — they check `settlement_status = 'not_settled'` before proceeding, so concurrent attempts from DO + cron are safe.

### Supabase Keep-Alive

Supabase free tier pauses projects after **7 days of inactivity**. Two independent mechanisms prevent this:

#### Layer 1: CF Worker Keep-Alive (in `cron.js`)
- Runs every **6 hours** at minute 3 of hours 0, 6, 12, 18 IST
- Sends a lightweight query to Supabase REST API
- Runs on IDLE minutes — never interferes with game logic
- Cost: 4 subrequests/day (negligible)

#### Layer 2: pg_cron Self-Ping (inside Supabase)
- Job: `supabase-keep-alive` — runs every **3 days** at 4:00 AM IST
- Executes `SELECT 1` directly within the database
- Backup in case CF Worker stops

**Together, they ensure Supabase never pauses, even during weeks of zero user activity.**

## 🗃️ Supabase pg_cron Jobs (Database-Level)

All heavy jobs are scheduled during **non-operational hours** (midnight–7 AM IST):

| Job | Schedule (IST) | Purpose |
|-----|---------------|---------|
| `daily-data-cleanup` | 3:00 AM daily | Delete data older than 30 days (keeps deposit/withdrawal wallet logs forever) |
| `weekly-vacuum-analyze` | 3:30 AM Sunday | Reclaim disk space + update query planner stats |
| `token-cleanup` | Midnight, 2AM, 4AM, 6AM | Delete expired/revoked refresh tokens |
| `supabase-keep-alive` | 4:00 AM every 3 days | Prevent project pausing |

### Data Cleanup Details (`cleanup_old_data` function)

Deletion order respects foreign key constraints (children first):

```
1. bet_details      → 30 days (FK: slip_id → bet_slips.id)
2. bet_slips        → 30 days (FK: game_id → games.game_id)
3. game_card_totals → 30 days (FK: game_id → games.game_id)
4. wallet_logs      → 30 days (ONLY transaction_type='game')
5. games            → 30 days
6. audit_logs       → 90 days
7. login_history    → 30 days
8. refresh_tokens   → Expired/revoked immediately
9. settings_logs    → 90 days
```

**Important:** Deposit and withdrawal wallet logs are **never deleted** (preserved for accounting).

## 💰 Cloudflare Free Tier Limits

| Resource | Free Limit | KismatX Usage | Headroom |
|----------|-----------|---------------|----------|
| Requests/day | 100,000 | ~16,000 (1-2 users) | 84% unused |
| CPU time/request | 10ms | ~3-5ms average | 50-70% unused |
| Subrequests/request | 50 | ~3-8 per endpoint | 84-94% unused |
| Durable Object requests/month | 1,000,000 | ~8,640 | 99% unused |
| Cron invocations | Unlimited | 1,440/day + 288/day | ✅ |
| Worker size | 10 MB | ~210 KB gzip | 98% unused |

### Optimizations Implemented

- **Smart Cron:** 60% reduction in DB queries by skipping IDLE minutes
- **Batch Queries:** Fetch all related data in parallel with `Promise.all()`
- **In-Memory Grouping:** Reduce N+1 queries by fetching in bulk and grouping in JS
- **Optimistic Locking:** Prevents race conditions without database transactions
- **Parallel Updates:** Settlement updates run in parallel, not sequentially

## 🔑 Key Differences from Node.js Backend

| Feature | Node.js | Cloudflare Workers |
|---------|---------|-------------------|
| Database | MySQL (TypeORM, SQL) | Supabase PostgreSQL (REST API) |
| Transactions | DB transactions + pessimistic locks | Optimistic concurrency control |
| Scheduling | node-cron (in-process) | Cron Triggers + Durable Objects |
| Settlement | Cron-based only | DO Alarm (primary) + Cron (fallback) |
| Keep-Alive | N/A (always running on VPS) | CF Worker + pg_cron keep-alive |
| Data Cleanup | Manual | Automated via pg_cron (30-day retention) |
| Hosting | VPS/Server (paid) | Cloudflare Edge (free tier) |
| Cold Starts | None (always running) | ~46ms worker startup |

## 📝 API Endpoints

All endpoints mirror the Node.js backend. See [API_DOCUMENTATION.md](../API_DOCUMENTATION.md) for the complete reference.

Quick reference:

| Route Group | Prefix | Auth Required |
|------------|--------|---------------|
| Auth | `/api/auth/*` | No (login/register) |
| User | `/api/user/*` | Yes |
| Games | `/api/games/*` | Mixed |
| Betting | `/api/bets/*` | Yes |
| Wallet | `/api/wallet/*` | Yes (Admin for some) |
| Admin | `/api/admin/*` | Yes (Admin role) |
| Settings | `/api/settings/*` | No (public) |
| System | `/api/db-health`, `/api/diagnostic`, `/api/recovery` | No |
