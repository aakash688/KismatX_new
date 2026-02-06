/**
 * Wallet Routes - Complete Implementation
 * Handles wallet transactions and transaction history
 */

import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth.js';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';

const wallet = new Hono();

// All wallet routes require authentication
wallet.use('*', authenticate);

/**
 * GET /api/wallet/logs
 * Get all wallet logs (Admin only)
 */
wallet.get('/logs', authorize('Admin'), async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    // Get wallet logs with user info
    const logs = await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .select(`
          *,
          users!inner(user_id, first_name, last_name, email)
        `)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false })
    );

    const { count } = await supabase
      .from('wallet_logs')
      .select('id', { count: 'exact', head: true });

    return c.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get wallet logs error:', error);
    return c.json({
      success: false,
      message: 'Failed to get wallet logs',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/wallet/summary/:user_id
 * Get user wallet summary (Admin only)
 */
wallet.get('/summary/:user_id', authorize('Admin'), async (c) => {
  try {
    const userId = c.req.param('user_id');
    const supabase = getSupabaseClient(c.env);

    // Get user with wallet balance
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id, first_name, last_name, email, deposit_amount')
        .eq('id', userId)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    // Get wallet statistics
    const { data: stats } = await supabase
      .rpc('get_user_wallet_stats', { p_user_id: parseInt(userId) });

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          user_id: user.user_id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          balance: user.deposit_amount
        },
        stats: stats || {
          total_deposits: 0,
          total_withdrawals: 0,
          total_bets: 0,
          total_winnings: 0
        }
      }
    });
  } catch (error) {
    console.error('Get wallet summary error:', error);
    return c.json({
      success: false,
      message: 'Failed to get wallet summary',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/wallet/transaction
 * Create transaction (Admin only - deposit/withdrawal)
 */
wallet.post('/transaction', authorize('Admin'), async (c) => {
  try {
    const body = await c.req.json();
    
    // Support both frontend formats
    const user_id = body.user_id;
    const amount = body.amount;
    const transaction_type = body.transaction_type; // 'recharge', 'withdrawal', 'game'
    const transaction_direction = body.transaction_direction; // 'credit', 'debit'
    const comment = body.comment || body.description;
    const game_id = body.game_id;

    if (!user_id || !amount || (!transaction_type && !transaction_direction)) {
      return c.json({
        success: false,
        message: 'user_id, amount, and type are required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id, deposit_amount')
        .eq('id', user_id)
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    const amountValue = parseFloat(amount);
    let newBalance = parseFloat(user.deposit_amount || 0);
    const oldBalance = newBalance;

    // Determine if credit or debit
    const isCredit = transaction_direction === 'credit' || 
                     transaction_type === 'recharge' || 
                     transaction_type === 'deposit' ||
                     transaction_type === 'win';

    // Update balance
    if (isCredit) {
      newBalance += amountValue;
    } else {
      newBalance -= amountValue;
    }

    // Ensure balance doesn't go negative
    if (newBalance < 0) {
      return c.json({
        success: false,
        message: 'Insufficient balance'
      }, 400);
    }

    // Update user balance
    await executeQuery(() =>
      supabase
        .from('users')
        .update({ 
          deposit_amount: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', user_id)
    );

    // Create wallet log
    const log = await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .insert({
          user_id: user.id,
          amount: amountValue,
          transaction_type: transaction_type || (isCredit ? 'recharge' : 'withdrawal'),
          transaction_direction: isCredit ? 'credit' : 'debit',
          comment: comment,
          game_id: game_id || null
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
          action: 'wallet_transaction_created',
          target_type: 'wallet',
          target_id: log.id,
          details: `Admin created ${isCredit ? 'credit' : 'debit'} transaction of ₹${amountValue} for user: ${user.user_id}`,
          ip_address: c.req.header('CF-Connecting-IP') || 'unknown',
          user_agent: c.req.header('User-Agent') || 'unknown'
        })
    );

    return c.json({
      success: true,
      message: 'Transaction created successfully',
      transaction: log,
      user: {
        id: user.id,
        user_id: user.user_id,
        old_balance: oldBalance,
        new_balance: newBalance
      }
    }, 201);
  } catch (error) {
    console.error('Create transaction error:', error);
    return c.json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/wallet/transaction/:id
 * Get specific transaction (Admin only)
 */
wallet.get('/transaction/:id', authorize('Admin'), async (c) => {
  try {
    const transactionId = c.req.param('id');
    const supabase = getSupabaseClient(c.env);

    const transaction = await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .select(`
          *,
          users!inner(user_id, first_name, last_name, email)
        `)
        .eq('id', transactionId)
        .single()
    );

    if (!transaction) {
      return c.json({
        success: false,
        message: 'Transaction not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: { transaction }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    return c.json({
      success: false,
      message: 'Failed to get transaction',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/wallet/:user_id
 * Get user transactions
 */
wallet.get('/:user_id', async (c) => {
  try {
    const requestedUserId = parseInt(c.req.param('user_id'));
    const currentUser = c.get('user');
    
    // Check permissions
    const isAdmin = currentUser.user_type === 'admin';
    if (!isAdmin && currentUser.id !== requestedUserId) {
      return c.json({
        success: false,
        message: 'Permission denied'
      }, 403);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient(c.env);

    // Get transactions
    const transactions = await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .select('*')
        .eq('user_id', requestedUserId)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false })
    );

    const { count } = await supabase
      .from('wallet_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', requestedUserId);

    return c.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user transactions error:', error);
    return c.json({
      success: false,
      message: 'Failed to get transactions',
      error: error.message
    }, 500);
  }
});

export default wallet;
