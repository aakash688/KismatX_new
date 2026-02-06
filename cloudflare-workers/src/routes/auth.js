/**
 * Authentication Routes
 * Handles login, register, refresh token, logout
 */

import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';

const auth = new Hono();

/**
 * Generate JWT tokens
 */
function generateTokens(user, env) {
  const accessToken = jwt.sign(
    {
      id: user.id,
      user_id: user.user_id,
      email: user.email,
      user_type: user.user_type,
      type: 'access'
    },
    env.JWT_SECRET,
    { expiresIn: '4h', audience: 'your-app-users', issuer: 'your-app-name' }
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      user_id: user.user_id,
      type: 'refresh'
    },
    env.JWT_SECRET,
    { expiresIn: '7d', audience: 'your-app-users', issuer: 'your-app-name' }
  );

  return { accessToken, refreshToken };
}

/**
 * POST /api/auth/login
 * User login with username/email/mobile and password
 */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    
    // Support multiple field names for compatibility
    const login = body.login || body.email || body.username || body.mobile || body.user_id;
    const password = body.password;

    if (!login || !password) {
      return c.json({
        success: false,
        message: 'Username/Email/Mobile and password are required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Find user by email, mobile, or user_id (username)
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('*')
        .or(`email.eq.${login},mobile.eq.${login},user_id.eq.${login}`)
        .eq('status', 'active')
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'Invalid credentials'
      }, 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return c.json({
        success: false,
        message: 'Invalid credentials'
      }, 401);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user, c.env);

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .insert({
          token: refreshToken,
          user_id: user.id,
          expires_at: expiresAt.toISOString(),
          revoked: false
        })
    );

    // Update last login
    await executeQuery(() =>
      supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id)
    );

    // Log login
    try {
      await executeQuery(() =>
        supabase
          .from('login_history')
          .insert({
            user_id: user.id,
            ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
            user_agent: c.req.header('User-Agent') || 'unknown'
          })
      );
    } catch (loginHistoryError) {
      // Don't fail login if history logging fails
      console.error('Login history error:', loginHistoryError);
    }

    // Remove sensitive data
    delete user.password_hash;
    delete user.password_salt;

    // Format user response to match Node.js version exactly
    // Node.js only returns specific fields, not the entire user object
    const userResponse = {
      id: user.id,
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      mobile: user.mobile,
      user_type: user.user_type,
      status: user.status,
      roles: [] // TODO: Fetch roles if needed (currently not implemented in CF Workers)
    };

    return c.json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    return c.json({
      success: false,
      message: 'Login failed',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/auth/register
 * User registration
 */
auth.post('/register', async (c) => {
  try {
    const {
      first_name,
      last_name,
      mobile,
      email,
      password,
      alternate_mobile,
      address,
      city,
      state,
      pin_code,
      region
    } = await c.req.json();

    // Validation
    if (!first_name || !last_name || !mobile || !email || !password) {
      return c.json({
        status: 'error',
        message: 'First name, last name, mobile, email, and password are required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Check if user already exists
    const existing = await executeQuery(() =>
      supabase
        .from('users')
        .select('id')
        .or(`email.eq.${email},mobile.eq.${mobile}`)
        .limit(1)
    );

    if (existing && existing.length > 0) {
      return c.json({
        status: 'error',
        message: 'User with this email or mobile already exists'
      }, 409);
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate unique user_id
    const user_id = `player${Date.now().toString().slice(-6)}`;

    // Create user
    const newUser = await executeQuery(() =>
      supabase
        .from('users')
        .insert({
          user_id,
          first_name,
          last_name,
          mobile,
          email,
          password_hash,
          password_salt: salt,
          alternate_mobile,
          address,
          city,
          state,
          pin_code,
          region,
          status: 'active',
          user_type: 'player',
          deposit_amount: 0
        })
        .select()
        .single()
    );

    // Assign Player role (role_id = 3)
    await executeQuery(() =>
      supabase
        .from('user_roles')
        .insert({
          user_id: newUser.id,
          role_id: 3 // Player role
        })
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(newUser, c.env);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .insert({
          token: refreshToken,
          user_id: newUser.id,
          expires_at: expiresAt.toISOString(),
          revoked: false
        })
    );

    // Remove sensitive data
    delete newUser.password_hash;
    delete newUser.password_salt;

    return c.json({
      status: 'success',
      message: 'Registration successful',
      data: {
        user: newUser,
        accessToken,
        refreshToken
      }
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    return c.json({
      status: 'error',
      message: 'Registration failed',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/auth/refresh-token
 * Refresh access token using refresh token
 */
auth.post('/refresh-token', async (c) => {
  try {
    const { refreshToken } = await c.req.json();

    if (!refreshToken) {
      return c.json({
        status: 'error',
        message: 'Refresh token is required'
      }, 400);
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, c.env.JWT_SECRET);
    } catch (err) {
      return c.json({
        status: 'error',
        message: 'Invalid or expired refresh token'
      }, 401);
    }

    const supabase = getSupabaseClient(c.env);

    // Check if token exists and is not revoked
    const tokenRecord = await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .select('*')
        .eq('token', refreshToken)
        .eq('revoked', false)
        .single()
    );

    if (!tokenRecord) {
      return c.json({
        status: 'error',
        message: 'Refresh token not found or revoked'
      }, 401);
    }

    // Check if token expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return c.json({
        status: 'error',
        message: 'Refresh token expired'
      }, 401);
    }

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .eq('status', 'active')
        .single()
    );

    if (!user) {
      return c.json({
        status: 'error',
        message: 'User not found or inactive'
      }, 401);
    }

    // Generate new access token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user, c.env);

    // Revoke old refresh token
    await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .update({ revoked: true })
        .eq('token', refreshToken)
    );

    // Store new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .insert({
          token: newRefreshToken,
          user_id: user.id,
          expires_at: expiresAt.toISOString(),
          revoked: false
        })
    );

    // Remove sensitive data
    delete user.password_hash;
    delete user.password_salt;

    return c.json({
      status: 'success',
      message: 'Token refreshed successfully',
      data: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    return c.json({
      status: 'error',
      message: 'Token refresh failed',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/auth/logout
 * Logout user and revoke refresh token
 */
auth.post('/logout', async (c) => {
  try {
    const { refreshToken } = await c.req.json();

    if (!refreshToken) {
      return c.json({
        status: 'success',
        message: 'Logged out successfully'
      });
    }

    const supabase = getSupabaseClient(c.env);

    // Revoke refresh token
    await executeQuery(() =>
      supabase
        .from('refresh_tokens')
        .update({ revoked: true })
        .eq('token', refreshToken)
    );

    return c.json({
      status: 'success',
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    return c.json({
      status: 'error',
      message: 'Logout failed',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
auth.get('/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        status: 'error',
        message: 'No authorization token provided'
      }, 401);
    }

    const token = authHeader.substring(7);
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, c.env.JWT_SECRET);
    } catch (err) {
      return c.json({
        status: 'error',
        message: 'Invalid or expired token'
      }, 401);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select(`
          *,
          user_roles!inner(
            role_id,
            roles!inner(name, description)
          )
        `)
        .eq('id', decoded.id)
        .eq('status', 'active')
        .single()
    );

    if (!user) {
      return c.json({
        status: 'error',
        message: 'User not found'
      }, 404);
    }

    // Remove sensitive data
    delete user.password_hash;
    delete user.password_salt;

    return c.json({
      status: 'success',
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      status: 'error',
      message: 'Failed to get user',
      error: error.message
    }, 500);
  }
});

export default auth;
