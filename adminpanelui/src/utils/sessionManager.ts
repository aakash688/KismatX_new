import { adminService } from '../services/services';

// Session management utilities
export const SessionManager = {
  // Check if user is already logged in and handle it
  async handleAlreadyLoggedIn(userId: string): Promise<boolean> {
    try {
      // Try to kill existing sessions for this user
      await adminService.killUserSessions(userId);
      console.log(`Killed existing sessions for user: ${userId}`);
      return true;
    } catch (error: any) {
      console.error('Failed to kill existing sessions:', error);
      
      // If the error is 404 (user not found), that's okay
      if (error.response?.status === 404) {
        return true;
      }
      
      // For other errors, show a helpful message
      throw new Error(
        'Unable to clear existing sessions. Please contact an administrator to kill your sessions manually, or try again later.'
      );
    }
  },

  // Check session status
  async checkSessionStatus(): Promise<{
    isValid: boolean;
    needsRefresh: boolean;
    error?: string;
  }> {
    try {
      const tokens = localStorage.getItem('kismatx_auth_tokens');
      if (!tokens) {
        return { isValid: false, needsRefresh: false };
      }

      const tokenData = JSON.parse(tokens);
      const tokenAge = Date.now() - tokenData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (tokenAge > maxAge) {
        return { isValid: false, needsRefresh: false, error: 'Session expired' };
      }

      // Check if access token is still valid
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        return { isValid: false, needsRefresh: true };
      }

      return { isValid: true, needsRefresh: false };
    } catch (error) {
      return { isValid: false, needsRefresh: false, error: 'Invalid session data' };
    }
  },

  // Clear all session data
  clearAllSessions(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('kismatx_auth_tokens');
    localStorage.removeItem('kismatx_user_data');
  },

  // Get current user info from storage
  getCurrentUser(): any {
    try {
      const userData = localStorage.getItem('kismatx_user_data');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  }
};
