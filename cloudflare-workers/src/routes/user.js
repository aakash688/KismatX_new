/**
 * User Routes
 * User profile and management endpoints
 */

import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth.js';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';
import bcrypt from 'bcryptjs';

const user = new Hono();

// Apply authentication middleware to all routes
user.use('*', authenticate);

/**
 * GET /api/user/me
 * Get current user info
 */
user.get('/me', async (c) => {
  try {
    const currentUser = c.get('user');

    return c.json({
      success: true,
      data: { user: currentUser }
    });

  } catch (error) {
    console.error('Get me error:', error);
    return c.json({
      success: false,
      message: 'Failed to get user info',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/user/profile
 * Get current user profile
 */
user.get('/profile', async (c) => {
  try {
    const currentUser = c.get('user');

    return c.json({
      success: true,
      data: { user: currentUser }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    }, 500);
  }
});

/**
 * PUT /api/user/profile
 * Update current user profile
 */
user.put('/profile', async (c) => {
  try {
    const currentUser = c.get('user');
    const updates = await c.req.json();

    // Fields that can be updated
    const allowedFields = [
      'first_name',
      'last_name',
      'alternate_mobile',
      'address',
      'city',
      'state',
      'pin_code',
      'region'
    ];

    // Filter only allowed fields
    const filteredUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return c.json({
        status: 'error',
        message: 'No valid fields to update'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Update user
    const updatedUser = await executeQuery(() =>
      supabase
        .from('users')
        .update(filteredUpdates)
        .eq('id', currentUser.id)
        .select()
        .single()
    );

    // Remove sensitive data
    delete updatedUser.password_hash;
    delete updatedUser.password_salt;

    return c.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/user/wallet-info
 * Get user wallet information with last bet transaction
 * Matches Node.js version format exactly
 */
user.get('/wallet-info', async (c) => {
  try {
    const currentUser = c.get('user');
    const supabase = getSupabaseClient(c.env);

    // Get fresh user data from database (to ensure we have latest balance)
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id, first_name, last_name, email, deposit_amount')
        .eq('id', currentUser.id)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    // Get last bet transaction (most recent bet slip)
    const { data: lastBetSlip } = await supabase
      .from('bet_slips')
      .select('total_amount, game_id, slip_id, barcode, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Format response to match Node.js version exactly
    const response = {
      success: true,
      data: {
        username: user.user_id,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email,
        wallet_balance: parseFloat(user.deposit_amount || 0),
        last_bet: lastBetSlip ? {
          transaction_amount: parseFloat(lastBetSlip.total_amount || 0),
          game_id: lastBetSlip.game_id,
          slip_id: lastBetSlip.slip_id,
          barcode: lastBetSlip.barcode,
          status: lastBetSlip.status,
          created_at: lastBetSlip.created_at
        } : null
      }
    };

    return c.json(response);

  } catch (error) {
    console.error('❌ Error getting wallet info:', error);
    return c.json({
      success: false,
      message: 'Failed to get wallet info',
      error: error.message
    }, 500);
  }
});

/**
 * PUT /api/user/password
 * Update user password
 */
user.put('/password', async (c) => {
  try {
    const currentUser = c.get('user');
    const { current_password, new_password } = await c.req.json();

    if (!current_password || !new_password) {
      return c.json({
        success: false,
        message: 'Current password and new password are required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user with password
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('password_hash')
        .eq('id', currentUser.id)
        .single()
    );

    // Verify current password
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    
    if (!isValid) {
      return c.json({
        success: false,
        message: 'Current password is incorrect'
      }, 401);
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(new_password, salt);

    // Update password
    await executeQuery(() =>
      supabase
        .from('users')
        .update({ password_hash, password_salt: salt })
        .eq('id', currentUser.id)
    );

    return c.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    return c.json({
      success: false,
      message: 'Failed to update password',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/user/:id
 * Get user by ID (Admin only)
 */
user.get('/:id', authorize('Admin'), async (c) => {
  try {
    const userId = c.req.param('id');
    const supabase = getSupabaseClient(c.env);

    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select(`
          *,
          user_roles(
            role_id,
            roles(name, description)
          )
        `)
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    // Remove sensitive data
    delete user.password_hash;
    delete user.password_salt;

    return c.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    return c.json({
      success: false,
      message: 'Failed to get user',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/user/
 * Get all users (Admin only) or specific user if :id is provided
 */
user.get('/', authorize('Admin'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    // Get users with pagination
    const users = await executeQuery(() =>
      supabase
        .from('users')
        .select('*, user_roles(role_id, roles(name))')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false })
    );

    // Get total count
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    // Remove sensitive data
    users.forEach(user => {
      delete user.password_hash;
      delete user.password_salt;
    });

    return c.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return c.json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    }, 500);
  }
});

export default user;
