/**
 * Betting Routes - Complete Implementation
 * Handles all betting-related endpoints
 */

import { Hono } from 'hono';
import { authenticate, authorize } from '../middleware/auth.js';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const betting = new Hono();

// Apply authentication to all betting routes
betting.use('*', authenticate);

/**
 * POST /api/bets/place
 * Place a bet
 */
betting.post('/place', async (c) => {
  try {
    const user = c.get('user');
    const { game_id, bets } = await c.req.json();

    if (!game_id || !bets || !Array.isArray(bets)) {
      return c.json({
        success: false,
        message: 'game_id and bets array are required'
      }, 400);
    }

    // Get idempotency key
    const idempotencyKey = c.req.header('x-idempotency-key') || uuidv4();

    const supabase = getSupabaseClient(c.env);

    // Check for duplicate request
    const existing = await executeQuery(() =>
      supabase
        .from('bet_slips')
        .select('slip_id, barcode, game_id, total_amount, created_at')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
    );

    if (existing) {
      return c.json({
        success: true,
        message: 'Bet already placed (duplicate request)',
        data: {
          slip_id: existing.slip_id,
          barcode: existing.barcode,
          game_id: existing.game_id,
          total_amount: parseFloat(existing.total_amount || 0),
          created_at: existing.created_at,
          duplicate: true
        }
      });
    }

    // Get game (use maybeSingle to avoid "Cannot coerce" error if game not found)
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', game_id)
        .maybeSingle()
    );

    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }

    // CRITICAL: Check game status - only allow betting on active games
    if (game.status !== 'active') {
      return c.json({
        success: false,
        message: `Game is not active for betting. Current status: ${game.status}`
      }, 400);
    }

    // CRITICAL: Check if game's end_time has passed - stop taking bets after game ends
    const { parseISTDateTime, nowIST } = await import('../utils/timezone.js');
    const gameEndTime = parseISTDateTime(game.end_time);
    const currentTime = nowIST();
    
    if (gameEndTime && currentTime && gameEndTime.getTime() <= currentTime.getTime()) {
      return c.json({
        success: false,
        message: 'Betting is closed. Game has already ended.'
      }, 400);
    }

    // Validate bets and calculate total amount
    const normalizedBets = bets.map((b) => ({
      card_number: Number(b.card_number),
      bet_amount: Number(b.bet_amount ?? b.amount) // backward compatible
    }));

    if (normalizedBets.length === 0) {
      return c.json({ success: false, message: 'At least 1 bet is required' }, 400);
    }

    for (const b of normalizedBets) {
      if (!Number.isInteger(b.card_number) || b.card_number < 1 || b.card_number > 12) {
        return c.json({ success: false, message: 'card_number must be an integer between 1 and 12' }, 400);
      }
      if (!Number.isFinite(b.bet_amount) || b.bet_amount <= 0) {
        return c.json({ success: false, message: 'bet_amount must be a positive number' }, 400);
      }
    }

    const total_amount = normalizedBets.reduce((sum, bet) => sum + bet.bet_amount, 0);

    // Check user balance
    // Re-fetch latest balance to avoid stale token/user cache
    const dbUser = await executeQuery(() =>
      supabase
        .from('users')
        .select('id, user_id, deposit_amount')
        .eq('id', user.id)
        .single()
    );

    const currentBalance = parseFloat(dbUser.deposit_amount || 0);
    if (currentBalance < total_amount) {
      return c.json({
        success: false,
        message: 'Insufficient balance'
      }, 400);
    }

    // Generate slip_id and barcode
    const slip_id = uuidv4();
    const barcode = Math.random().toString(36).substr(2, 13).toUpperCase();

    // Create bet slip
    const betSlip = await executeQuery(() =>
      supabase
        .from('bet_slips')
        .insert({
          slip_id,
          user_id: user.id,
          game_id,
          total_amount,
          barcode,
          idempotency_key: idempotencyKey,
          status: 'pending',
          payout_amount: 0
        })
        .select('id, slip_id, barcode, game_id, total_amount, created_at')
        .single()
    );

    // Create bet details
    // NOTE: bet_details.slip_id is a BIGINT FK to bet_slips.id (not the UUID slip_id string)
    const betDetailsToInsert = normalizedBets.map(bet => ({
      slip_id: betSlip.id,
      card_number: bet.card_number,
      bet_amount: bet.bet_amount,
      payout_amount: 0,
      is_winner: false,
      game_id,
      user_id: user.id
    }));

    // OPTIMIZED: Run bet_details insert, balance update, and wallet log in parallel
    // All 3 are independent of each other (they only depend on betSlip.id which we already have)
    const newBalance = currentBalance - total_amount;

    const [insertedBetDetails] = await Promise.all([
      // 1. Insert bet details and get IDs back (for response)
      executeQuery(() =>
        supabase
          .from('bet_details')
          .insert(betDetailsToInsert)
          .select('id, card_number, bet_amount')
      ),
      // 2. Update user balance
      executeQuery(() =>
        supabase
          .from('users')
          .update({ deposit_amount: newBalance, updated_at: new Date().toISOString() })
          .eq('id', user.id)
      ),
      // 3. Create wallet log (match Node.js reference_type: 'bet_placement')
      executeQuery(() =>
        supabase
          .from('wallet_logs')
          .insert({
            user_id: user.id,
            amount: total_amount,
            transaction_type: 'game',
            transaction_direction: 'debit',
            comment: `Bet placed on game ${game_id}`,
            reference_type: 'bet_placement',
            reference_id: slip_id
          })
      )
    ]);

    // Format bets response to match Node.js format (include id field)
    const betsResponse = (insertedBetDetails || []).map(bd => ({
      card_number: bd.card_number,
      bet_amount: parseFloat(bd.bet_amount),
      id: bd.id
    }));

    return c.json({
      success: true,
      message: 'Bet placed successfully',
      data: {
        slip_id,
        barcode,
        game_id,
        total_amount,
        bets: betsResponse,
        new_balance: newBalance,
        created_at: betSlip.created_at
      }
    }, 201);

  } catch (error) {
    console.error('Place bet error:', error);
    return c.json({
      success: false,
      message: 'Failed to place bet',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/bets/claim
 * Claim winnings
 */
betting.post('/claim', async (c) => {
  try {
    const user = c.get('user');
    const { identifier } = await c.req.json();

    if (!identifier) {
      return c.json({
        success: false,
        message: 'Slip ID or barcode is required'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);

    // Find bet slip
    const { data: slips } = await supabase
      .from('bet_slips')
      .select('*')
      .or(`slip_id.eq.${identifier},barcode.eq.${identifier}`);

    if (!slips || slips.length === 0) {
      return c.json({
        success: false,
        message: 'Bet slip not found'
      }, 404);
    }

    const betSlip = slips[0];

    // Check ownership
    if (betSlip.user_id !== user.id) {
      return c.json({
        success: false,
        message: 'You can only claim your own bets'
      }, 403);
    }

    // Check if already claimed
    if (betSlip.claimed) {
      return c.json({
        success: false,
        message: 'Winnings already claimed'
      }, 400);
    }

    // Get game information to check settlement status (separate query - no FK relationship)
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', betSlip.game_id)
      .maybeSingle();

    if (!game) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }

    // Check if game is settled
    if (game.settlement_status !== 'settled') {
      return c.json({
        success: false,
        message: 'Game is not settled yet. Please wait for the game to be settled before claiming.'
      }, 400);
    }

    // Check if won (status should be 'won' after settlement)
    if (betSlip.status !== 'won') {
      return c.json({
        success: false,
        message: 'This bet slip did not win'
      }, 400);
    }

    // Update bet slip
    await executeQuery(() =>
      supabase
        .from('bet_slips')
        .update({
          claimed: true,
          claimed_at: new Date().toISOString()
        })
        .eq('id', betSlip.id)
    );

    // Update user balance (re-fetch current balance to avoid stale user cache)
    const dbUser = await executeQuery(() =>
      supabase
        .from('users')
        .select('deposit_amount')
        .eq('id', user.id)
        .single()
    );
    const currentBalance = parseFloat(dbUser.deposit_amount || 0);
    const payoutAmount = parseFloat(betSlip.payout_amount || 0);
    const newBalance = currentBalance + payoutAmount;
    await executeQuery(() =>
      supabase
        .from('users')
        .update({ deposit_amount: newBalance, updated_at: new Date().toISOString() })
        .eq('id', user.id)
    );

    // Create wallet log
    await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .insert({
          user_id: user.id,
          amount: payoutAmount,
          transaction_type: 'game',
          transaction_direction: 'credit',
          comment: `Winnings claimed for slip ${betSlip.slip_id} (${betSlip.barcode}), Game: ${betSlip.game_id}`,
          reference_type: 'claim',
          reference_id: betSlip.slip_id
        })
    );

    return c.json({
      success: true,
      message: 'Winnings claimed successfully',
      data: {
        amount: betSlip.payout_amount,
        new_balance: newBalance,
        claimed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Claim winnings error:', error);
    return c.json({
      success: false,
      message: 'Failed to claim winnings',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/bets/slip/:identifier
 * Get bet slip details (requires ownership unless admin)
 */
betting.get('/slip/:identifier', async (c) => {
  try {
    const identifier = c.req.param('identifier');
    const user = c.get('user');
    const supabase = getSupabaseClient(c.env);
    const { formatIST, parseISTDateTime } = await import('../utils/timezone.js');

    const { data: slips } = await supabase
      .from('bet_slips')
      .select('*')
      .or(`slip_id.eq.${identifier},barcode.eq.${identifier}`);

    if (!slips || slips.length === 0) {
      return c.json({
        success: false,
        message: 'Bet slip not found'
      }, 404);
    }

    const betSlip = slips[0];

    // Check ownership unless admin
    if (user.user_type !== 'admin' && betSlip.user_id !== user.id) {
      return c.json({
        success: false,
        message: 'Bet slip not found' // Don't reveal existence
      }, 404);
    }

    // Get bet details
    const { data: betDetails } = await supabase
      .from('bet_details')
      .select('*')
      .eq('slip_id', betSlip.id)
      .order('card_number', { ascending: true });

    // Get game information (separate query since no FK relationship in Supabase)
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', betSlip.game_id)
      .maybeSingle();

    // Format response
    return c.json({
      success: true,
      data: {
        slip_id: betSlip.slip_id,
        barcode: betSlip.barcode,
        game_id: betSlip.game_id,
        total_amount: parseFloat(betSlip.total_amount || 0),
        payout_amount: parseFloat(betSlip.payout_amount || 0),
        status: betSlip.status,
        claimed: betSlip.claimed || false,
        claimed_at: betSlip.claimed_at ? formatIST(new Date(betSlip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null,
        created_at: formatIST(new Date(betSlip.created_at), 'yyyy-MM-dd HH:mm:ss'),
        game: game ? {
          game_id: game.game_id,
          start_time: formatIST(parseISTDateTime(game.start_time), 'yyyy-MM-dd HH:mm:ss'),
          end_time: formatIST(parseISTDateTime(game.end_time), 'yyyy-MM-dd HH:mm:ss'),
          status: game.status,
          winning_card: game.winning_card,
          payout_multiplier: parseFloat(game.payout_multiplier || 0),
          settlement_status: game.settlement_status
        } : null,
        bets: (betDetails || []).map(bd => ({
          id: bd.id,
          card_number: bd.card_number,
          bet_amount: parseFloat(bd.bet_amount || 0),
          is_winner: bd.is_winner || false,
          payout_amount: parseFloat(bd.payout_amount || 0)
        }))
      }
    });

  } catch (error) {
    console.error('Get bet slip error:', error);
    return c.json({
      success: false,
      message: 'Failed to get bet slip',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/bets/my-bets
 * Get user's bet history with optional status filter
 */
betting.get('/my-bets', async (c) => {
  try {
    const user = c.get('user');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const status = c.req.query('status'); // optional filter
    const offset = (page - 1) * limit;
    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');

    // OPTIMIZED: Select only needed columns for my-bets listing
    let query = supabase
      .from('bet_slips')
      .select('slip_id, barcode, game_id, total_amount, payout_amount, status, claimed, claimed_at, created_at', { count: 'exact' })
      .eq('user_id', user.id);

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Get paginated results
    const { data: bets, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    // Fetch games separately (no FK relationship in Supabase)
    const gameIds = bets?.map(b => b.game_id) || [];
    const gamesMap = new Map();
    
    if (gameIds.length > 0) {
      const { data: games } = await supabase
        .from('games')
        .select('game_id, start_time, status, winning_card')
        .in('game_id', gameIds);

      (games || []).forEach(g => {
        gamesMap.set(g.game_id, g);
      });
    }

    // Format bets with IST timestamps
    const formattedBets = (bets || []).map(slip => ({
      slip_id: slip.slip_id,
      barcode: slip.barcode,
      game_id: slip.game_id,
      total_amount: parseFloat(slip.total_amount || 0),
      payout_amount: parseFloat(slip.payout_amount || 0),
      status: slip.status,
      claimed: slip.claimed || false,
      claimed_at: slip.claimed_at ? formatIST(new Date(slip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null,
      created_at: formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss'),
      game: gamesMap.get(slip.game_id) || null
    }));

    return c.json({
      success: true,
      data: formattedBets,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNextPage: page * limit < (count || 0),
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Get my bets error:', error);
    return c.json({
      success: false,
      message: 'Failed to get bets',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/bets/stats
 * Get user betting statistics with daily breakdown
 * 
 * Query parameters:
 * - date_from: Start date (YYYY-MM-DD), defaults to first day of current month
 * - date_to: End date (YYYY-MM-DD), defaults to today
 * - game_id: Optional game ID (YYYYMMDDHHMM). If provided, returns all bets for that specific game
 */
betting.get('/stats', async (c) => {
  try {
    const user = c.get('user');
    const supabase = getSupabaseClient(c.env);
    const { formatIST, parseISTDateTime, nowIST } = await import('../utils/timezone.js');
    
    const date_from = c.req.query('date_from');
    const date_to = c.req.query('date_to');
    const game_id = c.req.query('game_id');

    // If game_id is provided, return detailed slip information for that game
    if (game_id) {
      // Get all bet slips for this user and this game
      const { data: allBetSlips } = await supabase
        .from('bet_slips')
        .select('*')
        .eq('user_id', user.id)
        .eq('game_id', game_id)
        .order('created_at', { ascending: true });

      if (!allBetSlips || allBetSlips.length === 0) {
        // Check if game exists and return same shape as Node.js (with game_start/end)
        const { data: game } = await supabase
          .from('games')
          .select('*')
          .eq('game_id', game_id)
          .single();

        if (!game) {
          return c.json({
            success: false,
            message: 'Game not found'
          }, 404);
        }

        const gameStartDatetime = formatIST(parseISTDateTime(game.start_time), 'yyyyMMddHHmm');
        const gameEndDatetime = formatIST(parseISTDateTime(game.end_time), 'yyyyMMddHHmm');

        return c.json({
          success: true,
          data: {
            game_id: game_id,
            game_start_datetime: gameStartDatetime,
            game_end_datetime: gameEndDatetime,
            total_slips: 0,
            slips: []
          }
        });
      }

      // Get cancelled slip IDs
      const slipIds = allBetSlips.map(slip => slip.slip_id);
      const { data: cancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);

      const cancelledSlipIds = new Set(cancellations?.map(c => c.reference_id) || []);

      // Filter out cancelled slips
      const betSlips = allBetSlips.filter(slip => !cancelledSlipIds.has(slip.slip_id));

      // Get game information
      const { data: game } = await supabase
        .from('games')
        .select('*')
        .eq('game_id', game_id)
        .single();

      if (!game) {
        return c.json({
          success: false,
          message: 'Game not found'
        }, 404);
      }

      // Format game times to YYYYMMDDHHMM
      const gameStartDatetime = formatIST(parseISTDateTime(game.start_time), 'yyyyMMddHHmm');
      const gameEndDatetime = formatIST(parseISTDateTime(game.end_time), 'yyyyMMddHHmm');

      // OPTIMIZED: Batch fetch all bet details for all slips in one query (saves N-1 subrequests)
      const slipDbIds = betSlips.map(s => s.id);
      const { data: allSlipBetDetails } = await supabase
        .from('bet_details')
        .select('slip_id, id')
        .in('slip_id', slipDbIds);

      // Group by slip_id to count cards per slip
      const cardCountMap = new Map();
      (allSlipBetDetails || []).forEach(bd => {
        cardCountMap.set(bd.slip_id, (cardCountMap.get(bd.slip_id) || 0) + 1);
      });

      const detailedSlips = betSlips.map(slip => ({
        game_id: slip.game_id,
        game_start_datetime: gameStartDatetime,
        game_end_datetime: gameEndDatetime,
        number_of_cards: cardCountMap.get(slip.id) || 0,
        total_amount: parseFloat(slip.total_amount || 0),
        total_winning_points: parseFloat(slip.payout_amount || 0),
        barcode: slip.barcode,
        issue_date_time: formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss'),
        status: slip.status,
        is_cancelled: false,
        claim_status: slip.claimed || false,
        claimed_at: slip.claimed_at ? formatIST(new Date(slip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null
      }));

      return c.json({
        success: true,
        data: {
          game_id: game_id,
          game_start_datetime: gameStartDatetime,
          game_end_datetime: gameEndDatetime,
          total_slips: detailedSlips.length,
          slips: detailedSlips
        }
      });
    }

    // Original stats logic when game_id is not provided
    // Parse date range (treat as IST dates)
    let startDate, endDate;
    let startDateStr, endDateStr;

    if (date_from) {
      startDateStr = date_from;
      const dateIST = new Date(date_from + 'T00:00:00+05:30'); // IST offset
      startDate = dateIST.toISOString();
    } else {
      // Default to first day of current month (IST)
      const now = nowIST();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      startDateStr = `${year}-${month}-01`;
      const dateIST = new Date(startDateStr + 'T00:00:00+05:30');
      startDate = dateIST.toISOString();
    }

    if (date_to) {
      endDateStr = date_to;
      const dateIST = new Date(date_to + 'T23:59:59+05:30'); // IST offset
      endDate = dateIST.toISOString();
    } else {
      // Default to today (IST)
      const now = nowIST();
      endDateStr = formatIST(now, 'yyyy-MM-dd');
      const dateIST = new Date(endDateStr + 'T23:59:59+05:30');
      endDate = dateIST.toISOString();
    }

    // OPTIMIZED: Select only needed columns for stats calculation (not *)
    const { data: allBetSlips } = await supabase
      .from('bet_slips')
      .select('slip_id, total_amount, payout_amount, status, claimed, created_at')
      .eq('user_id', user.id)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: true });

    // Get cancelled slip IDs
    const slipIds = allBetSlips?.map(slip => slip.slip_id) || [];
    const cancelledSlipIds = new Set();
    
    if (slipIds.length > 0) {
      const { data: cancellations } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds);

      cancellations?.forEach(log => {
        if (log.reference_id) {
          cancelledSlipIds.add(log.reference_id);
        }
      });
    }

    // Filter out cancelled slips
    const betSlips = (allBetSlips || []).filter(slip => !cancelledSlipIds.has(slip.slip_id));

    // Group by date and calculate totals
    const dailyStats = new Map();
    let totalBetsPlaced = 0;
    let totalWinnings = 0;
    let totalSlips = 0;
    let winningSlips = 0;
    let losingSlips = 0;
    let pendingSlips = 0;

    betSlips.forEach(slip => {
      const slipDate = new Date(slip.created_at);
      const dateKey = formatIST(slipDate, 'yyyy-MM-dd');

      // Initialize day stats if not exists
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, {
          date: dateKey,
          total_bets_placed: 0,
          total_winnings: 0,
          slips_count: 0,
          winning_slips: 0,
          losing_slips: 0,
          pending_slips: 0
        });
      }

      const dayStats = dailyStats.get(dateKey);
      const betAmount = parseFloat(slip.total_amount || 0);
      const payoutAmount = parseFloat(slip.payout_amount || 0);

      // Add to daily totals
      dayStats.total_bets_placed += betAmount;
      dayStats.slips_count += 1;

      // Add winnings only for won slips that have been claimed (status = 'won' AND claimed = true)
      if (slip.status === 'won' && slip.claimed === true) {
        dayStats.total_winnings += payoutAmount;
        dayStats.winning_slips += 1;
        totalWinnings += payoutAmount;
        winningSlips += 1;
      } else if (slip.status === 'lost') {
        dayStats.losing_slips += 1;
        losingSlips += 1;
      } else {
        dayStats.pending_slips += 1;
        pendingSlips += 1;
      }

      // Add to overall totals
      totalBetsPlaced += betAmount;
      totalSlips += 1;
    });

    // Convert map to array and sort by date
    const dailyBreakdown = Array.from(dailyStats.values()).sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );

    // Calculate net profit/loss
    const netProfit = totalWinnings - totalBetsPlaced;

    return c.json({
      success: true,
      data: {
        period: {
          date_from: startDateStr,
          date_to: endDateStr
        },
        summary: {
          total_bets_placed: parseFloat(totalBetsPlaced.toFixed(2)),
          total_winnings: parseFloat(totalWinnings.toFixed(2)),
          net_profit: parseFloat(netProfit.toFixed(2)),
          total_slips: totalSlips,
          winning_slips: winningSlips,
          losing_slips: losingSlips,
          pending_slips: pendingSlips
        },
        daily_breakdown: dailyBreakdown.map(day => ({
          date: day.date,
          total_bets_placed: parseFloat(day.total_bets_placed.toFixed(2)),
          total_winnings: parseFloat(day.total_winnings.toFixed(2)),
          net_profit: parseFloat((day.total_winnings - day.total_bets_placed).toFixed(2)),
          slips_count: day.slips_count,
          winning_slips: day.winning_slips,
          losing_slips: day.losing_slips,
          pending_slips: day.pending_slips
        }))
      }
    });

  } catch (error) {
    console.error('Get betting stats error:', error);
    return c.json({
      success: false,
      message: 'Failed to get betting statistics',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/bets/result/:identifier
 * Get bet slip result (read-only, does not claim)
 */
betting.get('/result/:identifier', async (c) => {
  try {
    const identifier = c.req.param('identifier');
    const supabase = getSupabaseClient(c.env);
    const { formatIST, parseISTDateTime } = await import('../utils/timezone.js');

    // Find slip by slip_id or barcode (case-insensitive for barcode)
    const { data: slips } = await supabase
      .from('bet_slips')
      .select('*')
      .or(`slip_id.eq.${identifier},barcode.ilike.${identifier}`);

    if (!slips || slips.length === 0) {
      return c.json({
        success: false,
        message: 'Bet slip not found',
        hint: 'Make sure you are using the correct barcode or slip ID. Barcode format: GAME_YYYYMMDDHHMM_UUIDPREFIX_CHECKSUM'
      }, 404);
    }

    const slip = slips[0];

    // Check if slip was cancelled
    const { data: cancellation } = await supabase
      .from('wallet_logs')
      .select('id')
      .eq('reference_type', 'cancellation')
      .eq('reference_id', slip.slip_id)
      .single();

    const isCancelled = !!cancellation;

    // Get bet details
    const { data: betDetails } = await supabase
      .from('bet_details')
      .select('*')
      .eq('slip_id', slip.id)
      .order('card_number', { ascending: true });

    // Get game information (separate query - no FK relationship)
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('game_id', slip.game_id)
      .maybeSingle();

    // Format response (read-only, no claim action)
    return c.json({
      success: true,
      cancelled: isCancelled,
      message: isCancelled ? 'This slip has been cancelled' : undefined,
      data: {
        slip_id: slip.slip_id,
        barcode: slip.barcode,
        game_id: slip.game_id,
        total_amount: parseFloat(slip.total_amount || 0),
        payout_amount: parseFloat(slip.payout_amount || 0),
        status: slip.status,
        claimed: slip.claimed || false,
        claimed_at: slip.claimed_at ? formatIST(new Date(slip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null,
        created_at: formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss'),
        can_claim: !isCancelled && slip.status === 'won' && !slip.claimed && game?.settlement_status === 'settled',
        cancelled: isCancelled,
        game: game ? {
          game_id: game.game_id,
          start_time: formatIST(parseISTDateTime(game.start_time), 'yyyy-MM-dd HH:mm:ss'),
          end_time: formatIST(parseISTDateTime(game.end_time), 'yyyy-MM-dd HH:mm:ss'),
          status: game.status,
          winning_card: game.winning_card,
          payout_multiplier: parseFloat(game.payout_multiplier || 0),
          settlement_status: game.settlement_status
        } : null,
        bets: (betDetails || []).map(bd => ({
          id: bd.id,
          card_number: bd.card_number,
          bet_amount: parseFloat(bd.bet_amount || 0),
          is_winner: bd.is_winner || false,
          payout_amount: parseFloat(bd.payout_amount || 0)
        }))
      }
    });

  } catch (error) {
    console.error('Get bet result error:', error);
    return c.json({
      success: false,
      message: 'Failed to get bet result',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/bets/cancel/:identifier
 * Cancel and refund bet slip (user can cancel their own)
 */
betting.post('/cancel/:identifier', async (c) => {
  try {
    const user = c.get('user');
    const identifier = c.req.param('identifier');
    const { reason } = await c.req.json().catch(() => ({}));
    
    const { cancelSlip } = await import('../services/slipCancellationService.js');
    
    // Check if user is admin
    const isAdmin = user.user_type === 'admin';
    
    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    const result = await cancelSlip(
      c.env,
      identifier,
      user.id,
      isAdmin,
      reason,
      ipAddress,
      userAgent
    );
    
    return c.json({
      success: true,
      message: 'Slip cancelled and refunded successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Cancel slip error:', error);
    
    if (error.message.includes('not found')) {
      return c.json({
        success: false,
        message: error.message
      }, 404);
    }
    
    if (error.message.includes('permission') ||
        error.message.includes('Cannot cancel') ||
        error.message.includes('already')) {
      return c.json({
        success: false,
        message: error.message
      }, 400);
    }
    
    return c.json({
      success: false,
      message: 'Failed to cancel slip',
      error: error.message
    }, 500);
  }
});

/**
 * POST /api/bets/scan-and-claim/:identifier
 * Scan barcode and claim winnings if winning (all-in-one)
 */
betting.post('/scan-and-claim/:identifier', async (c) => {
  try {
    const user = c.get('user');
    const identifier = c.req.param('identifier');
    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');
    const { logUserAction } = await import('../utils/auditLogger.js');

    // Extract IP and user agent (best-effort, non-critical)
    const ipAddress =
      c.req.header('cf-connecting-ip') ||
      (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    const userAgent = c.req.header('user-agent') || 'unknown';
    
    // Find bet slip (no nested query - fetch separately)
    const { data: slips } = await supabase
      .from('bet_slips')
      .select('id, slip_id, barcode, game_id, user_id, total_amount, payout_amount, status, claimed, claimed_at, created_at')
      .or(`slip_id.eq.${identifier},barcode.eq.${identifier}`);
    
    if (!slips || slips.length === 0) {
      return c.json({
        success: false,
        message: 'Bet slip not found'
      }, 404);
    }
    
    const slip = slips[0];

    // Check ownership early (before making more queries - saves subrequests on failure)
    if (slip.user_id !== user.id) {
      return c.json({
        success: false,
        message: 'You can only scan and claim your own slips'
      }, 403);
    }

    // OPTIMIZED: Run 3 queries in parallel instead of sequential (saves ~200ms latency)
    const [betDetailsResult, gameResult, dbUserResult] = await Promise.all([
      supabase
        .from('bet_details')
        .select('card_number, bet_amount, is_winner, payout_amount')
        .eq('slip_id', slip.id)
        .order('card_number', { ascending: true }),
      supabase
        .from('games')
        .select('game_id, winning_card, settlement_status, status')
        .eq('game_id', slip.game_id)
        .maybeSingle(),
      supabase
        .from('users')
        .select('deposit_amount, status')
        .eq('id', user.id)
        .single()
    ]);

    const betDetails = betDetailsResult.data;
    const game = gameResult.data;
    const dbUser = dbUserResult.data;

    if (!dbUser) {
      return c.json({
        success: false,
        message: 'User not found'
      }, 404);
    }

    if (dbUser.status && dbUser.status !== 'active') {
      return c.json({
        success: false,
        message: `Cannot claim winnings. Account status: ${dbUser.status}`
      }, 400);
    }
    
    // Check if cancelled
    const { data: cancellation } = await supabase
      .from('wallet_logs')
      .select('id')
      .eq('reference_type', 'cancellation')
      .eq('reference_id', slip.slip_id)
      .maybeSingle();
    
    if (cancellation) {
      return c.json({
        success: false,
        message: 'This slip has been cancelled and cannot be claimed',
        cancelled: true
      }, 400);
    }
    
    // If already claimed, return info
    if (slip.claimed === true) {
      const formattedGame = game ? {
        game_id: game.game_id,
        winning_card: game.winning_card,
        settlement_status: game.settlement_status
      } : null;

      return c.json({
        success: true,
        message: 'Slip has already been claimed',
        already_claimed: true,
        data: {
          slip_id: slip.slip_id,
          barcode: slip.barcode,
          game_id: slip.game_id,
          total_amount: parseFloat(slip.total_amount || 0),
          payout_amount: parseFloat(slip.payout_amount || 0),
          status: slip.status,
          claimed: true,
          claimed_at: slip.claimed_at ? formatIST(new Date(slip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null,
          created_at: slip.created_at ? formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss') : null,
          game: formattedGame,
          bets: (betDetails || []).map(bd => ({
            card_number: bd.card_number,
            bet_amount: parseFloat(bd.bet_amount || 0),
            is_winner: bd.is_winner || false,
            payout_amount: parseFloat(bd.payout_amount || 0)
          }))
        }
      });
    }
    
    // If slip is winning and not claimed, claim it
    if (slip.status === 'won' && !slip.claimed) {
      // Check if game is settled
      if (!game || game.settlement_status !== 'settled') {
        return c.json({
          success: false,
          message: 'Game is not settled yet. Cannot claim winnings.'
        }, 400);
      }
      
      const payoutAmount = parseFloat(slip.payout_amount || 0);
      
      if (payoutAmount <= 0) {
        return c.json({
          success: false,
          message: 'Payout amount is zero or invalid'
        }, 400);
      }
      
      // Race-safe claim: only mark claimed if it was not already claimed
      // (Supabase doesn't support explicit row locks here; this is our best-effort equivalent)
      const claimTimestampIso = new Date().toISOString();
      const { data: claimedSlipRows, error: claimUpdateError } = await supabase
        .from('bet_slips')
        .update({
          claimed: true,
          claimed_at: claimTimestampIso
        })
        .eq('id', slip.id)
        .eq('claimed', false)
        .select('*');

      if (claimUpdateError) {
        throw claimUpdateError;
      }

      const claimedSlip = (claimedSlipRows || [])[0];
      if (!claimedSlip) {
        // Someone else already claimed it (or it got claimed concurrently)
        return c.json({
          success: false,
          message: 'This slip has already been claimed'
        }, 400);
      }
      
      // Update user balance
      const newBalance = parseFloat(dbUser.deposit_amount || 0) + payoutAmount;
      
      await executeQuery(() =>
        supabase
          .from('users')
          .update({ deposit_amount: newBalance })
          .eq('id', user.id)
      );
      
      // Create wallet log (no 'status' column in wallet_logs table)
      await executeQuery(() =>
        supabase
          .from('wallet_logs')
          .insert({
            user_id: user.id,
            transaction_type: 'game',
            amount: payoutAmount,
            transaction_direction: 'credit',
            comment: `Winnings claimed for slip ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}`,
            reference_type: 'claim',
            reference_id: slip.slip_id
          })
      );

      // Audit log (non-critical, fire-and-forget)
      logUserAction(
        c.env,
        user.id,
        'winnings_claimed',
        'bet_slip',
        slip.id,
        `Winnings claimed: Slip ${slip.slip_id}, Amount: ${payoutAmount}, Game: ${slip.game_id}`,
        ipAddress,
        userAgent
      ).catch(() => {});

      const formattedGame = game ? {
        game_id: game.game_id,
        winning_card: game.winning_card,
        settlement_status: game.settlement_status
      } : null;
      
      return c.json({
        success: true,
        message: 'Winnings claimed successfully',
        claimed: true,
        data: {
          slip_id: slip.slip_id,
          barcode: slip.barcode,
          game_id: slip.game_id,
          total_amount: parseFloat(claimedSlip.total_amount || slip.total_amount || 0),
          payout_amount: payoutAmount,
          status: claimedSlip.status || slip.status,
          claimed: true,
          claimed_at: formatIST(new Date(claimTimestampIso), 'yyyy-MM-dd HH:mm:ss'),
          created_at: slip.created_at ? formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss') : null,
          new_balance: newBalance,
          game: formattedGame,
          bets: (betDetails || []).map(bd => ({
            card_number: bd.card_number,
            bet_amount: parseFloat(bd.bet_amount || 0),
            is_winner: bd.is_winner || false,
            payout_amount: parseFloat(bd.payout_amount || 0)
          }))
        }
      });
    } else {
      // Slip is not winning or cannot be claimed
      const formattedGame = game ? {
        game_id: game.game_id,
        winning_card: game.winning_card,
        settlement_status: game.settlement_status
      } : null;

      return c.json({
        success: true,
        message: slip.status === 'won' ? 'Slip is winning but cannot be claimed yet' : `Slip status: ${slip.status}`,
        claimed: false,
        data: {
          slip_id: slip.slip_id,
          barcode: slip.barcode,
          game_id: slip.game_id,
          total_amount: parseFloat(slip.total_amount || 0),
          payout_amount: parseFloat(slip.payout_amount || 0),
          status: slip.status,
          claimed: slip.claimed || false,
          created_at: slip.created_at ? formatIST(new Date(slip.created_at), 'yyyy-MM-dd HH:mm:ss') : null,
          game: formattedGame,
          bets: (betDetails || []).map(bd => ({
            card_number: bd.card_number,
            bet_amount: parseFloat(bd.bet_amount || 0),
            is_winner: bd.is_winner || false,
            payout_amount: parseFloat(bd.payout_amount || 0)
          }))
        }
      });
    }
    
  } catch (error) {
    console.error('Scan and claim error:', error);
    return c.json({
      success: false,
      message: 'Failed to process scan and claim',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/bets/daily
 * Get user's daily bets with detailed information
 */
betting.get('/daily', async (c) => {
  try {
    const user = c.get('user');
    const date = c.req.query('date'); // YYYY-MM-DD format
    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');
    
    // Default to today if no date provided
    const targetDate = date || formatIST(new Date(), 'yyyy-MM-dd');
    
    // Get bet slips for the date
    const startDateTime = new Date(targetDate + 'T00:00:00Z');
    const endDateTime = new Date(targetDate + 'T23:59:59Z');
    
    // Fetch bet slips (no nested queries - fetch separately)
    const { data: betSlips, error } = await supabase
      .from('bet_slips')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', startDateTime.toISOString())
      .lte('created_at', endDateTime.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }

    // Fetch bet details and games separately for each slip
    const slipDbIds = betSlips?.map(s => s.id) || []; // For bet_details FK (slip_id -> bet_slips.id)
    const gameIds = betSlips?.map(s => s.game_id) || [];
    
    // Get all bet details for these slips
    const { data: allBetDetails } = await supabase
      .from('bet_details')
      .select('*')
      .in('slip_id', slipDbIds);

    // Get all games for these slips
    const { data: allGames } = await supabase
      .from('games')
      .select('*')
      .in('game_id', gameIds);

    // Create lookup maps
    const betDetailsMap = new Map();
    (allBetDetails || []).forEach(bd => {
      if (!betDetailsMap.has(bd.slip_id)) {
        betDetailsMap.set(bd.slip_id, []);
      }
      betDetailsMap.get(bd.slip_id).push(bd);
    });

    const gamesMap = new Map();
    (allGames || []).forEach(g => {
      gamesMap.set(g.game_id, g);
    });
    
    // Check for cancelled slips (use slip_id UUID, not DB id)
    const slipIds = betSlips?.map(s => s.slip_id) || [];
    const { data: cancellations } = await supabase
      .from('wallet_logs')
      .select('reference_id')
      .eq('reference_type', 'cancellation')
      .in('reference_id', slipIds);
    
    const cancelledSlipIds = new Set(cancellations?.map(c => c.reference_id) || []);
    
    // Format detailed bets
    const detailedBets = (betSlips || []).map(slip => {
      const isCancelled = cancelledSlipIds.has(slip.slip_id);
      const game = gamesMap.get(slip.game_id);
      const slipBetDetails = betDetailsMap.get(slip.id) || [];
      
      // Calculate profit if game is settled
      let profit = null;
      if (game && game.settlement_status === 'settled' && !isCancelled) {
        profit = parseFloat(slip.payout_amount || 0) - parseFloat(slip.total_amount || 0);
      }
      
      return {
        game_id: slip.game_id,
        game_full_start_time: game ? formatIST(new Date(game.start_time)) : null,
        game_full_end_time: game ? formatIST(new Date(game.end_time)) : null,
        game_status: game?.status || null,
        game_settlement_status: game?.settlement_status || null,
        winning_card: game && game.settlement_status === 'settled' ? game.winning_card : null,
        slip_id: slip.slip_id,
        barcode: slip.barcode,
        barcode_issue_time: formatIST(new Date(slip.created_at)),
        total_cards: slipBetDetails.length,
        total_amount: parseFloat(slip.total_amount || 0),
        payout_amount: game && game.settlement_status === 'settled' ? parseFloat(slip.payout_amount || 0) : null,
        profit: profit !== null ? parseFloat(profit.toFixed(2)) : null,
        status: isCancelled ? 'cancelled' : slip.status,
        is_cancelled: isCancelled,
        claimed: slip.claimed || false,
        claimed_at: slip.claimed_at ? formatIST(new Date(slip.claimed_at)) : null
      };
    });
    
    return c.json({
      success: true,
      data: {
        date: targetDate,
        total_bets: detailedBets.length,
        bets: detailedBets
      }
    });
    
  } catch (error) {
    console.error('Get daily bets error:', error);
    return c.json({
      success: false,
      message: 'Failed to get daily bets',
      error: error.message
    }, 500);
  }
});

export default betting;
