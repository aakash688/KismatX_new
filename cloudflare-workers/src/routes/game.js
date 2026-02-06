/**
 * Game Routes
 * Game management and queries
 */

import { Hono } from 'hono';
import { authenticate } from '../middleware/auth.js';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';
import { formatGame, formatGames } from '../utils/formatters.js';

const game = new Hono();

/**
 * GET /api/games/current
 * Get current active game (public - no auth required)
 */
game.get('/current', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);

    // NOTE: Using select('*') here because formatGame() spreads all columns
    // and adds _ist suffix fields. Only 1 row returned so bandwidth is minimal.
    const { data: games } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'active')
      .order('start_time', { ascending: false })
      .limit(1);

    if (!games || games.length === 0) {
      return c.json({
        success: false,
        message: 'No active game found'
      }, 404);
    }

    return c.json({
      success: true,
      data: { game: formatGame(games[0]) }
    });

  } catch (error) {
    console.error('Get current game error:', error);
    return c.json({
      success: false,
      message: 'No active game found',
      error: error.message
    }, 404);
  }
});

/**
 * GET /api/games/recent-winners
 * Get recent game results with winning cards (public)
 * Matches Node.js implementation: returns recent settled games with winning cards
 */
game.get('/recent-winners', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10');
    const supabase = getSupabaseClient(c.env);

    // Get last N settled games with winning cards (matches Node.js logic)
    const { data: games, error } = await supabase
      .from('games')
      .select('game_id, winning_card, start_time, end_time')
      .eq('settlement_status', 'settled')
      .not('winning_card', 'is', null)
      .order('end_time', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    // Format response to match Node.js: { game_id, game_time (start_time), winning_card }
    const results = (games || []).map(game => ({
      game_id: game.game_id,
      game_time: game.start_time,
      winning_card: game.winning_card
    }));

    return c.json({
      success: true,
      data: {
        count: results.length,
        games: results
      }
    });

  } catch (error) {
    console.error('Get recent winners error:', error);
    return c.json({
      success: false,
      message: 'Failed to get recent winners',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/games/by-date
 * Get date-wise game card winning details (public)
 * Returns all settled games for a specific date with winning card information
 * SAME LOGIC AS NODE.JS VERSION
 */
game.get('/by-date', async (c) => {
  try {
    const date = c.req.query('date'); // Format: YYYY-MM-DD
    
    if (!date) {
      return c.json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      }, 400);
    }

    // Validate date format (YYYY-MM-DD) - SAME AS NODE.JS
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return c.json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format (e.g., 2026-02-05)'
      }, 400);
    }

    const supabase = getSupabaseClient(c.env);
    const { formatIST } = await import('../utils/timezone.js');

    // OPTIMIZED: Select only needed columns instead of * (reduces bandwidth)
    const games = await executeQuery(() =>
      supabase
        .from('games')
        .select('game_id, start_time, end_time, winning_card, payout_multiplier, settlement_completed_at')
        .eq('settlement_status', 'settled') // Only settled games - SAME AS NODE.JS
        .not('winning_card', 'is', null) // winning_card IS NOT NULL - SAME AS NODE.JS
        .gte('start_time', `${date} 00:00:00`)
        .lte('start_time', `${date} 23:59:59`)
        .order('start_time', { ascending: false }) // DESC - latest first - SAME AS NODE.JS
    );

    // Format response with game details - SAME FORMAT AS NODE.JS
    // CRITICAL: 
    // - start_time and end_time are stored as IST strings in DB (e.g., "2026-02-05 10:25:00")
    //   So we should NOT use formatIST() on them (would cause double conversion)
    // - settlement_completed_at is stored in UTC in DB, so we need to parse it as UTC first
    const results = games.map(game => {
      // settlement_completed_at is UTC timestamp from database
      // Parse it as UTC Date object, then format to IST
      let settlementTimeIST = null;
      if (game.settlement_completed_at) {
        // If it's already a Date object, use it directly
        // If it's a string (ISO format from Supabase), parse it as UTC
        const settlementDate = game.settlement_completed_at instanceof Date 
          ? game.settlement_completed_at 
          : new Date(game.settlement_completed_at);
        settlementTimeIST = formatIST(settlementDate, 'yyyy-MM-dd HH:mm:ss');
      }
      
      // start_time and end_time are already IST strings in DB
      // Just ensure they're in the correct format (they should already be "yyyy-MM-dd HH:mm:ss")
      // If they come as Date objects from Supabase, format them; otherwise use as-is
      let startTimeIST = game.start_time;
      let endTimeIST = game.end_time;
      
      if (game.start_time instanceof Date) {
        // If it's a Date object, format it to IST
        startTimeIST = formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss');
      } else if (typeof game.start_time === 'string') {
        // If it's already a string, use it directly (it's already in IST format)
        // Just ensure format is correct
        startTimeIST = game.start_time;
      }
      
      if (game.end_time instanceof Date) {
        endTimeIST = formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss');
      } else if (typeof game.end_time === 'string') {
        endTimeIST = game.end_time;
      }
      
      return {
        game_id: game.game_id,
        game_start_time: startTimeIST,
        game_end_time: endTimeIST,
        winning_card: game.winning_card,
        payout_multiplier: parseFloat(game.payout_multiplier || 10),
        settlement_completed_at: settlementTimeIST
      };
    });

    return c.json({
      success: true,
      data: {
        date: date,
        total_games: results.length,
        games: results
      }
    });

  } catch (error) {
    console.error('Get games by date error:', error);
    return c.json({
      success: false,
      message: 'Failed to get games',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/games/previousgames/by-date
 * Get previous games by date with user's bet slips (requires auth)
 * Returns all games for a specific date with the logged-in user's bet slips
 */
game.get('/previousgames/by-date', authenticate, async (c) => {
  try {
    const user = c.get('user');
    const date = c.req.query('date'); // Format: YYYY-MM-DD
    
    if (!user || !user.id) {
      return c.json({
        success: false,
        message: 'Authentication required'
      }, 401);
    }
    
    if (!date) {
      return c.json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      }, 400);
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return c.json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD format (e.g., 2026-02-05)'
      }, 400);
    }
    
    const supabase = getSupabaseClient(c.env);
    const { formatIST, parseISTDateTime } = await import('../utils/timezone.js');
    
    // Get all games for this date (ordered by start time)
    // NOTE: We prefer filtering by `game_id` prefix instead of `start_time` range because:
    // - Supabase/PostgREST can return timestamps as ISO strings (e.g. "2026-02-05T12:10:00")
    // - Comparing with "YYYY-MM-DD HH:mm:ss" strings can be inconsistent depending on column types
    // - `game_id` is canonical (YYYYMMDDHHMM), and matches Node.js IDs
    const yyyymmdd = date.replaceAll('-', '');

    // OPTIMIZED: Select only needed columns
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('game_id, start_time, end_time, status, winning_card, settlement_status')
      .like('game_id', `${yyyymmdd}%`)
      .order('game_id', { ascending: true });
    
    if (gamesError) {
      throw gamesError;
    }
    
    if (!games || games.length === 0) {
      return c.json({
        success: true,
        data: {
          game_date: date,
          games: []
        }
      });
    }
    
    // --- Batch fetch to avoid "Too many subrequests" ---
    const gameIds = games.map(g => g.game_id);

    // Fetch all slips for user across these games
    const allBetSlips = await executeQuery(() =>
      supabase
        .from('bet_slips')
        .select('*')
        .eq('user_id', user.id)
        .in('game_id', gameIds)
        .order('created_at', { ascending: true })
    );

    // Early return if user has no slips on that date
    if (!allBetSlips || allBetSlips.length === 0) {
      return c.json({
        success: true,
        data: {
          game_date: date,
          games: []
        }
      });
    }

    // Cancellation logs for these slips
    const slipIds = allBetSlips.map(slip => slip.slip_id);
    const cancellations = await executeQuery(() =>
      supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', slipIds)
    );
    const cancelledSlipIds = new Set((cancellations || []).map(c => c.reference_id).filter(Boolean));

    // Bet details for these slips (use DB slip.id)
    const slipDbIds = allBetSlips.map(slip => slip.id);
    const allBetDetails = await executeQuery(() =>
      supabase
        .from('bet_details')
        .select('*')
        .in('slip_id', slipDbIds)
    );
    const betDetailsMap = new Map();
    (allBetDetails || []).forEach(bd => {
      if (!betDetailsMap.has(bd.slip_id)) betDetailsMap.set(bd.slip_id, []);
      betDetailsMap.get(bd.slip_id).push(bd);
    });

    // Group slips by game_id
    const slipsByGame = new Map();
    (allBetSlips || []).forEach(slip => {
      if (!slipsByGame.has(slip.game_id)) slipsByGame.set(slip.game_id, []);
      slipsByGame.get(slip.game_id).push(slip);
    });

    // Build response per game (only games where user has slips)
    const gamesWithSlips = games.map(game => {
      const betSlips = slipsByGame.get(game.game_id) || [];
      if (betSlips.length === 0) return null;

      const slipsData = betSlips.map(slip => {
        const isCancelled = cancelledSlipIds.has(slip.slip_id);
        const betDetails = betDetailsMap.get(slip.id) || [];

        let status = slip.status;
        if (isCancelled) status = 'cancelled';
        else if (slip.status === 'won') status = 'won';
        else if (slip.status === 'lost') status = 'lost';
        else status = 'pending';

        return {
          cards: betDetails.length,
          amount: parseFloat(slip.total_amount || 0),
          win_points: slip.claimed ? parseFloat(slip.payout_amount || 0) : 0,
          barcode: slip.barcode,
          issue_date_time: formatIST(parseISTDateTime(slip.created_at), 'yyyy-MM-dd HH:mm:ss'),
          status,
          is_cancelled: isCancelled,
          claim_status: slip.claimed || false,
          claimed_at: slip.claimed_at ? formatIST(parseISTDateTime(slip.claimed_at), 'yyyy-MM-dd HH:mm:ss') : null
        };
      });

      const startTimeStr = formatIST(parseISTDateTime(game.start_time), 'yyyy-MM-dd HH:mm');
      const endTimeStr = formatIST(parseISTDateTime(game.end_time), 'yyyy-MM-dd HH:mm');

      return {
        id: game.game_id,
        start: startTimeStr,
        end: endTimeStr,
        slips: slipsData
      };
    }).filter(Boolean);
    
    return c.json({
      success: true,
      data: {
        game_date: date,
        games: gamesWithSlips
      }
    });
    
  } catch (error) {
    console.error('Error fetching previous games by date:', error);
    return c.json({
      success: false,
      message: 'Failed to get previous games',
      error: error.message
    }, 500);
  }
});

/**
 * GET /api/games/:gameId
 * Get specific game details (public)
 */
game.get('/:gameId', async (c) => {
  try {
    const gameId = c.req.param('gameId');
    const supabase = getSupabaseClient(c.env);

    const gameData = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single()
    );

    if (!gameData) {
      return c.json({
        success: false,
        message: 'Game not found'
      }, 404);
    }

    return c.json({
      success: true,
      data: { game: formatGame(gameData) }
    });

  } catch (error) {
    console.error('Get game error:', error);
    return c.json({
      success: false,
      message: 'Failed to get game',
      error: error.message
    }, 500);
  }
});

export default game;
