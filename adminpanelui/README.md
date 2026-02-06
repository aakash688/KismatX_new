# KismatX — Admin Panel

React + TypeScript admin dashboard for the KismatX card-betting platform. Deployed on Cloudflare Pages.

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 4.x | Build tool & dev server |
| Tailwind CSS | 3.x | Utility-first styling |
| Radix UI | — | Accessible UI primitives |
| React Router | 6.x | Client-side routing |
| React Hook Form | 7.x | Form management |
| Recharts | 2.x | Charts & graphs |
| Axios | 1.x | HTTP client |
| Zod | 3.x | Schema validation |
| Lucide React | — | Icons |

## Directory Structure

```
adminpanelui/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── env.example
└── src/
    ├── main.tsx                # Entry point
    ├── App.tsx                 # Root component with routing
    ├── index.css               # Global styles (Tailwind imports)
    ├── config/
    │   └── api.js              # API base URL configuration
    ├── contexts/
    │   └── AuthContext.tsx      # Authentication state management
    ├── services/
    │   ├── api.ts              # Axios instance with interceptors
    │   ├── authService.ts      # Login, logout, token refresh
    │   └── services.ts         # API service functions (games, users, bets, stats)
    ├── pages/
    │   ├── LoginPage.tsx       # Admin login
    │   ├── DashboardPage.tsx   # Overview dashboard
    │   ├── GamesPage.tsx       # Game listing & management
    │   ├── GameDetailPage.tsx  # Single game details with bets
    │   ├── LiveSettlementPage.tsx  # Real-time settlement monitor
    │   ├── StatsPage.tsx       # Financial statistics & trends
    │   ├── UsersPage.tsx       # User management
    │   ├── UserDetailPage.tsx  # Single user details
    │   ├── BetsPage.tsx        # All bets listing
    │   ├── SettingsPage.tsx    # App settings (multiplier, hours)
    │   ├── AuditLogsPage.tsx   # Audit trail viewer
    │   ├── WalletPage.tsx      # Wallet transaction logs
    │   └── ...
    ├── components/
    │   ├── Layout.tsx          # App shell (sidebar + header)
    │   ├── UserForm.tsx        # User create/edit form
    │   ├── ResetPasswordDialog.tsx
    │   └── ui/                 # Reusable UI components (shadcn/ui)
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dialog.tsx
    │       ├── input.tsx
    │       ├── select.tsx
    │       ├── table.tsx
    │       ├── tabs.tsx
    │       └── ...
    ├── utils/
    │   ├── cookieManager.ts    # Auth cookie handling
    │   └── sessionManager.ts   # Session storage helpers
    ├── lib/
    │   └── utils.ts            # Tailwind merge utility (cn function)
    └── assets/
        └── skillcard/          # Card images (12 cards)
            ├── Butterfly.png
            ├── Cow.png
            ├── Diva.png
            └── ...
```

## Requirements

- **Node.js** ≥ 18.0
- npm or yarn

## Setup

   ```bash
cd adminpanelui
   npm install

# Configure API endpoint
   cp env.example .env
   ```
   
### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `https://kismatx-api.kismatx.workers.dev` |

### Development

   ```bash
   npm run dev
# Opens at http://localhost:5173
```

### Production Build

```bash
npm run build
# Output in dist/
```

### Deploy to Cloudflare Pages

```bash
# Connect GitHub repo to Cloudflare Pages
# Build command: cd adminpanelui && npm install && npm run build
# Build output directory: adminpanelui/dist
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Admin authentication |
| Dashboard | `/` | Overview with key metrics |
| Games | `/games` | All games with filters |
| Game Detail | `/games/:gameId` | Bets, settlement, card breakdown |
| Live Settlement | `/live-settlement` | Real-time game monitoring |
| Stats | `/stats` | Financial stats with date range |
| Users | `/users` | User management (create, edit, status) |
| User Detail | `/users/:userId` | User profile, bets, wallet |
| Bets | `/bets` | All bets with search |
| Settings | `/settings` | Multiplier, game hours, app config |
| Audit Logs | `/audit-logs` | Admin action history |

## 🌐 Live URLs

| Component | URL |
|-----------|-----|
| **Admin Panel** (Production) | [https://kismatx-admin.pages.dev](https://kismatx-admin.pages.dev) |
| **API Backend** (Cloudflare Workers) | [https://kismatx-api.kismatx.workers.dev](https://kismatx-api.kismatx.workers.dev) |

## 🔌 Connecting to API

The admin panel communicates with the backend via the `VITE_API_BASE_URL` environment variable. For the live deployment:

```
VITE_API_BASE_URL=https://kismatx-api.kismatx.workers.dev
```

For Cloudflare Pages deployment, set this as an environment variable in the Pages dashboard:
1. Go to Cloudflare Dashboard → Pages → kismatx-admin
2. Settings → Environment Variables
3. Add: `VITE_API_BASE_URL` = `https://kismatx-api.kismatx.workers.dev`
