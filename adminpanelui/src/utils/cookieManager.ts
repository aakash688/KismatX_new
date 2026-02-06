import Cookies from 'js-cookie';

// Cookie configuration
const COOKIE_CONFIG = {
  expires: 7, // 7 days
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // Changed from 'strict' to 'lax' for better cross-tab compatibility
  path: '/',
};

// Cookie keys
const COOKIE_KEYS = {
  ACCESS_TOKEN: 'kismatx_access_token',
  REFRESH_TOKEN: 'kismatx_refresh_token',
  USER_DATA: 'kismatx_user_data',
};

export const CookieManager = {
  // Save tokens to cookies
  saveTokens(accessToken: string, refreshToken: string) {
    Cookies.set(COOKIE_KEYS.ACCESS_TOKEN, accessToken, COOKIE_CONFIG);
    Cookies.set(COOKIE_KEYS.REFRESH_TOKEN, refreshToken, COOKIE_CONFIG);
  },

  // Get tokens from cookies
  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return {
      accessToken: Cookies.get(COOKIE_KEYS.ACCESS_TOKEN) || null,
      refreshToken: Cookies.get(COOKIE_KEYS.REFRESH_TOKEN) || null,
    };
  },

  // Save user data
  saveUser(user: any) {
    Cookies.set(COOKIE_KEYS.USER_DATA, JSON.stringify(user), COOKIE_CONFIG);
  },

  // Get user data
  getUser(): any {
    const userData = Cookies.get(COOKIE_KEYS.USER_DATA);
    return userData ? JSON.parse(userData) : null;
  },

  // Clear all cookies
  clearAll() {
    Cookies.remove(COOKIE_KEYS.ACCESS_TOKEN, { path: '/' });
    Cookies.remove(COOKIE_KEYS.REFRESH_TOKEN, { path: '/' });
    Cookies.remove(COOKIE_KEYS.USER_DATA, { path: '/' });
  },

  // Clear specific cookie
  clear(cookieName: string) {
    Cookies.remove(cookieName, { path: '/' });
  },
};





