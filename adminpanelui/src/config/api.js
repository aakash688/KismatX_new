// Get API base URL from environment variables
// Vite requires variables to be prefixed with VITE_ to be exposed to client
const getApiBaseUrl = () => {
  // Access environment variables via import.meta.env
  // This is the correct way to access Vite environment variables
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  
  // ALWAYS log in development (even before checks)
  console.log('🔍 Environment Variable Check:', {
    'import.meta.env exists?': !!import.meta.env,
    'VITE_API_BASE_URL raw': envUrl,
    'Type': typeof envUrl,
    'All env keys': Object.keys(import.meta.env),
    'All VITE_ keys': Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
  });
  
  // Validate and use environment variable, fallback to default
  let baseUrl;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    baseUrl = envUrl.trim();
    console.log('✅ Using .env value:', baseUrl);
  } else {
    baseUrl = 'http://192.168.1.100:5001';
    console.error('❌ VITE_API_BASE_URL not found or empty!');
    console.error('   Current value:', envUrl);
    console.error('   Using default:', baseUrl);
    console.error('   Solution:');
    console.error('   1. Check adminpanelui/.env file exists');
    console.error('   2. Verify it contains: VITE_API_BASE_URL=http://192.168.1.108:5001');
    console.error('   3. Restart dev server: npm run dev');
  }
  
  // Ensure URL doesn't end with trailing slash
  const finalUrl = baseUrl.replace(/\/$/, '');
  
  // Log final configuration
  console.log('🔧 FINAL API Configuration:', {
    'Base URL': finalUrl,
    'Mode': import.meta.env.MODE,
    'Is Dev': import.meta.env.DEV
  });
  
  return finalUrl;
};

// Calculate base URL once at module load
const BASE_URL_VALUE = getApiBaseUrl();

// Base API configuration
// NOTE: BASE_URL is evaluated immediately when module loads
// If .env changes, you MUST restart the dev server
export const API_CONFIG = {
  BASE_URL: BASE_URL_VALUE,
  ENDPOINTS: {
    AUTH: {
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
      REFRESH: '/api/auth/refresh-token',
      REGISTER: '/api/auth/register',
      FORGOT_PASSWORD: '/api/auth/forgot-password'
    },
    USER: {
      PROFILE: '/api/user/profile',
      UPDATE_PROFILE: '/api/user/profile',
      CHANGE_PASSWORD: '/api/user/change-password',
      PERMISSIONS: '/api/user/permissions'
    },
    ADMIN: {
      DASHBOARD: '/api/admin/dashboard',
      USERS: '/api/admin/users',
      USER_BY_ID: (id) => `/api/admin/users/${id}`,
      USER_STATUS: (id) => `/api/admin/users/${id}/status`,
      USER_RESET_PASSWORD: (id) => `/api/admin/users/${id}/reset-password`,
      USER_VERIFY_EMAIL: (id) => `/api/admin/users/${id}/verify-email`,
      USER_VERIFY_MOBILE: (id) => `/api/admin/users/${id}/verify-mobile`,
      USER_LOGIN_HISTORY: (id) => `/api/admin/users/${id}/logins`,
      USER_ROLES: (id) => `/api/admin/users/${id}/roles`,
      USER_SESSIONS_KILL: (user_id) => `/api/admin/users/${user_id}/sessions/kill`,
      USER_SESSIONS_ACTIVE: (user_id) => `/api/admin/users/${user_id}/sessions/active`,
      ROLES: '/api/admin/roles',
      ROLE_BY_ID: (id) => `/api/admin/roles/${id}`,
      ROLE_PERMISSIONS: (id) => `/api/admin/roles/${id}/permissions`,
      PERMISSIONS: '/api/admin/permissions',
      PERMISSION_BY_ID: (id) => `/api/admin/permissions/${id}`,
      AUDIT_LOGS: '/api/admin/audit-logs',
      SETTINGS: '/api/admin/settings',
      SETTINGS_LOGS: '/api/admin/settings/logs',
      GAMES: '/api/admin/games',
      GAME_STATS: (gameId) => `/api/admin/games/${gameId}/stats`,
      GAME_BETS: (gameId) => `/api/admin/games/${gameId}/bets`,
      GAME_USERS: (gameId) => `/api/admin/games/${gameId}/users`,
      GAME_SETTLEMENT_REPORT: (gameId) => `/api/admin/games/${gameId}/settlement-report`,
      GAME_SETTLEMENT_DECISION: (gameId) => `/api/admin/games/${gameId}/settlement-decision`,
      GAME_SETTLE: (gameId) => `/api/admin/games/${gameId}/settle`,
      GAME_LIVE_SETTLEMENT: '/api/admin/games/live-settlement'
    },
    WALLET: {
      TRANSACTION: '/api/wallet/transaction',
      USER_TRANSACTIONS: (user_id) => `/api/wallet/${user_id}`,
      TRANSACTION_BY_ID: (id) => `/api/wallet/transaction/${id}`,
      LOGS: '/api/wallet/logs',
      SUMMARY: (user_id) => `/api/wallet/summary/${user_id}`,
    },
    SYSTEM: {
      HEALTH: '/api/health'
    }
  }
};

// Helper function to build full URL
export const buildApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Environment configuration
export const ENV_CONFIG = {
  NODE_ENV: import.meta.env.MODE,
  IS_DEVELOPMENT: import.meta.env.DEV,
  IS_PRODUCTION: import.meta.env.PROD
};

