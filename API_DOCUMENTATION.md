# KismatX API Documentation

Complete API reference for the KismatX card-betting platform. All endpoints are available on both the Node.js backend and Cloudflare Workers backend with identical request/response formats.

**Base URL (Cloudflare Workers):** `https://kismatx-api.kismatx.workers.dev`
**Base URL (Node.js):** `http://localhost:5001`

## Authentication

All authenticated endpoints require the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Tokens are obtained via the login endpoint and can be refreshed using the refresh token endpoint.

---

## 🔐 Auth Endpoints (`/api/auth`)

### POST `/api/auth/register`
Register a new player account.

**Body:**
```json
{
  "userid": "player001",
  "password": "Player@123",
  "email": "player001@kismatx.com",
  "mobileno": "9876543210"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Registration successful",
  "user": { "id": 1, "userid": "player001", "email": "..." },
  "accessToken": "eyJ...",
  "refreshToken": "..."
}
```

---

### POST `/api/auth/login`
Login with credentials.

**Body:**
```json
{
  "userid": "player001",
  "password": "Player@123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "accessToken": "eyJ...",
  "refreshToken": "...",
  "user": {
    "id": 1,
    "userid": "player001",
    "email": "player001@kismatx.com",
    "deposit_amount": 1000,
    "role": "user",
    "status": "active"
  }
}
```

---

### POST `/api/auth/refresh-token`
Refresh an expired access token.

**Body:**
```json
{
  "refreshToken": "..."
}
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "..."
}
```

---

### POST `/api/auth/logout`
Logout and invalidate the refresh token.

**Headers:** `Authorization: Bearer <accessToken>`

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🎮 Game Endpoints (`/api/games`)

### GET `/api/games/current`
Get the currently active game.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "game_id": "202602061430",
    "start_time": "2026-02-06 14:30:00",
    "end_time": "2026-02-06 14:35:00",
    "status": "active",
    "winning_card": null,
    "payout_multiplier": 10,
    "settlement_status": "not_settled",
    "start_time_ist": "2026-02-06 14:30:00",
    "end_time_ist": "2026-02-06 14:35:00"
  }
}
```

---

### GET `/api/games/previousgames/by-date?date=YYYY-MM-DD`
Get all games for a specific date with the authenticated user's bet slips.

**Auth:** Required

**Query Params:**
- `date` (string, required): Date in `YYYY-MM-DD` format

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "game_date": "2026-02-06",
    "games": [
      {
        "id": "202602061430",
        "start": "2026-02-06 14:30",
        "end": "2026-02-06 14:35",
        "slips": [
          {
            "cards": 3,
            "amount": 50,
            "win_points": 500,
            "barcode": "ABC123XYZ",
            "issue_date_time": "2026-02-06 14:32:15",
            "status": "won",
            "is_cancelled": false,
            "claim_status": true,
            "claimed_at": "2026-02-06 14:36:00"
          }
        ]
      }
    ]
  }
}
```

---

