import apiClient from './api';
// @ts-ignore - JS config module without type declarations
import { API_CONFIG } from '../config/api';

// Types
export interface User {
  id: number;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  alternate_mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  region?: string;
  status: 'active' | 'inactive' | 'banned' | 'pending';
  deposit_amount?: number;
  profile_pic?: string;
  user_type: 'admin' | 'moderator' | 'player';
  created_at: string;
  updated_at: string;
  last_login?: string;
  email_verified: boolean;
  mobile_verified: boolean;
  is_email_verified_by_admin: boolean;
  is_mobile_verified_by_admin: boolean;
  roles?: Role[];
}

export interface Role {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: Permission[];
}

export interface Permission {
  id: number;
  name: string;
  description: string;
  resource: string;
  action: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  user_id: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RegisterRequest {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  password: string;
  user_type: 'admin' | 'moderator' | 'player';
  deposit_amount?: number;
  profile_pic?: string;
  alternate_mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  region?: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  totalDeposits: number;
  recentLogins: number;
  adminActions: number;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  admin_id?: number;
  action: string;
  target_type: string;
  target_id?: number;
  details: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface LoginHistory {
  id: number;
  user_id?: number;
  login_time: string;
  ip_address?: string;
  device_info?: string;
  user_agent?: string;
  login_method: string;
  is_successful: boolean;
  failure_reason?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Auth Services moved to authService.ts to avoid circular dependency

// User Services
export const userService = {
  getProfile: async (): Promise<User> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE);
    return response.data.user;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.USER.UPDATE_PROFILE, data);
    return response.data.user;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post(API_CONFIG.ENDPOINTS.USER.CHANGE_PASSWORD, {
      currentPassword,
      newPassword
    });
  },

  getPermissions: async (): Promise<Permission[]> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PERMISSIONS);
    return response.data.permissions;
  }
};

// Admin Services
export const adminService = {
  getDashboard: async (): Promise<DashboardStats> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.DASHBOARD);
    return response.data;
  },

  getUsers: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<{ users: User[]; total: number; page: number; limit: number }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.USERS, { params });
    return response.data;
  },

  getUserById: async (id: string): Promise<User> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.USER_BY_ID(id));
    return response.data.user;
  },

  createUser: async (userData: RegisterRequest): Promise<User> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.USERS, userData);
    return response.data.user;
  },

  updateUser: async (id: string, data: Partial<User>): Promise<User> => {
    console.log('🌐 Updating user via API:', id, data);
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.USER_BY_ID(id), data);
    console.log('📊 Update user API response:', response.data);
    return response.data.user;
  },

  updateUserStatus: async (id: string, status: string): Promise<User> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.USER_STATUS(id), { status });
    return response.data.user;
  },

  resetUserPassword: async (id: string, newPassword: string): Promise<void> => {
    await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.USER_RESET_PASSWORD(id), { newPassword });
  },

  verifyUserEmail: async (id: string): Promise<User> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.USER_VERIFY_EMAIL(id));
    return response.data.user;
  },

  verifyUserMobile: async (id: string): Promise<User> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.USER_VERIFY_MOBILE(id));
    return response.data.user;
  },

  getUserLoginHistory: async (id: string, params?: {
    page?: number;
    limit?: number;
  }): Promise<{ logins: LoginHistory[]; total: number }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.USER_LOGIN_HISTORY(id), { params });
    return response.data;
  },

  getUserActiveSessions: async (user_id: string): Promise<{ activeSessions: number }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.USER_SESSIONS_ACTIVE(user_id));
    return response.data;
  },

  killUserSessions: async (user_id: string): Promise<{ revokedCount: number }> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.USER_SESSIONS_KILL(user_id));
    return response.data;
  },

  getRoles: async (): Promise<Role[]> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.ROLES);
    return response.data.roles;
  },

  createRole: async (roleData: Partial<Role>): Promise<Role> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.ROLES, roleData);
    return response.data.role;
  },

  updateRole: async (id: string, data: Partial<Role>): Promise<Role> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.ROLE_BY_ID(id), data);
    return response.data.role;
  },

  assignRolePermissions: async (id: string, permissionIds: number[]): Promise<void> => {
    await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.ROLE_PERMISSIONS(id), { permission_ids: permissionIds });
  },

  getUserRoles: async (id: string): Promise<Role[]> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.USER_ROLES(id));
    return response.data.roles;
  },

  assignUserRoles: async (id: string, roleIds: number[]): Promise<void> => {
    await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.USER_ROLES(id), { role_ids: roleIds });
  },

  getPermissions: async (): Promise<Permission[]> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.PERMISSIONS);
    return response.data.permissions;
  },

  createPermission: async (permissionData: Partial<Permission>): Promise<Permission> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.PERMISSIONS, permissionData);
    return response.data.permission;
  },

  updatePermission: async (id: string, data: Partial<Permission>): Promise<Permission> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.PERMISSION_BY_ID(id), data);
    return response.data.permission;
  },

  getAuditLogs: async (params?: {
    page?: number;
    limit?: number;
    action?: string;
    user_id?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.AUDIT_LOGS, { params });
    return response.data;
  },

  getLoginHistory: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ logins: LoginHistory[]; total: number }> => {
    const response = await apiClient.get('/api/admin/logins', { params });
    return response.data;
  }
};

