/**
 * Admin Routes - Complete Implementation
 * Handles all admin-only endpoints
 */

import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth.js';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';

const admin = new Hono();

// All admin routes require authentication and admin role
admin.use('*', authenticate);
admin.use('*', authorize('Admin'));

/**
 * GET /api/admin/dashboard
 * Get dashboard statistics
 * Uses parallel queries via Promise.all for speed (6 subrequests, same response format)
 */
admin.get('/dashboard', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Run all 6 queries in parallel (same response keys as before)
    const [
      totalUsersRes,
      activeUsersRes,
      bannedUsersRes,
      depositsRes,
      recentLoginsRes,
      adminActionsRes
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'banned'),
      supabase.from('users').select('deposit_amount'),
      supabase.from('login_history').select('*', { count: 'exact', head: true }).gte('login_time', twentyFourHoursAgo),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', twentyFourHoursAgo)
    ]);

    const totalDeposits = (depositsRes.data || []).reduce(
      (sum, u) => sum + parseFloat(u.deposit_amount || 0), 0
    );

    return c.json({
      success: true,
      totalUsers: totalUsersRes.count || 0,
      activeUsers: activeUsersRes.count || 0,
      bannedUsers: bannedUsersRes.count || 0,
      totalDeposits,
      recentLogins: recentLoginsRes.count || 0,
      adminActions: adminActionsRes.count || 0
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    return c.json({
      success: false,
      message: 'Failed to load dashboard data',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
admin.get('/users', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const status = c.req.query('status');
    const search = c.req.query('search');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,user_id.ilike.%${search}%`);
    }

    const { data: users, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    // Remove sensitive data
    users?.forEach(user => {
      delete user.password_hash;
      delete user.password_salt;
    });

    // Frontend expects this specific format
    return c.json({
      success: true,
      users: users || [], // Changed from 'data' to 'users'
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
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

/**
 * GET /api/admin/users/:id
 * Get user by ID
 */
admin.get('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const supabase = getSupabaseClient(c.env);

    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    delete user.password_hash;
    delete user.password_salt;

    return c.json({
      success: true,
      data: user
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
 * POST /api/admin/users
 * Create new user
 */
admin.post('/users', async (c) => {
  try {
    const {
      user_id,
      first_name,
      last_name,
      email,
      mobile,
      password,
      user_type = 'player',
      status = 'active',
      alternate_mobile,
      deposit_amount,
      address,
      city,
      state,
      pin_code,
      region
    } = await c.req.json();

    if (!user_id || !first_name || !last_name || !email || !mobile || !password) {
      return c.json({
        success: false,
        message: 'Missing required fields: user_id, first_name, last_name, email, mobile, password'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Check if user already exists
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${email},mobile.eq.${mobile},user_id.eq.${user_id}`)
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return c.json({
        success: false,
        message: 'User already exists with this email, mobile, or user_id'
      }, 400);
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);
    const password_salt = await bcrypt.genSalt(12);

    // Create user
    const newUser = await executeQuery(() =>
      supabase
        .from('users')
        .insert({
          user_id,
          first_name,
          last_name,
          email,
          mobile,
          password_hash,
          password_salt,
          user_type,
          status,
          alternate_mobile: alternate_mobile || null,
          deposit_amount: deposit_amount ? parseFloat(deposit_amount) : 0,
          address: address || null,
          city: city || null,
          state: state || null,
          pin_code: pin_code || null,
          region: region || null,
          email_verified: false,
          mobile_verified: false,
          is_email_verified_by_admin: false,
          is_mobile_verified_by_admin: false
        })
        .select()
        .single()
    );

    // Log admin action
    const adminUser = c.get('user');
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'user_created',
          target_type: 'user',
          target_id: newUser.id,
          details: `Admin created user: ${user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    delete newUser.password_hash;
    delete newUser.password_salt;

    return c.json({
      success: true,
      message: 'User created successfully',
      user: newUser
    });

  } catch (error) {
    console.error('Create user error:', error);
    return c.json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password
 */
admin.post('/users/:id/reset-password', async (c) => {
  try {
    const userId = c.req.param('id');
    const { newPassword } = await c.req.json();

    if (!newPassword) {
      return c.json({
        success: false,
        message: 'New password is required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    // Hash new password
    const password_hash = await bcrypt.hash(newPassword, 12);
    const password_salt = await bcrypt.genSalt(12);

    // Update password
    await executeQuery(() =>
      supabase
        .from('users')
        .update({
          password_hash,
          password_salt,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
    );

    // Log admin action
    const adminUser = c.get('user');
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'user_password_reset',
          target_type: 'user',
          target_id: user.id,
          details: `Admin reset password for user: ${user.user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    return c.json({
      success: true,
      message: 'User password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    }, 500);
  }
});

/**
 * PUT /api/admin/users/:id
 * Update user
 */
admin.put('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const updateData = await c.req.json();

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    // Nullable fields that should convert empty strings to null
    const nullableFields = ['alternate_mobile', 'address', 'city', 'state', 'pin_code', 'region'];
    
    // Prepare update object
    const updates = {};
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id' && key !== 'password_hash' && key !== 'password_salt') {
        let value = updateData[key];
        
        // Convert empty strings to null for nullable fields
        if (nullableFields.includes(key) && value === '') {
          value = null;
        }
        
        // Ensure deposit_amount is a number
        if (key === 'deposit_amount') {
          value = value === '' || value === null || value === undefined ? 0 : parseFloat(value);
        }
        
        updates[key] = value;
      }
    });

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString();

    // Update user
    const updatedUser = await executeQuery(() =>
      supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()
    );

    // Log admin action
    const adminUser = c.get('user');
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'user_updated',
          target_type: 'user',
          target_id: user.id,
          details: `Admin updated user: ${user.user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    delete updatedUser.password_hash;
    delete updatedUser.password_salt;

    return c.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    return c.json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    }, 500);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete or ban user
 */
admin.delete('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const action = body.action || 'ban'; // "ban" or "delete"

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    if (action === 'delete') {
      // Hard delete
      await executeQuery(() =>
        supabase
          .from('users')
          .delete()
          .eq('id', userId)
      );
    } else {
      // Ban user (soft delete)
      await executeQuery(() =>
        supabase
          .from('users')
          .update({ status: 'banned', updated_at: new Date().toISOString() })
          .eq('id', userId)
      );
    }

    // Log admin action
    const adminUser = c.get('user');
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: action === 'delete' ? 'user_deleted' : 'user_banned',
          target_type: 'user',
          target_id: user.id,
          details: `Admin ${action}ed user: ${user.user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    return c.json({
      success: true,
      message: `User ${action}ed successfully`
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    }, 500);
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Change user status
 */
admin.put('/users/:id/status', async (c) => {
  try {
    const userId = c.req.param('id');
    const { status } = await c.req.json();

    if (!['active', 'inactive', 'banned', 'pending'].includes(status)) {
      return c.json({
        success: false,
        message: 'Invalid status. Must be: active, inactive, banned, or pending'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id, status')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    const oldStatus = user.status;

    // Update status
    const updatedUser = await executeQuery(() =>
      supabase
        .from('users')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single()
    );

    // Log admin action
    const adminUser = c.get('user');
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'user_status_changed',
          target_type: 'user',
          target_id: user.id,
          details: `Admin changed user status from ${oldStatus} to ${status} for user: ${user.user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    delete updatedUser.password_hash;
    delete updatedUser.password_salt;

    return c.json({
      success: true,
      message: 'User status updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update status error:', error);
    return c.json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/settings
 * Get system settings
 */
admin.get('/settings', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);

    // Get all settings as key-value pairs
    const settingsArray = await executeQuery(() =>
      supabase
        .from('settings')
        .select('*')
        .order('id')
    );

    // Transform array to object for frontend
    const settingsObject = {};
    const rawSettings = {};
    
    if (settingsArray && Array.isArray(settingsArray)) {
      settingsArray.forEach(setting => {
        settingsObject[setting.key] = setting.value;
        rawSettings[setting.key] = setting;
      });
    }

    return c.json({
      success: true,
      settings: settingsObject,
      raw: rawSettings
    });

  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({
      success: false,
      message: 'Failed to get settings',
      error: error.message
    }, 500);
  }
});

/**
 * PUT /api/admin/settings
 * Update system settings
 */
admin.put('/settings', async (c) => {
  try {
    const body = await c.req.json();
    const supabase = getSupabaseClient(c.env);
    const adminUser = c.get('user');

    // Update each setting by key
    const updates = [];
    for (const [key, value] of Object.entries(body)) {
      // Get old value BEFORE update
      const oldSetting = await executeQuery(() =>
        supabase
          .from('settings')
          .select('value')
          .eq('key', key)
          .single()
      );
      
      // Update the setting
      const result = await executeQuery(() =>
        supabase
          .from('settings')
          .update({ 
            value: value.toString(),
            updated_at: new Date().toISOString()
          })
          .eq('key', key)
          .select()
          .single()
      );
      
      if (result) {
        updates.push(result);
        
        // Log settings change
        await executeQuery(() =>
          supabase
            .from('settings_logs')
            .insert({
              setting_key: key,
              previous_value: oldSetting?.value || null,
              new_value: value.toString(),
              admin_id: adminUser.id,
              admin_user_id: adminUser.user_id,
              ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
              user_agent: c.req.header('User-Agent') || 'unknown'
            })
        );
      }
    }

    // Log admin action
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminUser.id,
          action: 'settings_updated',
          target_type: 'settings',
          target_id: null,
          details: `Admin updated ${updates.length} setting(s)`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    // Get updated settings
    const settingsArray = await executeQuery(() =>
      supabase
        .from('settings')
        .select('*')
        .order('id')
    );

    const settingsObject = {};
    if (settingsArray && Array.isArray(settingsArray)) {
      settingsArray.forEach(setting => {
        settingsObject[setting.key] = setting.value;
      });
    }

    return c.json({
      success: true,
      message: 'Settings updated successfully',
      settings: settingsObject
    });

  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games
 * Get all games with pagination
 */
admin.get('/games', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;
    const date = c.req.query('date'); // YYYY-MM-DD (IST date)
    const status = c.req.query('status'); // pending|active|completed
    const settlementStatus = c.req.query('settlement_status'); // not_settled|settling|settled|error

    const supabase = getSupabaseClient(c.env);

    // We intentionally sort in JS to guarantee "active game at the top",
    // and to avoid confusing UX where a future pending game (e.g. 03:00) appears above the current active game.
    // This also matches the Node.js admin UX more closely.
    let query = supabase
      .from('games')
      .select('*', { count: 'exact' });

    if (date) {
      query = query
        .gte('start_time', `${date} 00:00:00`)
        .lte('start_time', `${date} 23:59:59`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (settlementStatus) {
      query = query.eq('settlement_status', settlementStatus);
    }

    // Pull enough rows for the day, then paginate after sorting.
    // Typical day is <= 288 games (5-min slots), so this is safe and avoids complex SQL ordering.
    const { data: gamesRaw, count } = await query
      .order('start_time', { ascending: true })
      .limit(1000);

    const games = (gamesRaw || []).slice();

    const statusRank = { active: 0, pending: 1, completed: 2 };
    games.sort((a, b) => {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;

      // start_time is stored as "YYYY-MM-DD HH:mm:ss" (IST string), so lexicographic compare is safe.
      const at = a.start_time || '';
      const bt = b.start_time || '';

      if (a.status === 'completed' && b.status === 'completed') {
        // most recent completed first
        return bt.localeCompare(at);
      }

      // active/pending: soonest first
      return at.localeCompare(bt);
    });

    const pageGames = games.slice(offset, offset + limit);

    // ============================================
    // Calculate total_wagered for each game (matching Node.js logic)
    // Fetch bet slips for visible games and compute wagered amounts
    // excluding cancelled slips
    // ============================================
    const pageGameIds = pageGames.map(g => g.game_id);
    let wageredMap = new Map();

    if (pageGameIds.length > 0) {
      // Fetch all bet slips for these games in one query
      const { data: allBetSlips } = await supabase
        .from('bet_slips')
        .select('game_id, slip_id, total_amount')
        .in('game_id', pageGameIds);

      if (allBetSlips && allBetSlips.length > 0) {
        // Get cancelled slip IDs
        const slipIds = allBetSlips.map(s => s.slip_id);
        const cancelledSlipIds = new Set();

        if (slipIds.length > 0) {
          const { data: cancellations } = await supabase
            .from('wallet_logs')
            .select('reference_id')
            .eq('reference_type', 'cancellation')
            .in('reference_id', slipIds);

          (cancellations || []).forEach(c => {
            if (c.reference_id) cancelledSlipIds.add(c.reference_id);
          });
        }

        // Filter out cancelled slips and build wagered map
        allBetSlips
          .filter(slip => !cancelledSlipIds.has(slip.slip_id))
          .forEach(slip => {
            const current = wageredMap.get(slip.game_id) || 0;
            wageredMap.set(slip.game_id, current + parseFloat(slip.total_amount || 0));
          });
      }
    }

    // Format response with total_wagered (matching Node.js response shape)
    const { formatIST, parseISTDateTime } = await import('../utils/timezone.js');
    const formattedGames = pageGames.map(game => ({
      id: game.id,
      game_id: game.game_id,
      start_time: game.start_time,
      end_time: game.end_time,
      status: game.status,
      winning_card: game.winning_card,
      payout_multiplier: parseFloat(game.payout_multiplier || 0),
      settlement_status: game.settlement_status,
      settlement_started_at: game.settlement_started_at || null,
      settlement_completed_at: game.settlement_completed_at || null,
      settlement_error: game.settlement_error || null,
      created_at: game.created_at,
      updated_at: game.updated_at,
      total_wagered: wageredMap.get(game.game_id) || 0
    }));

    return c.json({
      success: true,
      data: formattedGames,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Get games error:', error);
    return c.json({
      success: false,
      message: 'Failed to get games',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/audit-logs
 * Get audit logs
 */
admin.get('/audit-logs', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    const { data: logs, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    return c.json({
      success: true,
      data: logs || [], // Always return array
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json({
      success: false,
      message: 'Failed to get audit logs',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/logins
 * Get global login history
 */
admin.get('/logins', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const search = c.req.query('search');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    let query = supabase
      .from('login_history')
      .select(`
        *,
        users!inner(user_id, first_name, last_name, email)
      `, { count: 'exact' });

    if (search) {
      query = query.or(`users.user_id.ilike.%${search}%,users.email.ilike.%${search}%,ip_address.ilike.%${search}%`);
    }

    const { data: logins, count } = await query
      .range(offset, offset + limit - 1)
      .order('login_time', { ascending: false });

    return c.json({
      success: true,
      logins: logins || [],
      total: count || 0,
      page,
      limit
    });

  } catch (error) {
    console.error('Get login history error:', error);
    return c.json({
      success: false,
      message: 'Failed to get login history',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/settings/logs
 * Get settings change logs
 */
admin.get('/settings/logs', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    const { data: logs, count } = await supabase
      .from('settings_logs')
      .select(`
        *,
        users!inner(user_id, first_name, last_name)
      `, { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('changed_at', { ascending: false });

    return c.json({
      success: true,
      data: logs || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error('Get settings logs error:', error);
    return c.json({
      success: false,
      message: 'Failed to get settings logs',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/live-settlement
 * Get live settlement data
 * IMPORTANT: This must come BEFORE /games/:gameId to avoid route conflict
 */
admin.get('/games/live-settlement', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);
    const { getSetting } = await import('../utils/settings.js');
    const { formatIST, parseISTDateTime, toISTString } = await import('../utils/timezone.js');
    
    // Get game result mode (auto/manual)
    const mode = await getSetting(supabase, 'game_result_type', 'auto');
    
    // Optional user filter
    const userId = c.req.query('user_id');
    const selectedUserId = userId ? parseInt(userId, 10) : null;

    // Current game selection (prevents showing a future PENDING game while an ACTIVE game is running):
    // - If MANUAL: show most recent completed-not-settled game first (so admin can settle)
    // - Otherwise: show ACTIVE game
    // - If none active: show next PENDING game (soonest)
    let currentGame = null;

    if (mode === 'manual') {
      const { data: completedUnsettledGames } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'completed')
        .eq('settlement_status', 'not_settled')
        .order('end_time', { ascending: false })
        .limit(1);
      currentGame = completedUnsettledGames?.[0] || null;
    }

    if (!currentGame) {
      const { data: activeGames } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1);
      currentGame = activeGames?.[0] || null;
    }

    if (!currentGame) {
      const { data: pendingGames } = await supabase
        .from('games')
        .select('*')
        .eq('status', 'pending')
        .order('start_time', { ascending: true })
        .limit(1);
      currentGame = pendingGames?.[0] || null;
    }
    
    // Get last 10 settled games for history
    const { data: recentGames } = await supabase
      .from('games')
      .select('game_id, winning_card, end_time')
      .eq('settlement_status', 'settled')
      .order('end_time', { ascending: false })
      .limit(10);
    
    const recentGamesHistory = (recentGames || []).map(g => {
      const endUtc = parseISTDateTime(g.end_time);
      return {
        game_id: g.game_id,
        winning_card: g.winning_card,
        end_time: g.end_time,
        end_time_display: endUtc ? formatIST(endUtc, 'hh:mm:ss a') : null
      };
    });
    
    // Prepare current game data
    let currentGameData = null;
    
    if (!currentGame) {
      // No current game - return with history only
      return c.json({
        success: true,
        data: {
          mode: mode,
          current_game: null,
          recent_games: recentGamesHistory
        }
      });
    }
    
    const activeGame = currentGame;

    // Request-time "tick" so AUTO mode can settle within ~poll interval (frontend polls frequently).
    // This avoids being limited to 1-minute cron granularity.
    const nowUtc = new Date();
    const startUtc = parseISTDateTime(activeGame.start_time);
    const endUtc = parseISTDateTime(activeGame.end_time);

    // CRITICAL: Mark game as completed if end_time has passed (independent of settlement)
    // Game creation is SEPARATE from settlement - games should always be active during game hours
    if (endUtc && activeGame.status === 'active' && nowUtc.getTime() >= endUtc.getTime()) {
      await supabase
        .from('games')
        .update({ status: 'completed', updated_at: toISTString(nowUtc) })
        .eq('game_id', activeGame.game_id);
      activeGame.status = 'completed';
      
      // CRITICAL: Schedule Durable Object Alarm for guaranteed 15-second settlement
      // This must happen when game is marked as completed, regardless of where it happens
      if (c.env.SettlementAlarmDO) {
        try {
          const { getSetting } = await import('../utils/settings.js');
          const { parseISTDateTime, formatIST } = await import('../utils/timezone.js');
          
          const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
          const gameEndTime = parseISTDateTime(activeGame.end_time);
          
          if (gameEndTime) {
            const alarmTime = gameResultType === 'auto'
              ? gameEndTime.getTime()  // Immediate
              : gameEndTime.getTime() + 10000; // +10 seconds grace period
            
            const doId = c.env.SettlementAlarmDO.idFromName(`game-${activeGame.game_id}`);
            const stub = c.env.SettlementAlarmDO.get(doId);
            // CRITICAL: Durable Object fetch requires a Request object with absolute URL
            const scheduleRequest = new Request('http://dummy/schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gameId: activeGame.game_id,
                alarmTime: alarmTime
              })
            });
            const scheduleResponse = await stub.fetch(scheduleRequest);
            
            if (scheduleResponse.ok) {
              console.log(`✅ [LIVE-SETTLE] Scheduled DO alarm for game ${activeGame.game_id} (Mode: ${gameResultType}, Alarm: ${new Date(alarmTime).toISOString()})`);
            } else {
              const errorText = await scheduleResponse.text();
              console.error(`⚠️  [LIVE-SETTLE] Failed to schedule alarm for game ${activeGame.game_id}: ${scheduleResponse.status} - ${errorText}`);
            }
          }
        } catch (alarmError) {
          console.error(`⚠️  [LIVE-SETTLE] Error scheduling alarm for game ${activeGame.game_id}:`, alarmError.message);
        }
      }
      
      // CRITICAL: Immediately create the next game when current game ends
      // This ensures continuous game flow - when Game 1 ends at 04:05:00, Game 2 starts at 04:05:00
      // Settlement (auto/manual) is separate and doesn't affect game creation
      try {
        const { createNextGameImmediately } = await import('../services/gameService.js');
        const nextGameResult = await createNextGameImmediately(c.env, activeGame.end_time);
        if (nextGameResult.created) {
          console.log(`✅ [LIVE-SETTLE] Immediately created next game: ${nextGameResult.game_id} (Status: ${nextGameResult.status || 'active'})`);
        }
      } catch (nextGameError) {
        console.error('⚠️  [LIVE-SETTLE] Failed to create next game:', nextGameError);
      }
    }

    // Settlement is SEPARATE - only settle if game is completed and in auto mode
    // Settlement doesn't block or affect game creation
    // This is an optimization - DO alarm is the primary authority
    if (mode === 'auto' && activeGame.status === 'completed' && activeGame.settlement_status === 'not_settled') {
      const { autoSettleGames } = await import('../services/settlementService.js');
      const settleResult = await autoSettleGames(c.env, false);
      
      // If immediate settlement succeeded, cancel the scheduled DO alarm
      if (settleResult.settled > 0 && c.env.SettlementAlarmDO) {
        try {
          const doId = c.env.SettlementAlarmDO.idFromName(`game-${activeGame.game_id}`);
          const stub = c.env.SettlementAlarmDO.get(doId);
          const cancelRequest = new Request('http://dummy/cancel-alarm', { method: 'POST' });
          const cancelResponse = await stub.fetch(cancelRequest);
          
          if (cancelResponse.ok) {
            const cancelResult = await cancelResponse.json();
            if (cancelResult.cancelled) {
              console.log(`✅ [LIVE-SETTLE] Cancelled scheduled alarm for game ${activeGame.game_id} (immediate settlement)`);
            }
          }
        } catch (cancelError) {
          // Non-critical - alarm will just fail gracefully if already fired
          console.warn(`⚠️  [LIVE-SETTLE] Failed to cancel alarm for game ${activeGame.game_id}:`, cancelError.message);
        }
      }
      
      // Do not refetch here; next poll will reflect new settlement_status.
    }

    // OPTIMIZED: Fetch bet slips + bet details in PARALLEL (saves ~200ms latency)
    const [betSlipsResult, betDetailsResult] = await Promise.all([
      supabase.from('bet_slips').select('*').eq('game_id', activeGame.game_id),
      supabase.from('bet_details').select('*').eq('game_id', activeGame.game_id)
    ]);

    const allBetSlips = betSlipsResult.data;
    const allBetDetails = betDetailsResult.data;

    // Get cancelled slip IDs for this game (same logic as Node.js)
    const cancelledSlipUuids = new Set();
    const cancelledSlipDbIds = new Set();
    
    if (allBetSlips && allBetSlips.length > 0) {
      const slipIds = allBetSlips.map(slip => slip.slip_id);
      
      // Check wallet_logs for cancellations
      const { data: cancellationLogs } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);
      
      (cancellationLogs || []).forEach(log => {
        if (log.reference_id) {
          cancelledSlipUuids.add(log.reference_id);
        }
      });
      
      // Map cancelled UUIDs to database IDs
      allBetSlips.forEach(slip => {
        if (cancelledSlipUuids.has(slip.slip_id)) {
          cancelledSlipDbIds.add(slip.id);
        }
      });
    }
    
    // Filter out cancelled slips (same as Node.js)
    let betSlips = (allBetSlips || []).filter(slip => !cancelledSlipUuids.has(slip.slip_id));
    
    // Optional user filter
    if (selectedUserId && Number.isInteger(selectedUserId)) {
      betSlips = betSlips.filter(slip => slip.user_id === selectedUserId);
    }
    
    // Filter out bet details from cancelled slips (same as Node.js)
    let filteredBetDetails = (allBetDetails || []).filter(bd => !cancelledSlipDbIds.has(bd.slip_id));
    
    // If filtering by user, restrict bet details to slips of that user
    if (selectedUserId && Number.isInteger(selectedUserId) && betSlips) {
      const allowedSlipDbIds = new Set(betSlips.map(s => s.id));
      filteredBetDetails = filteredBetDetails.filter(bd => allowedSlipDbIds.has(bd.slip_id));
    }
    
    // Get unique user IDs who have bets
    const userIdsInGame = [...new Set((betSlips || []).map(s => s.user_id))];
    const users = [];
    
    if (userIdsInGame.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, user_id, first_name, last_name')
        .in('id', userIdsInGame);
      
      users.push(...(usersData || []).map(u => ({
        id: u.id,
        user_id: u.user_id,
        first_name: u.first_name,
        last_name: u.last_name
      })));
    }
    
    // Calculate totals
    const totalWagered = (betSlips || []).reduce((sum, slip) => 
      sum + parseFloat(slip.total_amount || 0), 0);
    
    const multiplier = parseFloat(activeGame.payout_multiplier || 10);
    
    // Calculate stats for each card (1-12)
    const cardStats = [];
    for (let card = 1; card <= 12; card++) {
      const betsOnCard = filteredBetDetails.filter(bd => bd.card_number === card);
      const totalBetOnCard = betsOnCard.reduce((sum, bet) => 
        sum + parseFloat(bet.bet_amount || 0), 0);
      
      const totalPayout = totalBetOnCard * multiplier;
      const profit = totalWagered - totalPayout;
      const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
      
      cardStats.push({
        card_number: card,
        total_bet_amount: totalBetOnCard,
        total_payout: totalPayout,
        profit: profit,
        profit_percentage: profitPercentage,
        bets_count: betsOnCard.length
      });
    }
    
    // Calculate time remaining (instants in UTC, displayed in IST)
    const timeRemaining = endUtc ? Math.max(0, endUtc.getTime() - nowUtc.getTime()) : 0;
    const secondsRemaining = Math.floor(timeRemaining / 1000);
    
    // Check if in settlement window
    const isCompleted = activeGame.status === 'completed';
    const timeSinceEnd = isCompleted && endUtc ? nowUtc.getTime() - endUtc.getTime() : 0;
    const isInSettlementWindow = isCompleted && activeGame.settlement_status === 'not_settled';
    const settlementWindowRemaining = isInSettlementWindow 
      ? Math.max(0, 10000 - timeSinceEnd) 
      : 0;
    
    currentGameData = {
      game_id: activeGame.game_id,
      start_time: activeGame.start_time, // Raw IST string from DB
      end_time: activeGame.end_time, // Raw IST string from DB
      start_time_display: startUtc ? formatIST(startUtc, 'hh:mm:ss a') : null,
      end_time_display: endUtc ? formatIST(endUtc, 'hh:mm:ss a') : null,
      status: activeGame.status,
      settlement_status: activeGame.settlement_status,
      payout_multiplier: multiplier,
      total_wagered: totalWagered,
      total_slips: betSlips?.length || 0,
      card_stats: cardStats,
      time_remaining_seconds: secondsRemaining,
      is_completed: isCompleted,
      is_in_settlement_window: isInSettlementWindow,
      settlement_window_remaining_ms: settlementWindowRemaining,
      users: users,
      selected_user_id: selectedUserId
    };
    
    return c.json({
      success: true,
      data: {
        mode: mode,
        current_game: currentGameData,
        recent_games: recentGamesHistory
      }
    });

  } catch (error) {
    console.error('Get live settlement error:', error);
    return c.json({
      success: false,
      message: 'Failed to get live settlement data',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId/settlement-decision
 * Get profit/loss preview for each card before settling
 */
admin.get('/games/:gameId/settlement-decision', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);
    const { getSetting } = await import('../utils/settings.js');
    
    // Get game
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single()
    );
    
    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }
    
    // Validate game can be settled
    if (game.settlement_status !== 'not_settled') {
      return c.json({
        success: false,
        message: `Game is already ${game.settlement_status}`
      }, 400);
    }
    
    // Check if game status allows settlement
    const mode = await getSetting(supabase, 'game_result_type', 'auto');
    const allowedStatuses = mode === 'manual' ? ['active', 'completed'] : ['completed'];
    
    if (!allowedStatuses.includes(game.status)) {
      return c.json({
        success: false,
        message: `Cannot settle game. Status: ${game.status}, Mode: ${mode}`
      }, 400);
    }
    
    // Get bet slips and details
    const betSlips = await executeQuery(() =>
      supabase
        .from('bet_slips')
        .select('*')
        .eq('game_id', gameId)
    );
    
    const betDetails = await executeQuery(() =>
      supabase
        .from('bet_details')
        .select('*')
        .eq('game_id', gameId)
    );
    
    // Calculate total wagered
    const totalWagered = (betSlips || []).reduce((sum, slip) => 
      sum + parseFloat(slip.total_amount || 0), 0);
    
    const multiplier = parseFloat(game.payout_multiplier || 10);
    
    // Calculate profit/loss for each card
    const cardAnalysis = [];
    
    for (let card = 1; card <= 12; card++) {
      const betsOnCard = (betDetails || []).filter(bd => bd.card_number === card);
      const totalBetOnCard = betsOnCard.reduce((sum, bet) => 
        sum + parseFloat(bet.bet_amount || 0), 0);
      
      const totalPayout = totalBetOnCard * multiplier;
      const profit = totalWagered - totalPayout;
      const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
      
      cardAnalysis.push({
        card_number: card,
        total_bet_amount: totalBetOnCard,
        total_payout: totalPayout,
        profit: profit,
        profit_percentage: profitPercentage,
        bets_count: betsOnCard.length,
        is_profitable: profit > 0
      });
    }
    
    // Find most profitable card
    const mostProfitableCard = cardAnalysis.reduce((max, card) => 
      card.profit > max.profit ? card : max, cardAnalysis[0]);
    
    return c.json({
      success: true,
      data: {
        game_id: game.game_id,
        status: game.status,
        total_wagered: totalWagered,
        total_slips: betSlips?.length || 0,
        payout_multiplier: multiplier,
        card_analysis: cardAnalysis,
        recommended_card: mostProfitableCard.card_number,
        mode: mode
      }
    });
    
  } catch (error) {
    console.error('Settlement decision error:', error);
    return c.json({
      success: false,
      message: 'Failed to get settlement decision data',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/admin/games/:gameId/settle
 * Manually settle a game with a specific winning card
 */
admin.post('/games/:gameId/settle', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const { winning_card } = await c.req.json();
    const adminUser = c.get('user');
    const adminId = adminUser?.id || 1;
    
    if (!winning_card || !Number.isInteger(winning_card) || winning_card < 1 || winning_card > 12) {
      return c.json({
        success: false,
        message: 'Valid winning card (1-12) is required'
      }, 400);
    }
    
    // Import settlement service
    const { settleGame } = await import('../services/settlementService.js');
    
    // Get game first to get the database ID (integer) for audit log
    const supabase = getSupabaseClient(c.env);
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('id')
        .eq('game_id', gameId)
        .single()
    );
    
    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }
    
    // Get full game details to access end_time for immediate next game creation
    const fullGame = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single()
    );
    
    // Settle the game
    // NOTE: settleGame signature is (gameId, winningCard, adminId, env)
    const result = await settleGame(gameId, winning_card, adminId, c.env);
    
    // CRITICAL: Cancel any scheduled DO alarm since game is now manually settled
    if (c.env.SettlementAlarmDO) {
      try {
        const doId = c.env.SettlementAlarmDO.idFromName(`game-${gameId}`);
        const stub = c.env.SettlementAlarmDO.get(doId);
        const cancelResponse = await stub.fetch('/cancel-alarm', { method: 'POST' });
        
        if (cancelResponse.ok) {
          const cancelResult = await cancelResponse.json();
          if (cancelResult.cancelled) {
            console.log(`✅ [MANUAL SETTLE] Cancelled scheduled alarm for game ${gameId}`);
          } else {
            console.log(`ℹ️  [MANUAL SETTLE] No alarm to cancel for game ${gameId} (may have already fired)`);
          }
        }
      } catch (cancelError) {
        // Non-critical - alarm will just fail gracefully if already fired
        console.warn(`⚠️  [MANUAL SETTLE] Failed to cancel alarm for game ${gameId}:`, cancelError.message);
      }
    }
    
    // CRITICAL: Immediately create the next game after manual settlement
    // This ensures games start immediately instead of waiting for the 5-minute cron
    if (fullGame && fullGame.end_time) {
      try {
        const { createNextGameImmediately } = await import('../services/gameService.js');
        const nextGameResult = await createNextGameImmediately(c.env, fullGame.end_time);
        if (nextGameResult.created) {
          console.log(`✅ [MANUAL SETTLE] Immediately created next game: ${nextGameResult.game_id}`);
        }
      } catch (nextGameError) {
        // Don't fail settlement if next game creation fails
        console.error('⚠️  [MANUAL SETTLE] Failed to create next game:', nextGameError);
      }
    }
    
    // Log admin action (use game.id as integer, not gameId string)
    await executeQuery(() =>
      supabase
        .from('audit_logs')
        .insert({
          admin_id: adminId,
          action: 'game_settled_manually',
          target_type: 'game',
          target_id: game.id, // Use database ID (integer), not gameId (string)
          details: `Manually settled game ${gameId} with winning card ${winning_card}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );
    
    return c.json({
      success: true,
      message: 'Game settled successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Manual settlement error:', error);
    
    if (error.message.includes('not found')) {
      return c.json({
        success: false,
        message: error.message
      }, 404);
    }
    
    if (error.message.includes('not completed') ||
        error.message.includes('already') ||
        error.message.includes('Invalid')) {
      return c.json({
        success: false,
        message: error.message
      }, 400);
    }
    
    return c.json({
      success: false,
      message: 'Failed to settle game',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/admin/stats
 * Get statistics for selected date range and user(s)
 */
admin.post('/stats', authenticate, authorize('admin'), async (c) => {
  try {
    const { startDate, endDate, userId } = await c.req.json();
    
    if (!startDate || !endDate) {
      return c.json({
        success: false,
        message: 'startDate and endDate are required'
      }, 400);
    }
    
    const supabase = getSupabaseClient(c.env);
    
    // CRITICAL: created_at is 'timestamp without time zone' and stores IST values directly.
    // Do NOT convert to UTC — use plain IST strings for comparison.
    // Converting to UTC via +05:30 offset shifts the range by 5.5 hours, causing wrong results.
    const startIST = `${startDate} 00:00:00`;
    const endIST = `${endDate} 23:59:59`;
    
    console.log('📊 Stats request:', { startDate, endDate, userId });
    console.log('Date range (IST, no tz conversion):', { startIST, endIST });
    
    // Build query for bet slips
    // CRITICAL: Supabase has a default limit of 1000 rows!
    // We need to fetch ALL rows using pagination
    let allBetSlips = [];
    let page = 0;
    const pageSize = 1000;
    let totalCount = null;
    let hasMore = true;
    
    // First, get the total count
    let countQuery = supabase
      .from('bet_slips')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startIST)
      .lte('created_at', endIST);
    
    if (userId && userId !== 'all') {
      countQuery = countQuery.eq('user_id', parseInt(userId));
    }
    
    const { count } = await countQuery;
    totalCount = count || 0;
    console.log(`Total bet slips in date range: ${totalCount}`);
    
    // Fetch all rows in pages
    while (hasMore) {
      let pageQuery = supabase
        .from('bet_slips')
        .select('*')
        .gte('created_at', startIST)
        .lte('created_at', endIST)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (userId && userId !== 'all') {
        pageQuery = pageQuery.eq('user_id', parseInt(userId));
      }
      
      const { data: pageData, error } = await pageQuery;
      
      if (error) {
        console.error('Error fetching bet slips page:', error);
        throw error;
      }
      
      if (pageData && pageData.length > 0) {
        allBetSlips = allBetSlips.concat(pageData);
        page++;
        
        // Check if we got all rows
        if (allBetSlips.length >= totalCount || pageData.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`Found ${allBetSlips?.length || 0} bet slips`);
    
    // Get cancelled slip IDs
    // OPTIMIZED APPROACH: Query cancellation logs created within date range (with buffer)
    // This limits the dataset significantly while avoiding Supabase .in() limit issues
    // Cancellation logs are typically created shortly after bet_slip creation, so we use
    // a date range filter to reduce the dataset from potentially thousands to dozens
    let cancelledSlipIds = new Set();
    
    // Query cancellation logs created within our date range (with 1-day buffer before/after)
    // This is much more efficient than querying ALL cancellation logs
    const cancelStartDate = new Date(startDate + ' 00:00:00');
    cancelStartDate.setDate(cancelStartDate.getDate() - 1); // 1 day before
    const cancelEndDate = new Date(endDate + ' 23:59:59');
    cancelEndDate.setDate(cancelEndDate.getDate() + 1); // 1 day after
    
    const cancelStartIST = cancelStartDate.toISOString().split('T')[0] + ' 00:00:00';
    const cancelEndIST = cancelEndDate.toISOString().split('T')[0] + ' 23:59:59';
    
    const { data: cancellations, error: cancelError } = await supabase
      .from('wallet_logs')
      .select('reference_id')
      .eq('reference_type', 'cancellation')
      .gte('created_at', cancelStartIST)
      .lte('created_at', cancelEndIST);
    
    if (cancelError) {
      console.error('Error fetching cancellations:', cancelError);
      // Fallback: Query all cancellations if date-filtered query fails
      const { data: allCancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation');
      
      if (allCancellations) {
        const slipIdSet = new Set(allBetSlips.map(s => String(s.slip_id).trim()));
        allCancellations.forEach(c => {
          const refId = String(c.reference_id || '').trim();
          if (refId && slipIdSet.has(refId)) {
            cancelledSlipIds.add(refId);
          }
        });
      }
    } else if (cancellations) {
      // Create a Set of all slip IDs for fast O(1) lookup
      const slipIdSet = new Set(allBetSlips.map(s => String(s.slip_id).trim()));
      
      // Filter cancellations to only those that match our slip IDs (in-memory filter)
      cancellations.forEach(c => {
        const refId = String(c.reference_id || '').trim();
        if (refId && slipIdSet.has(refId)) {
          cancelledSlipIds.add(refId);
        }
      });
      
      console.log(`Found ${cancelledSlipIds.size} cancelled slips to exclude (queried ${cancellations.length} cancellation logs in date range)`);
    }
    
    // Filter out cancelled slips
    // CRITICAL: Ensure UUID comparison works correctly (both should be strings)
    const betSlips = (allBetSlips || []).filter(s => {
      const slipId = String(s.slip_id || '').trim();
      const isCancelled = cancelledSlipIds.has(slipId);
      return !isCancelled;
    });
    
    const excludedCount = (allBetSlips?.length || 0) - betSlips.length;
    console.log(`After filtering cancelled slips: ${betSlips.length} bet slips (excluded ${excludedCount} cancelled)`);
    console.log(`Cancelled slip IDs found: ${Array.from(cancelledSlipIds).slice(0, 5).join(', ')}...`);
    
    // Calculate total wagered with proper numeric handling
    const totalWagered = betSlips.reduce((sum, slip) => {
      const amount = parseFloat(slip.total_amount || 0);
      if (isNaN(amount)) {
        console.warn(`Invalid total_amount for slip ${slip.slip_id}: ${slip.total_amount}`);
        return sum;
      }
      return sum + amount;
    }, 0);
    
    console.log('Total Wagered (calculated):', totalWagered);
    console.log('Expected from DB (with cancellation filter): 433405');
    
    // Get claimed bet slips for total scanned (CRITICAL: Must exclude cancelled slips!)
    // Use the already-filtered betSlips array instead of querying again
    const claimedSlips = betSlips.filter(slip => slip.claimed === true);
    
    // Apply userId filter if specified
    const filteredClaimedSlips = userId && userId !== 'all' 
      ? claimedSlips.filter(slip => slip.user_id === parseInt(userId))
      : claimedSlips;
    
    const totalScanned = filteredClaimedSlips.reduce((sum, slip) => 
      sum + parseFloat(slip.payout_amount || 0), 0);
    
    console.log('Total Scanned (Claimed Winnings):', totalScanned);
    
    // Calculate margin (6% of wagered)
    const margin = totalWagered * 0.06;
    
    // Calculate net to pay
    const netToPay = totalWagered - totalScanned - margin;
    
    console.log('Calculations:', { margin, netToPay });
    
    // Per-user stats
    const userStatsMap = new Map();
    
    betSlips.forEach(slip => {
      const uid = slip.user_id;
      const wagered = parseFloat(slip.total_amount || 0);
      
      if (!userStatsMap.has(uid)) {
        userStatsMap.set(uid, {
          user_id: uid,
          wagered: 0,
          claimedWinnings: 0
        });
      }
      
      const stats = userStatsMap.get(uid);
      stats.wagered += wagered;
    });
    
    // Add claimed winnings per user (CRITICAL: Use already-filtered betSlips to exclude cancelled!)
    // Get claimed slips from the already-filtered betSlips array (cancelled already excluded)
    const claimedPerUser = betSlips.filter(slip => slip.claimed === true);
    
    console.log('Claimed per user count:', claimedPerUser.length);
    
    claimedPerUser.forEach(slip => {
      const uid = slip.user_id;
      if (userStatsMap.has(uid)) {
        const stats = userStatsMap.get(uid);
        stats.claimedWinnings += parseFloat(slip.payout_amount || 0);
      }
    });
    
    // Get user details
    const userIds = Array.from(userStatsMap.keys());
    let userDetailsMap = new Map();
    
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, user_id, first_name, last_name')
        .in('id', userIds);
      
      userDetailsMap = new Map((users || []).map(u => [u.id, u]));
    }
    
    // Build user stats array
    const userStats = Array.from(userStatsMap.entries()).map(([uid, stats]) => {
      const user = userDetailsMap.get(uid);
      const wagered = stats.wagered;
      const scanned = stats.claimedWinnings;
      const userMargin = wagered * 0.06;
      const userNetToPay = wagered - scanned - userMargin;
      
      return {
        user: user || { id: uid, first_name: 'Unknown', last_name: 'User', user_id: `USER_${uid}` },
        wagered,
        scanned,
        margin: userMargin,
        netToPay: userNetToPay
      };
    });
    
    // Sort by wagered descending
    userStats.sort((a, b) => b.wagered - a.wagered);
    
    console.log('✅ Stats calculated successfully');
    
    return c.json({
      success: true,
      data: {
        summary: {
          totalWagered,
          totalScanned,
          margin,
          netToPay
        },
        userStats
      }
    });
    
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/stats/trend
 * Get daily stats trend
 */
admin.get('/stats/trend', authenticate, authorize('admin'), async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    
    if (!startDate || !endDate) {
      return c.json({
        success: false,
        message: 'startDate and endDate are required'
      }, 400);
    }
    
    const supabase = getSupabaseClient(c.env);
    
    // CRITICAL: created_at/claimed_at are 'timestamp without time zone' and store IST values.
    // Do NOT convert to UTC — use plain IST strings for comparison.
    const startIST = `${startDate} 00:00:00`;
    const endIST = `${endDate} 23:59:59`;
    
    // Get all bet slips in range
    const { data: betSlips } = await supabase
      .from('bet_slips')
      .select('created_at, total_amount')
      .gte('created_at', startIST)
      .lte('created_at', endIST);
    
    // Get all claimed winnings in range
    const { data: claimedSlips } = await supabase
      .from('bet_slips')
      .select('claimed_at, payout_amount')
      .gte('claimed_at', startIST)
      .lte('claimed_at', endIST)
      .eq('claimed', true);
    
    // Group by date — created_at already stores IST, just extract date part
    const trendMap = new Map();
    
    (betSlips || []).forEach(slip => {
      // created_at is IST string like "2026-02-08 13:07:17" — just take date part
      const date = String(slip.created_at).substring(0, 10);
      if (!trendMap.has(date)) {
        trendMap.set(date, { date, wagered: 0, scanned: 0 });
      }
      trendMap.get(date).wagered += parseFloat(slip.total_amount || 0);
    });
    
    (claimedSlips || []).forEach(slip => {
      const date = String(slip.claimed_at).substring(0, 10);
      if (!trendMap.has(date)) {
        trendMap.set(date, { date, wagered: 0, scanned: 0 });
      }
      trendMap.get(date).scanned += parseFloat(slip.payout_amount || 0);
    });
    
    const trend = Array.from(trendMap.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime());
    
    return c.json({
      success: true,
      data: trend
    });
    
  } catch (error) {
    console.error('Get trend error:', error);
    return c.json({
      success: false,
      message: 'Failed to get trend data',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId/settlement-report
 * Get detailed settlement report for a game
 */
admin.get('/games/:gameId/settlement-report', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');
    
    // Get game
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single()
    );
    
    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }
    
    if (game.settlement_status !== 'settled') {
      return c.json({
        success: false,
        message: 'Game is not settled yet'
      }, 400);
    }
    
    // Get all bet slips
    const { data: betSlips } = await supabase
      .from('bet_slips')
      .select('*')
      .eq('game_id', gameId);
    
    // Get bet details
    const { data: betDetails } = await supabase
      .from('bet_details')
      .select('*')
      .eq('game_id', gameId);
    
    // Get cancelled slips
    const slipIds = betSlips?.map(s => s.slip_id) || [];
    const { data: cancellations } = await supabase
      .from('wallet_logs')
      .select('reference_id')
      .eq('reference_type', 'cancellation')
      .in('reference_id', slipIds);
    
    const cancelledSlipIds = new Set(cancellations?.map(c => c.reference_id) || []);
    
    // Calculate statistics
    const activeBetSlips = (betSlips || []).filter(s => !cancelledSlipIds.has(s.slip_id));
    
    const totalWagered = activeBetSlips.reduce((sum, s) => 
      sum + parseFloat(s.total_amount || 0), 0);
    
    const winningSlips = activeBetSlips.filter(s => s.status === 'won');
    const totalPayout = winningSlips.reduce((sum, s) => 
      sum + parseFloat(s.payout_amount || 0), 0);
    
    const claimedSlips = winningSlips.filter(s => s.claimed === true);
    const unclaimedSlips = winningSlips.filter(s => !s.claimed);
    const totalClaimed = claimedSlips.reduce((sum, s) => 
      sum + parseFloat(s.payout_amount || 0), 0);
    const totalUnclaimed = unclaimedSlips.reduce((sum, s) => 
      sum + parseFloat(s.payout_amount || 0), 0);
    
    // Build winning slips array with bet details
    const winningSlipsWithDetails = await Promise.all(
      winningSlips.map(async (slip) => {
        // Get bet details for this slip (use slip.id as FK, not slip.slip_id)
        const { data: slipBetDetails } = await supabase
          .from('bet_details')
          .select('*')
          .eq('slip_id', slip.id)
          .eq('card_number', game.winning_card);
        
        const winningBets = (slipBetDetails || []).map(bd => ({
          card_number: bd.card_number,
          bet_amount: parseFloat(bd.bet_amount || 0),
          payout_amount: parseFloat(bd.payout_amount || 0)
        }));
        
        return {
          slip_id: slip.slip_id,
          barcode: slip.barcode,
          user_id: slip.user_id,
          total_amount: parseFloat(slip.total_amount || 0),
          payout_amount: parseFloat(slip.payout_amount || 0),
          claimed: slip.claimed || false,
          winning_bets: winningBets
        };
      })
    );
    
    return c.json({
      success: true,
      data: {
        game: {
          game_id: game.game_id,
          start_time: formatIST(new Date(game.start_time)),
          end_time: formatIST(new Date(game.end_time)),
          winning_card: game.winning_card,
          payout_multiplier: parseFloat(game.payout_multiplier || 10),
          settlement_status: game.settlement_status,
          settlement_completed_at: game.settlement_completed_at ? formatIST(new Date(game.settlement_completed_at)) : null
        },
        summary: {
          total_winning_slips: winningSlips.length,
          total_payout: totalPayout,
          claim_summary: {
            claimed: {
              count: claimedSlips.length,
              amount: totalClaimed
            },
            unclaimed: {
              count: unclaimedSlips.length,
              amount: totalUnclaimed
            }
          }
        },
        winning_slips: winningSlipsWithDetails
      }
    });
    
  } catch (error) {
    console.error('Get settlement report error:', error);
    return c.json({
      success: false,
      message: 'Failed to get settlement report',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId/stats
 * Get game statistics
 */
admin.get('/games/:gameId/stats', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');

    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .maybeSingle()
    );

    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }

    // Get ALL bet slips for this game
    const { data: allBetSlips } = await supabase
      .from('bet_slips')
      .select('*')
      .eq('game_id', gameId);

    // Get cancelled slip IDs for this game (same logic as Node.js)
    const cancelledSlipUuids = new Set();
    const cancelledSlipDbIds = new Set();
    
    if (allBetSlips && allBetSlips.length > 0) {
      const slipIds = allBetSlips.map(slip => slip.slip_id);
      const { data: cancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);
      
      (cancellations || []).forEach(log => {
        if (log.reference_id) {
          cancelledSlipUuids.add(log.reference_id);
        }
      });
      
      // Map cancelled UUIDs to database IDs
      allBetSlips.forEach(slip => {
        if (cancelledSlipUuids.has(slip.slip_id)) {
          cancelledSlipDbIds.add(slip.id);
        }
      });
    }

    // Filter out cancelled slips (same as Node.js)
    const betSlips = (allBetSlips || []).filter(slip => !cancelledSlipUuids.has(slip.slip_id));

    // Get ALL bet details for this game
    const { data: allBetDetails } = await supabase
      .from('bet_details')
      .select('*')
      .eq('game_id', gameId);

    // Filter out bet details from cancelled slips (same as Node.js)
    const betDetails = (allBetDetails || []).filter(bd => !cancelledSlipDbIds.has(bd.slip_id));

    // Calculate card breakdown (excluding cancelled bets)
    const cardBreakdown = [];
    for (let card = 1; card <= 12; card++) {
      const betsOnCard = betDetails.filter(bd => bd.card_number === card);
      const totalBetOnCard = betsOnCard.reduce((sum, bd) => 
        sum + parseFloat(bd.bet_amount || 0), 0);
      
      cardBreakdown.push({
        card_number: card,
        total_bet_amount: totalBetOnCard,
        bets_count: betsOnCard.length,
        is_winning_card: card === game.winning_card
      });
    }

    // Calculate totals and slip breakdown (excluding cancelled slips - same as Node.js)
    const totalSlips = betSlips.length;
    const totalWagered = betSlips.reduce((sum, slip) => sum + parseFloat(slip.total_amount || 0), 0);
    const winningSlips = betSlips.filter(s => s.status === 'won');
    const losingSlips = betSlips.filter(s => s.status === 'lost');
    const pendingSlips = betSlips.filter(s => s.status === 'pending');
    const totalPayout = winningSlips.reduce((sum, s) => sum + parseFloat(s.payout_amount || 0), 0);
    const profit = totalWagered - totalPayout;

    // Format game with IST timestamps
    const formattedGame = {
      ...game,
      start_time_ist: formatIST(new Date(game.start_time), 'yyyy-MM-dd HH:mm:ss'),
      end_time_ist: formatIST(new Date(game.end_time), 'yyyy-MM-dd HH:mm:ss'),
      created_at_ist: formatIST(new Date(game.created_at), 'yyyy-MM-dd HH:mm:ss'),
    };

    return c.json({
      success: true,
      data: {
        game: formattedGame,
        statistics: {
          total_slips: totalSlips,
          total_wagered: totalWagered,
          total_payout: totalPayout,
          profit: profit,
          slip_breakdown: {
            pending: pendingSlips.length,
            won: winningSlips.length,
            lost: losingSlips.length
          }
        },
        card_totals: cardBreakdown.map(card => ({
          card_number: card.card_number,
          total_bet_amount: card.total_bet_amount
        }))
      }
    });
  } catch (error) {
    console.error('Get game stats error:', error);
    return c.json({
      success: false,
      message: 'Failed to get game stats',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId/bets
 * Get bets for a specific game with pagination
 */
admin.get('/games/:gameId/bets', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    // Get total count
    const { count } = await supabase
      .from('bet_slips')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId);

    // Get paginated bet slips
    const { data: betSlips } = await supabase
      .from('bet_slips')
      .select(`
        *,
        users!inner(user_id, first_name, last_name, email, mobile)
      `)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Get cancelled slip IDs for this game (same logic as Node.js)
    const slipIds = (betSlips || []).map(slip => slip.slip_id);
    const cancelledSlipIds = new Set();
    
    if (slipIds.length > 0) {
      const { data: cancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);
      
      (cancellations || []).forEach(log => {
        if (log.reference_id) {
          cancelledSlipIds.add(log.reference_id);
        }
      });
    }
    
    // Get bet details for each slip
    const slipsWithDetails = await Promise.all(
      (betSlips || []).map(async (slip) => {
        // Check if slip is cancelled
        const isCancelled = cancelledSlipIds.has(slip.slip_id);
        
        // NOTE: bet_details.slip_id is a BIGINT FK to bet_slips.id (not the UUID slip_id string)
        const { data: details } = await supabase
          .from('bet_details')
          .select('*')
          .eq('slip_id', slip.id);
        
        // Determine display status (show "cancelled" if cancelled, otherwise show actual status)
        let displayStatus = slip.status;
        if (isCancelled) {
          displayStatus = 'cancelled'; // Override status to show cancelled clearly
        }
        
        return {
          slip_id: slip.slip_id, // UUID string
          barcode: slip.barcode,
          total_amount: parseFloat(slip.total_amount || 0),
          payout_amount: parseFloat(slip.payout_amount || 0),
          status: displayStatus, // Show "cancelled" if cancelled, otherwise original status
          is_cancelled: isCancelled, // Boolean flag for frontend styling
          cancelled: isCancelled, // Alternative field name (for compatibility)
          claimed: slip.claimed || false,
          claimed_at: slip.claimed_at,
          created_at: slip.created_at,
          user: slip.users ? {
            user_id: slip.users.user_id,
            first_name: slip.users.first_name,
            last_name: slip.users.last_name,
            email: slip.users.email,
            mobile: slip.users.mobile
          } : null,
          bets: (details || []).map(bd => ({
            card_number: bd.card_number,
            bet_amount: parseFloat(bd.bet_amount || 0),
            payout_amount: parseFloat(bd.payout_amount || 0),
            is_winner: bd.is_winner || false
          }))
        };
      })
    );

    return c.json({
      success: true,
      data: slipsWithDetails,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Get game bets error:', error);
    return c.json({
      success: false,
      message: 'Failed to get game bets',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId/users
 * Get user statistics for a specific game
 */
admin.get('/games/:gameId/users', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);

    // Get all bet slips for this game grouped by user
    const { data: betSlips } = await supabase
      .from('bet_slips')
      .select(`
        *,
        users!inner(user_id, first_name, last_name, email, mobile)
      `)
      .eq('game_id', gameId);

    // Group by user and calculate stats
    const userStatsMap = new Map();
    
    (betSlips || []).forEach(slip => {
      const userId = slip.user_id;
      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          user_id: slip.users.user_id,
          first_name: slip.users.first_name,
          last_name: slip.users.last_name,
          email: slip.users.email,
          mobile: slip.users.mobile,
          total_bets: 0,
          total_wagered: 0,
          total_payout: 0,
          won_count: 0,
          lost_count: 0,
          pending_count: 0
        });
      }
      
      const stats = userStatsMap.get(userId);
      stats.total_bets++;
      stats.total_wagered += parseFloat(slip.total_amount || 0);
      
      if (slip.status === 'won') {
        stats.won_count++;
        stats.total_payout += parseFloat(slip.payout_amount || 0);
      } else if (slip.status === 'lost') {
        stats.lost_count++;
      } else {
        stats.pending_count++;
      }
    });

    const userStats = Array.from(userStatsMap.values()).map(stats => ({
      user: {
        user_id: stats.user_id,
        first_name: stats.first_name,
        last_name: stats.last_name,
        email: stats.email,
        mobile: stats.mobile
      },
      totals: {
        total_bet_amount: stats.total_wagered,
        total_winning_amount: stats.total_payout,
        total_claimed_amount: stats.total_payout, // TODO: Calculate actual claimed amount if needed
        total_bets: stats.total_bets,
        won_count: stats.won_count,
        lost_count: stats.lost_count,
        pending_count: stats.pending_count,
        profit: stats.total_payout - stats.total_wagered
      }
    }));

    return c.json({
      success: true,
      data: userStats
    });
  } catch (error) {
    console.error('Get game user stats error:', error);
    return c.json({
      success: false,
      message: 'Failed to get game user stats',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/admin/games/:gameId
 * Get single game details (basic info only)
 * IMPORTANT: This must come AFTER all specific /games/* routes to avoid route conflicts
 */
admin.get('/games/:gameId', authenticate, authorize('admin'), async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);
    const { formatIST, parseISTDateTime } = await import('../utils/timezone.js');

    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .maybeSingle()
    );

    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }

    // Get ALL bet slips for this game
    const { data: allBetSlips } = await supabase
      .from('bet_slips')
      .select(`
        *,
        users!inner(user_id, first_name, last_name)
      `)
      .eq('game_id', gameId);

    // Get cancelled slip IDs (same logic as Node.js)
    const cancelledSlipIds = new Set();
    if (allBetSlips && allBetSlips.length > 0) {
      const slipIds = allBetSlips.map(slip => slip.slip_id);
      const { data: cancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);
      
      (cancellations || []).forEach(log => {
        if (log.reference_id) {
          cancelledSlipIds.add(log.reference_id);
        }
      });
    }
    
    // Add is_cancelled flag to each slip (so frontend can identify cancelled slips)
    const betSlipsWithCancellation = (allBetSlips || []).map(slip => ({
      ...slip,
      is_cancelled: cancelledSlipIds.has(slip.slip_id)
    }));

    // Calculate totals EXCLUDING cancelled slips (same as Node.js)
    const nonCancelledSlips = (allBetSlips || []).filter(slip => !cancelledSlipIds.has(slip.slip_id));
    const totalWagered = nonCancelledSlips.reduce((sum, slip) => sum + parseFloat(slip.total_amount || 0), 0);

    // Format game with IST timestamps
    const formattedGame = {
      ...game,
      start_time_ist: formatIST(parseISTDateTime(game.start_time), 'yyyy-MM-dd HH:mm:ss'),
      end_time_ist: formatIST(parseISTDateTime(game.end_time), 'yyyy-MM-dd HH:mm:ss'),
      created_at_ist: formatIST(new Date(game.created_at), 'yyyy-MM-dd HH:mm:ss'),
      total_bets: nonCancelledSlips.length, // Exclude cancelled
      total_wagered: totalWagered // Exclude cancelled
    };

    return c.json({
      success: true,
      data: formattedGame,
      bet_slips: betSlipsWithCancellation // Include all slips with is_cancelled flag
    });
  } catch (error) {
    console.error('Get game detail error:', error);
    return c.json({
      success: false,
      message: 'Failed to get game details',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/admin/slips/:identifier/cancel
 * Admin can cancel any slip
 */
admin.post('/slips/:identifier/cancel', authenticate, authorize('admin'), async (c) => {
  try {
    const identifier = c.req.param('identifier');
    const adminUser = c.get('user');
    const { reason } = await c.req.json().catch(() => ({}));
    
    const { cancelSlip } = await import('../services/slipCancellationService.js');
    
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    const result = await cancelSlip(
      c.env,
      identifier,
      adminUser.id,
      true, // isAdmin
      reason || 'Cancelled by admin',
      ipAddress,
      userAgent
    );
    
    return c.json({
      success: true,
      message: 'Slip cancelled successfully by admin',
      data: result
    });
    
  } catch (error) {
    console.error('Admin cancel slip error:', error);
    
    if (error.message.includes('not found')) {
      return c.json({
        success: false,
        message: error.message
      }, 404);
    }
    
    return c.json({
      success: false,
      message: 'Failed to cancel slip',
      error: error.message
    }, 400);
  }
});

/**
 * POST /api/admin/recovery
 * Trigger recovery process to create missing games and settle stuck games
 */
admin.post('/recovery', async (c) => {
  try {
    const { runRecovery } = await import('../cron.js');
    const result = await runRecovery(c.env);
    
    return c.json({
      success: result.success,
      message: result.success ? 'Recovery completed successfully' : 'Recovery failed',
      data: result
    });
  } catch (error) {
    console.error('Recovery error:', error);
    return c.json({ success: false, message: 'Recovery failed', error: error.message }, 500);
  }
});

export default admin;
