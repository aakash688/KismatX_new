// JWT Token Utilities
// Handles JWT token generation and validation

import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || "youraccesstokensecret";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "yourrefreshtokensecret";

/**
 * Parse expiry string to milliseconds
 * Supports: '15m', '1h', '24h', '7d', etc.
 */
function parseExpiryToMs(expiry) {
  if (!expiry) return 24 * 60 * 60 * 1000; // Default 24 hours
  
  const unit = expiry.slice(-1).toLowerCase();
  const value = parseInt(expiry.slice(0, -1));
  
  if (isNaN(value)) return 24 * 60 * 60 * 1000; // Default 24 hours
  
  switch (unit) {
    case 's': return value * 1000; // seconds
    case 'm': return value * 60 * 1000; // minutes
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    default: return 24 * 60 * 60 * 1000; // Default 24 hours
  }
}

// Token expiry times
// Access token: Can be overridden via ACCESS_TOKEN_EXPIRY environment variable (format: '1h', '24h', '7d', etc.)
// Default: 24 hours (1 day)
const accessTokenExpiryString = process.env.ACCESS_TOKEN_EXPIRY || '24h';
export const accessTokenExpiryMs = parseExpiryToMs(accessTokenExpiryString);
export const refreshTokenExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate access token
 * @param {Object} user - User object
 * @returns {string} Access token
 */
export const generateAccessToken = (user) => {
  try {
    // Use last_login timestamp as session version to invalidate old tokens when new login occurs
    const sessionVersion = user.last_login ? new Date(user.last_login).getTime() : Date.now();
    
    const payload = {
      id: user.id,
      user_id: user.user_id,
      email: user.email,
      role: user.roles ? user.roles.map(role => role.id) : [],
      sessionVersion: sessionVersion // Include session version to invalidate old tokens
    };

    // Use the same expiry format for jwt.sign (it accepts the same format)
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
      expiresIn: accessTokenExpiryString,
      issuer: 'your-app-name',
      audience: 'your-app-users'
    });
  } catch (error) {
    throw new Error('Failed to generate access token');
  }
};

/**
 * Generate refresh token
 * @param {Object} user - User object
 * @returns {string} Refresh token
 */
export const generateRefreshToken = (user) => {
  try {
    const payload = {
      id: user.id,
      user_id: user.user_id,
      type: 'refresh'
    };

    return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
      expiresIn: '7d',
      issuer: 'your-app-name',
      audience: 'your-app-users'
    });
  } catch (error) {
    throw new Error('Failed to generate refresh token');
  }
};

/**
 * Verify access token
 * @param {string} token - Access token
 * @returns {Object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  } catch (error) {
    throw new Error('Invalid access token');
  }
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

/**
 * Decode token without verification
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error('Failed to decode token');
  }
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} Expired status
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    return true;
  }
};

/**
 * Get token expiry time
 * @param {string} token - JWT token
 * @returns {Date} Expiry date
 */
export const getTokenExpiry = (token) => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return null;
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
};

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User object
 * @returns {Object} Token pair
 */
export const generateTokenPair = (user) => {
  try {
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    return {
      accessToken,
      refreshToken,
      accessTokenExpiry: new Date(Date.now() + accessTokenExpiryMs),
      refreshTokenExpiry: new Date(Date.now() + refreshTokenExpiryMs)
    };
  } catch (error) {
    throw new Error('Failed to generate token pair');
  }
};