// Stats Interfaces
export interface StatsData {
  totalWagered: number;
  totalScanned: number;
  margin: number;
  netToPay: number;
}

export interface UserStatsData {
  user: User;
  wagered: number;
  scanned: number;
  margin: number;
  netToPay: number;
}

export interface StatsResponse {
  summary: StatsData;
  userStats: UserStatsData[];
}

// Stats Service
export const statsService = {
  getStats: async (startDate: string, endDate: string, userId?: string | null): Promise<StatsResponse> => {
    const payload: any = { startDate, endDate };
    if (userId && userId !== 'all') {
      payload.userId = userId;
    }
    const response = await apiClient.post('/api/admin/stats', payload);
    return response.data.data;
  },

  getStatsTrend: async (startDate: string, endDate: string): Promise<any[]> => {
    const response = await apiClient.get('/api/admin/stats/trend', {
      params: { startDate, endDate }
    });
    return response.data.data;
  }
};

// Wallet Transaction Interface
export interface WalletTransaction {
  id: number;
  user_id: number;
  user_name?: string;
  transaction_type: 'recharge' | 'withdrawal' | 'game';
  amount: number;
  transaction_direction: 'credit' | 'debit';
  game_id?: number;
  comment?: string;
  created_at: string;
}

export interface CreateTransactionRequest {
  user_id: number;
  transaction_type: 'recharge' | 'withdrawal' | 'game';
  amount: number;
  transaction_direction: 'credit' | 'debit';
  game_id?: number;
  comment?: string;
}

export interface TransactionResponse {
  transaction: WalletTransaction;
  user: {
    id: number;
    user_id: string;
    previous_balance: number;
    new_balance: number;
  };
}

export interface WalletLog {
  id: number;
  user_id: number;
  user_name: string;
  user_code?: string;
  transaction_type: 'recharge' | 'withdrawal' | 'game';
  amount: number;
  transaction_direction: 'credit' | 'debit';
  comment?: string;
  created_at: string;
}

export interface WalletSummary {
  user: { id: number; user_id: string; first_name: string; last_name: string };
  balance: number;
  total_credits: number;
  total_debits: number;
  total_transactions: number;
}

// Wallet Services
export const walletService = {
  createTransaction: async (data: CreateTransactionRequest): Promise<TransactionResponse> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.WALLET.TRANSACTION, data);
    return response.data;
  },

  getUserTransactions: async (
    user_id: string,
    params?: {
      page?: number;
      limit?: number;
      transaction_type?: string;
      direction?: string;
      date_from?: string;
      date_to?: string;
    }
  ): Promise<{ transactions: WalletTransaction[]; pagination: PaginationMeta }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.WALLET.USER_TRANSACTIONS(user_id), { params });
    return response.data;
  },

  getTransactionById: async (id: string): Promise<{ transaction: WalletTransaction }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.WALLET.TRANSACTION_BY_ID(id));
    return response.data;
  },

  updateTransaction: async (id: string, comment: string): Promise<{ transaction: WalletTransaction }> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.WALLET.TRANSACTION_BY_ID(id), { comment });
    return response.data;
  },

  deleteTransaction: async (id: string): Promise<{ message: string }> => {
    const response = await apiClient.delete(API_CONFIG.ENDPOINTS.WALLET.TRANSACTION_BY_ID(id));
    return response.data;
  },
  getAllWalletLogs: async (params?: {
    page?: number;
    limit?: number;
    user_id?: string|number;
    transaction_type?: string;
    direction?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
  }): Promise<{ logs: WalletLog[]; pagination: PaginationMeta }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.WALLET.LOGS, { params });
    // Backend returns { success: true, data: { logs: [...], pagination: {...} } }
    return response.data.data || response.data;
  },
  getUserWalletSummary: async (user_id: string|number): Promise<WalletSummary> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.WALLET.SUMMARY(user_id.toString()));
    // Backend returns { success: true, data: { user: {...}, stats: {...} } }
    return response.data.data || response.data;
  }
};

