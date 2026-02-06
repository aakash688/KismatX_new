import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, authService } from '@/services/authService';
import { CookieManager } from '@/utils/cookieManager';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user_id: string, password: string, force_logout?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Initialize auth state from cookies
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const tokens = CookieManager.getTokens();
        const savedUser = CookieManager.getUser();
        
        console.log('🔍 Checking cookies on page load:', {
          hasAccessToken: !!tokens.accessToken,
          hasRefreshToken: !!tokens.refreshToken,
          hasUser: !!savedUser
        });

        // If we have refresh token, try to restore session
        if (tokens.refreshToken) {
          // Set tokens in localStorage for axios interceptor
          if (tokens.accessToken) {
            localStorage.setItem('accessToken', tokens.accessToken);
          }
          localStorage.setItem('refreshToken', tokens.refreshToken);
          
          // Try to validate or refresh tokens
          let isAuthenticated = false;
          
          // First, try using existing access token to get profile
          if (tokens.accessToken) {
            try {
              localStorage.setItem('accessToken', tokens.accessToken);
              const userData = await authService.getProfile();
              console.log('✅ Access token valid, user:', userData);
              if (userData && userData.user_id) {
                setUser(userData);
                CookieManager.saveUser(userData);
                isAuthenticated = true;
              }
            } catch (accessError: any) {
              console.log('⚠️ Access token invalid, trying refresh token...');
              
              // Access token invalid, try refreshing
              if (accessError.response?.status === 401 && tokens.refreshToken) {
                try {
                  const refreshResponse = await authService.refreshToken(tokens.refreshToken);
                  console.log('✅ Token refreshed successfully');
                  
                  // Save new access token
                  const newAccessToken = refreshResponse.accessToken;
                  localStorage.setItem('accessToken', newAccessToken);
                  CookieManager.saveTokens(newAccessToken, tokens.refreshToken);
                  
                  // Now try getting profile again with new token
                  const userData = await authService.getProfile();
                  if (userData && userData.user_id) {
                    console.log('✅ Session restored after token refresh, user:', userData);
                    setUser(userData);
                    CookieManager.saveUser(userData);
                    isAuthenticated = true;
                  }
                } catch (refreshError: any) {
                  console.log('❌ Refresh token also invalid:', refreshError);
                  
                  // Both tokens invalid, clear everything
                  if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
                    console.log('🚫 Both tokens invalid, clearing auth data');
                    CookieManager.clearAll();
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('kismatx_auth_tokens');
                    localStorage.removeItem('kismatx_user_data');
                    setUser(null);
                  }
                }
              } else {
                // Non-auth error, but still clear if it's a 403
                if (accessError.response?.status === 403) {
                  console.log('🚫 Access forbidden, clearing auth data');
                  CookieManager.clearAll();
                  localStorage.removeItem('accessToken');
                  localStorage.removeItem('refreshToken');
                  setUser(null);
                }
              }
            }
          } else {
            // No access token, but have refresh token - try refreshing
            try {
              const refreshResponse = await authService.refreshToken(tokens.refreshToken);
              console.log('✅ Got new access token from refresh token');
              
              const newAccessToken = refreshResponse.accessToken;
              localStorage.setItem('accessToken', newAccessToken);
              CookieManager.saveTokens(newAccessToken, tokens.refreshToken);
              
              // Get user profile
              const userData = await authService.getProfile();
              if (userData && userData.user_id) {
                console.log('✅ Session restored, user:', userData);
                setUser(userData);
                CookieManager.saveUser(userData);
                isAuthenticated = true;
              }
            } catch (refreshError: any) {
              console.log('❌ Refresh token invalid:', refreshError);
              CookieManager.clearAll();
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              setUser(null);
            }
          }
          
          // If we still have saved user data but couldn't authenticate, restore from cache temporarily
          if (!isAuthenticated && savedUser && savedUser.user_id) {
            console.log('⚠️ Using cached user data, will validate on next API call');
            setUser(savedUser);
          }
        } else {
          console.log('⚠️ No tokens found in cookies');
          // Clear any stale localStorage data
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const clearAuth = () => {
    CookieManager.clearAll();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('kismatx_auth_tokens');
    localStorage.removeItem('kismatx_user_data');
    setUser(null);
  };

  const login = async (user_id: string, password: string, force_logout: boolean = false) => {
    try {
      const response = await authService.login({ user_id, password, force_logout });
      console.log('🔐 Login successful, saving tokens to cookies...');
      
      // Save tokens to cookies and localStorage
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      CookieManager.saveTokens(response.accessToken, response.refreshToken);
      CookieManager.saveUser(response.user);
      
      console.log('✅ Tokens saved to cookies:', CookieManager.getTokens());
      
      setUser(response.user);
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = CookieManager.getTokens().refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
    }
  };

  const refreshToken = async () => {
    try {
      const tokens = CookieManager.getTokens();
      if (tokens.refreshToken) {
        const response = await authService.refreshToken(tokens.refreshToken);
        
        // Update tokens in both cookies and localStorage
        localStorage.setItem('accessToken', response.accessToken);
        CookieManager.saveTokens(response.accessToken, tokens.refreshToken);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearAuth();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshToken,
    clearAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