### GET `/api/games/recent-winners`
Get recent winning slips.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "game_id": "202602061430",
      "winning_card": 6,
      "user_id": "player001",
      "payout_amount": 500
    }
  ]
}
```

---

### GET `/api/games/by-date?date=YYYY-MM-DD`
Get all games for a specific date (public, no auth).

---

### GET `/api/games/:gameId`
Get details for a specific game.

---

## 🎰 Betting Endpoints (`/api/bets`)

### POST `/api/bets/place`
Place a bet on the current active game.

**Auth:** Required

**Body:**
```json
{
  "bets": [
    { "card_number": 6, "bet_amount": 10 },
    { "card_number": 3, "bet_amount": 20 },
    { "card_number": 11, "bet_amount": 20 }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Bet placed successfully!",
  "data": {
    "game_id": "202602061430",
    "slip_id": "a1b2c3d4-...",
    "barcode": "ABC123XYZ",
    "total_amount": 50,
    "bets": [
      { "id": 1, "card_number": 6, "bet_amount": 10 },
      { "id": 2, "card_number": 3, "bet_amount": 20 },
      { "id": 3, "card_number": 11, "bet_amount": 20 }
    ],
    "balance_after": 950
  }
}
```

---

### POST `/api/bets/scan-and-claim/:identifier`
Scan a barcode or slip ID to claim winnings.

**Auth:** Required

**Params:**
- `identifier` (string): Barcode or slip_id

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Winnings claimed successfully",
  "data": {
    "slip_id": "a1b2c3d4-...",
    "barcode": "ABC123XYZ",
    "payout_amount": 500,
    "claimed_at": "2026-02-06 14:36:00",
    "game": {
      "game_id": "202602061430",
      "winning_card": 6,
      "settlement_status": "settled"
    },
    "bets": [
      { "card_number": 6, "bet_amount": 10, "is_winner": true, "payout_amount": 100 }
    ],
    "balance_after": 1500
  }
}
```

---

### POST `/api/bets/cancel/:identifier`
Cancel a bet slip (before game ends).

**Auth:** Required

**Params:**
- `identifier` (string): Barcode or slip_id

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Bet slip cancelled successfully",
  "data": {
    "slip_id": "a1b2c3d4-...",
    "refund_amount": 50,
    "balance_after": 1050
  }
}
```

---

### GET `/api/bets/stats?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
Get betting statistics for the authenticated user.

**Auth:** Required

**Query Params:**
- `date_from` (optional): Start date
- `date_to` (optional): End date
- `game_id` (optional): Specific game ID

---

### GET `/api/bets/my-bets`
Get the authenticated user's bet history.

**Auth:** Required

---

### GET `/api/bets/slip/:identifier`
Get details for a specific bet slip.

**Auth:** Required

---

### GET `/api/bets/result/:identifier`
Get the result of a specific bet slip.

**Auth:** Required

---

### GET `/api/bets/daily`
Get daily betting summary for the authenticated user.

**Auth:** Required

---

## 👤 User Endpoints (`/api/user`)

### GET `/api/user/me`
Get current authenticated user's profile.

**Auth:** Required

---

### GET `/api/user/profile`
Get current user's full profile.

**Auth:** Required

---

### PUT `/api/user/profile`
Update current user's profile.

**Auth:** Required

**Body:**
```json
{
  "email": "newemail@example.com",
  "mobileno": "9876543211"
}
```

---

### GET `/api/user/wallet-info`
Get current user's wallet information and balance.

**Auth:** Required

---

### PUT `/api/user/password`
Change password.

**Auth:** Required

**Body:**
```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewPass@456"
}
```

---

## 💰 Wallet Endpoints (`/api/wallet`)

### GET `/api/wallet/:user_id`
Get wallet transaction history for a user.

**Auth:** Required

---

### GET `/api/wallet/logs`
Get all wallet logs (Admin only).

**Auth:** Required (Admin)

---

### GET `/api/wallet/summary/:user_id`
Get wallet summary for a user (Admin only).

**Auth:** Required (Admin)

---

### POST `/api/wallet/transaction`
Create a manual wallet transaction (deposit/withdrawal) (Admin only).

**Auth:** Required (Admin)

**Body:**
```json
{
  "user_id": 1,
  "amount": 500,
  "transaction_type": "deposit",
  "transaction_direction": "credit",
  "comment": "Manual deposit"
}
```

---

## 👑 Admin Endpoints (`/api/admin`)

### GET `/api/admin/dashboard`
Get admin dashboard overview statistics.

**Auth:** Required (Admin)

---

### GET `/api/admin/users`
List all users with pagination.

**Auth:** Required (Admin)

**Query Params:** `page`, `limit`, `search`, `status`

---

### GET `/api/admin/users/:id`
Get a specific user's details.

**Auth:** Required (Admin)

---

### POST `/api/admin/users`
Create a new user (Admin-created).

**Auth:** Required (Admin)

---

### PUT `/api/admin/users/:id`
Update a user's details.

**Auth:** Required (Admin)

---

### PUT `/api/admin/users/:id/status`
Update a user's status (active/banned/suspended).