// Game Management Interfaces
export interface Game {
  id: number;
  game_id: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'active' | 'completed';
  winning_card?: number;
  payout_multiplier: number;
  settlement_status: 'not_settled' | 'settling' | 'settled' | 'error';
  settlement_started_at?: string;
  settlement_completed_at?: string;
  settlement_error?: string;
  created_at: string;
  updated_at: string;
  total_wagered?: number; // Total betting amount received for this game
}

export interface GameStats {
  game: Game;
  statistics: {
    total_slips: number;
    total_wagered: number;
    total_payout: number;
    profit: number;
    slip_breakdown: {
      pending: number;
      won: number;
      lost: number;
    };
  };
  card_totals: Array<{
    card_number: number;
    total_bet_amount: number;
  }>;
}

export interface GameBet {
  slip_id: string;
  barcode: string;
  user: {
    id: number;
    user_id: string;
    first_name: string;
    last_name: string;
  } | null;
  total_amount: number;
  payout_amount: number;
  status: 'pending' | 'won' | 'lost' | 'settled';
  claimed: boolean;
  claimed_at?: string;
  created_at: string;
  bets: Array<{
    card_number: number;
    bet_amount: number;
    is_winner: boolean;
    payout_amount: number;
  }>;
}

export interface GameUserTotals {
  total_bet_amount: number;
  total_winning_amount: number;
  total_claimed_amount: number;
}

export interface GameUserStat {
  user: {
    id: number;
    user_id: string;
    first_name: string;
    last_name: string;
  };
  totals: GameUserTotals;
}

export interface SettlementReport {
  game: {
    game_id: string;
    start_time: string;
    end_time: string;
    winning_card: number;
    payout_multiplier: number;
    settlement_status: string;
    settlement_completed_at?: string;
  };
  summary: {
    total_winning_slips: number;
    total_payout: number;
    claim_summary: {
      claimed: {
        count: number;
        amount: number;
      };
      unclaimed: {
        count: number;
        amount: number;
      };
    };
  };
  winning_slips: Array<{
    slip_id: string;
    barcode: string;
    user_id: number;
    total_amount: number;
    payout_amount: number;
    claimed: boolean;
    claimed_at?: string;
    created_at: string;
    winning_bets: Array<{
      card_number: number;
      bet_amount: number;
      payout_amount: number;
    }>;
  }>;
}

export interface CardAnalysis {
  card_number: number;
  total_bet_amount: number;
  total_payout: number;
  profit: number;
  profit_percentage: number;
  winning_slips_count: number;
  losing_slips_count: number;
  bets_count: number;
}

export interface SettlementDecisionData {
  game: {
    game_id: string;
    start_time: string;
    end_time: string;
    status: 'pending' | 'active' | 'completed';
    payout_multiplier: number;
    settlement_status: 'not_settled' | 'settling' | 'settled' | 'error';
  };
  summary: {
    total_wagered: number;
    total_slips: number;
    total_bets: number;
  };
  card_analysis: CardAnalysis[];
}

export interface SettleGameRequest {
  winning_card: number; // 1-12
}

export interface SettleGameResponse {
  success: boolean;
  message: string;
  data: {
    game_id: string;
    winning_card: number;
    total_slips: number;
    winning_slips: number;
    total_wagered: number;
    total_payout: number;
    profit: number;
    settlement_status: string;
  };
}

