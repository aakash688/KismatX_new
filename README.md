# 🎴 KismatX — Real-Time Card Betting Platform

A full-stack real-time card-based betting game platform with automated 5-minute game cycles, instant settlement, and a comprehensive admin panel.

## 🌐 Live URLs

| Component | URL |
|-----------|-----|
| **API Backend** (Cloudflare Workers) | [https://kismatx-api.kismatx.workers.dev](https://kismatx-api.kismatx.workers.dev) |
| **Admin Panel** (Cloudflare Pages) | [https://kismatx-admin.pages.dev](https://kismatx-admin.pages.dev) |
| **API Health Check** | [https://kismatx-api.kismatx.workers.dev/api/db-health](https://kismatx-api.kismatx.workers.dev/api/db-health) |
| **API Diagnostics** | [https://kismatx-api.kismatx.workers.dev/api/diagnostic](https://kismatx-api.kismatx.workers.dev/api/diagnostic) |

## 📁 Project Structure

```
KismatX/
├── src/                        # Node.js Backend (Express + TypeORM + MySQL)
├── cloudflare-workers/         # Cloudflare Workers Backend (Hono + Supabase) ← ACTIVE
├── adminpanelui/               # Admin Panel Frontend (React + TypeScript + Vite)
├── dbbackup/                   # Database Backup Utility (PM2 scheduled)
├── scripts/                    # Database initialization & admin setup scripts
├── tests/                      # Integration & race-condition tests
├── postman_collection/         # Postman API collections for testing
├── public/                     # Static API documentation pages
├── API_DOCUMENTATION.md        # Complete API endpoint documentation
├── env.example                 # Node.js backend environment template
└── LICENSE
```

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE NETWORK                       │
│                                                                   │
│  ┌─────────────────┐   ┌──────────────────────────────────────┐  │
│  │  Cloudflare      │   │  Cloudflare Workers (kismatx-api)    │  │
│  │  Pages           │   │                                      │  │
│  │  ┌─────────────┐ │   │  ┌─────────────┐ ┌──────────────┐  │  │
│  │  │ Admin Panel  │ │──▶│  │ Hono Router  │ │ Cron Triggers │  │  │
│  │  │ (React+TS)   │ │   │  └──────┬──────┘ └──────┬───────┘  │  │
│  │  └─────────────┘ │   │         │               │           │  │
│  └─────────────────┘   │  ┌──────▼───────────────▼────────┐  │  │
│                         │  │        Business Logic          │  │  │
│                         │  │  (Games, Betting, Settlement)  │  │  │
│                         │  └──────────────┬────────────────┘  │  │
│                         │  ┌──────────────▼────────────────┐  │  │
│                         │  │    Durable Object (DO)         │  │  │
│                         │  │  Settlement Alarm (exact ms)   │  │  │
│                         │  └──────────────┬────────────────┘  │  │
│                         └─────────────────┼────────────────────┘  │
└───────────────────────────┼───────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │   Supabase    │
                    │ (PostgreSQL)  │
                    │               │
                    │ • games       │
                    │ • bet_slips   │
                    │ • bet_details │
                    │ • users       │
                    │ • wallet_logs │
                    │ • audit_logs  │
                    │ • pg_cron     │
                    └───────────────┘
```

## 🎮 Game Logic Overview

KismatX runs automated **5-minute game cycles** from **8:00 AM to 11:00 PM IST** daily.

### Game Lifecycle

```
1. CREATION    → New game created every 5 mins (game_id: YYYYMMDDHHMM)
2. ACTIVATION  → Game status: pending → active (betting window opens)
3. BETTING     → Users place bets on 1 of 12 cards during the 5-min window
4. COMPLETION  → Game status: active → completed (betting closes at end_time)
5. SETTLEMENT  → Winning card selected, payouts calculated (10x multiplier)
6. CLAIMING    → Winners scan barcode to claim winnings → credited to wallet
```

### Card System (12 Cards)

| Card # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|--------|---|---|---|---|---|---|---|---|---|----|----|-----|
| Name | Butterfly | Cow | Diva | Football | Horse | Kite | Pigeon | Rabbit | Rose | Sun | Tiger | Umbrella |

### Settlement System (Triple Redundancy)

| Priority | Trigger | Timing | Purpose |
|----------|---------|--------|---------|
| **PRIMARY** | Durable Object Alarm | Exact millisecond | Guaranteed instant settlement |
| **SECONDARY** | Cron END minute | 00, 05, 10, 15... | Fallback for missed DO alarm |
| **TERTIARY** | Cron POST-END minute | 01, 06, 11, 16... | Late catch-up for edge cases |

All settlement operations are **idempotent** — running multiple times is safe.

## ⚡ Tech Stack

| Layer | Node.js Version | Cloudflare Version (Active) |
|-------|----------------|----------------------------|
| Runtime | Node.js 18+ | Cloudflare Workers (V8 isolate) |
| Framework | Express.js 4.x | Hono 4.x |
| Database | MySQL/MariaDB (TypeORM) | Supabase (PostgreSQL REST API) |
| Auth | JWT (Access + Refresh tokens) | JWT (Access + Refresh tokens) |
| Scheduling | node-cron | Cron Triggers + Durable Objects |
| Settlement | Cron-based | DO Alarm (primary) + Smart Cron (fallback) |
| Frontend | — | React 18 + Vite + Tailwind CSS |
| Hosting | VPS/Server | Cloudflare Free Tier + Supabase Free Tier |

## 🔄 Cron & Scheduled Jobs

### Cloudflare Workers Cron Triggers

| Schedule | Frequency | Purpose |
|----------|-----------|---------|
| `*/5 * * * *` | Every 5 minutes | Create next game + backfill missed games |
| `* * * * *` | Every minute | Smart game state management + settlement fallback |

#### Smart Cron Optimization (60% DB query reduction)

The every-minute cron uses time-aligned logic to minimize resource usage:

| Category | Minutes | Action | DB Queries |
|----------|---------|--------|------------|
| **PRE-END** | x4 (04, 09, 14, 19...) | Safety net before game end | ✅ Yes |
| **END** | x0 (00, 05, 10, 15...) | Critical: close game + settle | ✅ Yes |
| **POST-END** | x1 (01, 06, 11, 16...) | Late fallback settlement | ✅ Yes |
| **ACTIVATION** | x2 (02, 07, 12, 17...) | Activate pending games | ✅ Yes |
| **IDLE** | x3, x8 (03, 08, 13...) | Exit immediately | ❌ None |

#### Supabase Keep-Alive (Prevents Project Pausing)

Supabase free tier pauses projects after 7 days of inactivity. Two independent keep-alive mechanisms ensure the database never pauses:

| Layer | Mechanism | Schedule | What It Does |
|-------|-----------|----------|-------------|
| **CF Worker** | `handleSupabaseKeepAlive()` | Every 6 hours (minute 3 of hours 0,6,12,18 IST) | Lightweight `SELECT 1` ping via REST API |
| **pg_cron** | `supabase-keep-alive` job | Every 3 days at 4:00 AM IST | Internal `SELECT 1` ping within PostgreSQL |

### Supabase pg_cron Jobs (Database-Level Automation)

All scheduled during **non-operational hours** (midnight–7 AM IST) to avoid impacting live games:

| # | Job Name | Schedule (IST) | What It Does |
|---|----------|---------------|-------------|
| 1 | `daily-data-cleanup` | **3:00 AM** daily | Deletes game data older than 30 days (preserves deposit/withdrawal wallet logs) |
| 2 | `weekly-vacuum-analyze` | **3:30 AM** Sunday | Reclaims disk space and updates query planner statistics |
| 3 | `token-cleanup` | **Midnight, 2AM, 4AM, 6AM** | Deletes expired/revoked refresh tokens |
| 4 | `supabase-keep-alive` | **4:00 AM** every 3 days | Prevents Supabase from pausing due to inactivity |

#### Data Retention Policy (Auto-Cleanup)

| Table | Retention | Notes |
|-------|-----------|-------|
| `games` | 30 days | Game records |
| `bet_slips` | 30 days | Linked to games |
| `bet_details` | 30 days | Linked to bet_slips |
| `wallet_logs` (game type) | 30 days | Only game-related logs |
| `wallet_logs` (deposit/withdrawal) | **Forever** | Accounting records preserved |
| `game_card_totals` | 30 days | Aggregated card data |
| `audit_logs` | 90 days | Longer retention for auditing |
| `login_history` | 30 days | Session records |
| `settings_logs` | 90 days | Admin settings changes |
| `refresh_tokens` | Immediate | Expired/revoked tokens |

## 💰 Free Tier Viability

The platform is designed to run entirely on free tiers:

| Service | Free Limit | KismatX Usage (1-2 users) | Status |
|---------|-----------|--------------------------|--------|
| **Cloudflare Workers** | 100K requests/day | ~16,000 requests/day | ✅ Safe |
| **Cloudflare Workers** | 10ms CPU/request | ~3-5ms average | ✅ Safe |
| **Supabase** | 500 MB database | ~50-100 MB (with 30-day cleanup) | ✅ Safe |
| **Supabase** | 50K rows limit (approx) | Auto-cleaned by pg_cron | ✅ Safe |
| **Cloudflare Pages** | Unlimited requests | Static site | ✅ Safe |
| **Durable Objects** | 1M requests/month | ~8,640/month | ✅ Safe |

## 🚀 Quick Start

### Option A: Cloudflare Workers Backend (Recommended — Currently Active)

```bash
cd cloudflare-workers
npm install

# Login to Cloudflare
npx wrangler login

# Set secrets (required)
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put JWT_SECRET

# Deploy
npx wrangler deploy

# View live logs
npx wrangler tail
```

### Option B: Node.js Backend (Original)

```bash
# Install dependencies
npm install

# Configure environment
cp env.example .env
# Edit .env with your database credentials

# Initialize database
npm run init-db

# Start development server
npm run dev
```

### Frontend (Admin Panel)

```bash
cd adminpanelui
npm install

# Configure API URL
cp env.example .env
# Edit: VITE_API_BASE_URL=https://kismatx-api.kismatx.workers.dev

npm run dev
# Opens at http://localhost:5173
```

## 📦 Component Documentation

| Component | README | Description |
|-----------|--------|-------------|
| **Node.js Backend** | [src/README.md](src/README.md) | Express.js REST API with TypeORM + MySQL |
| **Cloudflare Workers** | [cloudflare-workers/README.md](cloudflare-workers/README.md) | Serverless API with Hono + Supabase |
| **Admin Panel** | [adminpanelui/README.md](adminpanelui/README.md) | React + TypeScript admin dashboard |
| **Database Backup** | [dbbackup/README.md](dbbackup/README.md) | Automated MySQL backup utility |
| **API Documentation** | [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | Complete API endpoint reference |
| **Postman Collection** | [postman_collection/](postman_collection/) | Ready-to-import Postman collection |

## 🔒 Security

- **JWT Authentication** — Access + Refresh token flow
- **Role-Based Access Control (RBAC)** — Admin vs User permissions
- **Audit Logging** — All admin actions tracked with IP + user agent
- **Optimistic Locking** — Prevents double claims and race conditions
- **Idempotent Settlement** — Safe to retry without side effects
- **bcrypt Password Hashing** — Secure password storage

## 🌍 Environment

- **Timezone:** All game logic runs in **IST (UTC+05:30)**
- **Operating Hours:** 08:00 AM – 11:00 PM IST
- **Game Duration:** 5 minutes each
- **Total Games/Day:** ~180 games (08:00–23:00)

## 📝 License

See [LICENSE](LICENSE) file.