**Auth:** Required (Admin)

---

### POST `/api/admin/users/:id/reset-password`
Reset a user's password.

**Auth:** Required (Admin)

---

### DELETE `/api/admin/users/:id`
Delete a user.

**Auth:** Required (Admin)

---

### GET `/api/admin/games`
List all games with pagination and filters.

**Auth:** Required (Admin)

**Query Params:** `page`, `limit`, `status`, `date`

---

### GET `/api/admin/games/live-settlement`
Get real-time settlement dashboard with current, previous, and upcoming games.

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId`
Get detailed game information including all bet slips and cancellation status.

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId/bets`
Get all bets for a specific game with cancellation flags.

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId/stats`
Get statistics for a specific game (excluding cancelled slips).

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId/users`
Get all users who placed bets in a specific game.

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId/settlement-report`
Get the settlement report for a game.

**Auth:** Required (Admin)

---

### GET `/api/admin/games/:gameId/settlement-decision`
Get AI/algorithm decision info for settlement.

**Auth:** Required (Admin)

---

### POST `/api/admin/games/:gameId/settle`
Manually settle a game with a chosen winning card.

**Auth:** Required (Admin)

**Body:**
```json
{
  "winning_card": 6
}
```

---

### POST `/api/admin/stats`
Get financial statistics for a date range.

**Auth:** Required (Admin)

**Body:**
```json
{
  "startDate": "2026-02-01",
  "endDate": "2026-02-06",
  "userId": 1
}
```

---

### GET `/api/admin/stats/trend`
Get daily statistics trend.

**Auth:** Required (Admin)

**Query Params:** `days` (default: 7)

---

### POST `/api/admin/slips/:identifier/cancel`
Admin cancel a bet slip (can cancel anytime).

**Auth:** Required (Admin)

---

### GET `/api/admin/settings`
Get all application settings.

**Auth:** Required (Admin)

---

### PUT `/api/admin/settings`
Update application settings.

**Auth:** Required (Admin)

**Body:**
```json
{
  "key": "payout_multiplier",
  "value": "10"
}
```

---

### GET `/api/admin/audit-logs`
Get audit log history.

**Auth:** Required (Admin)

**Query Params:** `page`, `limit`, `action`, `user_id`

---

### GET `/api/admin/logins`
Get login history.

**Auth:** Required (Admin)

---

### GET `/api/admin/settings/logs`
Get settings change logs.

**Auth:** Required (Admin)

---

## ⚙️ Settings Endpoints (`/api/settings`)

### GET `/api/settings/public`
Get public application settings (no auth required).

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "payout_multiplier": "10",
    "game_start_time": "08:00",
    "game_end_time": "23:00",
    "game_result_type": "auto"
  }
}
```

---

## 🔧 System Endpoints

### GET `/`
API status check.

### GET `/health`
Health check.

### GET `/api/db-health`
Database health check with table row counts and sizes.

### GET `/api/diagnostic`
Diagnostic information (game counts, settings, unsettled games).

### GET `/api/recovery`
Trigger manual recovery (create missing games, settle stuck games).

### GET `/api/trigger-cron`
Manually trigger cron logic (for debugging).

---

## 📋 Postman Collection

Import the Postman collection from `postman_collection/KismatX_API_Complete_Collection.json` for ready-to-use API testing.

### Setup in Postman:
1. Import the collection file
2. Set the `baseUrl` collection variable:
   - **Cloudflare Workers:** `https://kismatx-api.kismatx.workers.dev`
   - **Node.js Local:** `http://localhost:5001`
3. Login using the Auth endpoints — tokens are auto-saved to collection variables
4. All authenticated requests will automatically use the saved token

### Collection Variables:
| Variable | Description | Auto-Saved |
|----------|-------------|------------|
| `baseUrl` | API base URL | No (set manually) |
| `accessToken` | JWT access token | Yes (on login) |
| `refreshToken` | JWT refresh token | Yes (on login) |
| `adminToken` | Admin access token | Yes (on admin login) |
| `userId` | Current user ID | Yes (on login) |