export interface LiveSettlementData {
  mode: 'auto' | 'manual';
  current_game: {
    game_id: string;
    start_time: string;
    end_time: string;
    start_time_display?: string;  // Pre-formatted display string (e.g., "02:10:00 AM")
    end_time_display?: string;    // Pre-formatted display string (e.g., "02:15:00 AM")
    status: 'pending' | 'active' | 'completed';
    settlement_status: 'not_settled' | 'settling' | 'settled' | 'error';
    payout_multiplier: number;
    total_wagered: number;
    total_slips: number;
    card_stats: Array<{
      card_number: number;
      total_bet_amount: number;
      total_payout: number;
      profit: number;
      profit_percentage: number;
      bets_count: number;
    }>;
    time_remaining_seconds: number;
    is_completed: boolean;
    is_in_settlement_window: boolean;
    settlement_window_remaining_ms: number;
    users?: Array<{
      id: number;
      user_id: string;
      first_name: string;
      last_name: string;
      roles?: string[];
    }>;
    selected_user_id?: number;
  } | null;
  recent_games: Array<{
    game_id: string;
    winning_card: number;
    end_time: string;
    end_time_display?: string;
  }>;
}

// Game Services
export const gameService = {
  listGames: async (params?: {
    page?: number;
    limit?: number;
    status?: 'pending' | 'active' | 'completed';
    settlement_status?: 'not_settled' | 'settling' | 'settled' | 'error';
    date?: string; // YYYY-MM-DD
  }): Promise<{ data: Game[]; pagination: PaginationMeta }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAMES, { params });
    return response.data;
  },

  getGameStats: async (gameId: string): Promise<GameStats> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_STATS(gameId));
    // Backend returns { success: true, data: {...} }
    return response.data.data || response.data;
  },

  getSettlementDecisionData: async (gameId: string): Promise<SettlementDecisionData> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_SETTLEMENT_DECISION(gameId));
    return response.data.data || response.data;
  },

  getGameBets: async (
    gameId: string,
    params?: {
      page?: number;
      limit?: number;
    }
  ): Promise<{ data: GameBet[]; pagination: PaginationMeta }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_BETS(gameId), { params });
    // Backend returns { success: true, data: [...], pagination: {...} }
    return response.data;
  },

  getSettlementReport: async (gameId: string): Promise<SettlementReport> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_SETTLEMENT_REPORT(gameId));
    // Backend returns { success: true, data: {...} }
    return response.data.data || response.data;
  },

  getGameUserStats: async (gameId: string): Promise<GameUserStat[]> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_USERS(gameId));
    // Backend returns { success: true, data: [...] }
    const data = response.data.data || response.data;
    return Array.isArray(data) ? data : [];
  },

  settleGame: async (gameId: string, data: SettleGameRequest): Promise<SettleGameResponse> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.ADMIN.GAME_SETTLE(gameId), data);
    return response.data;
  },

  getLiveSettlementData: async (params?: { user_id?: number }): Promise<LiveSettlementData> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.GAME_LIVE_SETTLEMENT, { params });
    return response.data.data || response.data;
  }
};

// Settings Interface
export interface GameSettings {
  game_multiplier: string;
  maximum_limit: string;
  game_start_time: string;
  game_end_time: string;
  game_result_type: 'auto' | 'manual';
}

export interface SettingsResponse {
  settings: GameSettings;
  raw: Record<string, string>;
}

// Settings Log Interface
export interface SettingsLog {
  id: number;
  setting_key: string;
  previous_value: string | null;
  new_value: string;
  admin_id: number;
  admin_name: string | null;
  admin_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Settings Services
export const settingsService = {
  getSettings: async (): Promise<SettingsResponse> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.SETTINGS);
    return response.data;
  },

  updateSettings: async (settings: Partial<GameSettings>): Promise<{ message: string; settings: Partial<GameSettings> }> => {
    const response = await apiClient.put(API_CONFIG.ENDPOINTS.ADMIN.SETTINGS, settings);
    return response.data;
  },

  getSettingsLogs: async (params?: {
    page?: number;
    limit?: number;
    setting_key?: string;
    admin_id?: string;
    date_from?: string;
    date_to?: string;
    sort_by?: string;
    sort_order?: string;
  }): Promise<{ logs: SettingsLog[]; pagination: PaginationMeta }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.ADMIN.SETTINGS_LOGS, { params });
    return response.data;
  }
};

// System Services
export const systemService = {
  healthCheck: async (): Promise<{ status: string; timestamp: string }> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.SYSTEM.HEALTH);
    return response.data;
  }
};
