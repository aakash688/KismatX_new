# KismatX — Node.js Backend

Express.js REST API backend with TypeORM ORM and MySQL/MariaDB database for the KismatX card-betting platform.

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| Express.js | 4.x | HTTP framework |
| TypeORM | 0.3.x | ORM / Database |
| MySQL / MariaDB | 8.x / 10.x | Database |
| JWT | — | Authentication (access + refresh tokens) |
| node-cron | 4.x | Game scheduling |
| bcrypt | 5.x | Password hashing |
| Winston | 3.x | Logging |
| Joi | 17.x | Request validation |
| date-fns / date-fns-tz | — | IST timezone handling |

## Directory Structure

```
src/
├── server.js                   # Entry point (HTTP server)
├── app.js                      # Express app setup (middleware, routes, CORS)
├── config/
│   ├── typeorm.config.js       # TypeORM database configuration
│   └── supabase.config.js      # Supabase client (if used)
├── controllers/
│   ├── authController.js       # Login, register, token refresh
│   ├── bettingController.js    # Place bets, scan-and-claim, cancel, stats
│   ├── gameController.js       # Game info, current/previous games, recent winners
│   ├── userController.js       # User profile, balance
│   ├── walletController.js     # Wallet logs, transactions
│   ├── settingsController.js   # App settings (multiplier, game hours)
│   ├── adminController.js      # Admin user/game management
│   ├── roleController.js       # Role management (admin/user)
│   ├── permissionController.js # Permission management
│   └── admin/
│       ├── adminGameController.js   # Admin game operations (settlement, stats)
│       └── adminStatsController.js  # Financial stats, trends
├── entities/
│   ├── game/
│   │   ├── Game.js             # Game entity (5-min cycles)
│   │   ├── BetSlip.js          # Bet slip entity
│   │   ├── BetDetail.js        # Individual card bets
│   │   └── GameCardTotal.js    # Aggregated card totals per game
│   └── user/
│       ├── User.js             # User entity
│       ├── WalletLog.js        # Transaction log
│       ├── AuditLog.js         # Admin action audit trail
│       ├── LoginHistory.js     # Login tracking
│       ├── RefreshToken.js     # JWT refresh tokens
│       ├── Role.js             # User roles
│       └── Permission.js       # Role permissions
├── middleware/
│   ├── auth.js                 # JWT verification, role authorization
│   ├── errorHandler.js         # Global error handler
│   ├── formatDates.js          # IST date formatting middleware
│   ├── notFoundHandler.js      # 404 handler
│   └── validate.js             # Joi validation middleware
├── routes/
│   ├── index.js                # Route aggregator
│   ├── auth.js                 # /api/auth/*
│   ├── betting.js              # /api/bets/*
│   ├── game.js                 # /api/games/*
│   ├── user.js                 # /api/users/*
│   ├── wallet.js               # /api/wallet/*
│   └── admin.js                # /api/admin/*
├── services/
│   ├── gameService.js          # Game creation, state management
│   ├── bettingService.js       # Bet placement logic
│   ├── settlementService.js    # Winning card selection, payout calculation
│   ├── claimService.js         # Winnings claim (atomic transactions)
│   ├── slipCancellationService.js  # Bet cancellation + refund
│   └── userService.js          # User operations
├── schedulers/
│   └── gameScheduler.js        # node-cron: game creation & settlement
├── migrations/                 # TypeORM database migrations
└── utils/
    ├── timezone.js             # IST conversion utilities
    ├── auditLogger.js          # Audit trail helper
    ├── barcode.js              # Barcode generation
    ├── winningCardSelector.js  # Fair winning card algorithm
    └── ...
```

## Requirements

- **Node.js** ≥ 18.0
- **MySQL** ≥ 8.0 or **MariaDB** ≥ 10.5
- npm or yarn

## Setup

```bash
# From project root:
npm install

# Copy and configure environment
cp env.example .env
```

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database user | `root` |
| `DB_PASSWORD` | Database password | `your_password` |
| `DB_NAME` | Database name | `kismatx` |
| `ACCESS_TOKEN_SECRET` | JWT access token secret | Random string |
| `REFRESH_TOKEN_SECRET` | JWT refresh token secret | Random string |
| `ACCESS_TOKEN_EXPIRY` | Token expiry duration | `24h` |
| `PORT` | Server port | `5001` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |

### Running

```bash
# Initialize database tables
npm run init-db

# Development (with hot reload)
npm run dev

# Production
npm start
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh-token` | Refresh JWT token |
| POST | `/api/auth/logout` | Logout |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/games/current` | Get current active game |
| GET | `/api/games/previousgames/by-date` | Get games for a date |
| GET | `/api/games/recent-winners` | Recent winning slips |

### Betting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bets/place` | Place a bet |
| POST | `/api/bets/scan-and-claim/:id` | Scan barcode & claim winnings |
| POST | `/api/bets/cancel/:id` | Cancel a bet slip |
| GET | `/api/bets/stats` | Betting statistics |
| GET | `/api/bets/history` | Bet history |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/games/live-settlement` | Live settlement dashboard |
| GET | `/api/admin/games/:gameId` | Game details with bets |
| POST | `/api/admin/stats` | Financial statistics |
| GET | `/api/admin/stats/trend` | Daily stats trend |
| POST | `/api/admin/slips/:id/cancel` | Admin cancel a bet |

## Key Features

- **Atomic Transactions** — All financial operations (claim, cancel, settle) use database transactions with pessimistic locking
- **IST Timezone** — All game times are in Indian Standard Time
- **Audit Logging** — All admin actions are logged
- **Idempotent Settlement** — Settlement can run multiple times safely
- **Race Condition Protection** — Pessimistic write locks prevent double claims
