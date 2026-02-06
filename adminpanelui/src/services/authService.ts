import apiClient from './api';
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
  force_logout?: boolean;
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

// Auth Services
export const authService = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH.LOGIN, credentials);
    return response.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post(API_CONFIG.ENDPOINTS.AUTH.LOGOUT, { refreshToken });
  },

  register: async (userData: RegisterRequest): Promise<User> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH.REGISTER, userData);
    return response.data.user;
  },

  refreshToken: async (refreshToken: string): Promise<{ accessToken: string }> => {
    const response = await apiClient.post(API_CONFIG.ENDPOINTS.AUTH.REFRESH, { refreshToken });
    return response.data;
  },

  getProfile: async (): Promise<User> => {
    const response = await apiClient.get(API_CONFIG.ENDPOINTS.USER.PROFILE);
    // Backend returns user object directly, not wrapped in { user: ... }
    return response.data;
  }
};
