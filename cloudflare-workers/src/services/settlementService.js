/**
 * Settlement Service for Cloudflare Workers
 * Handles game settlement with atomic-like operations
 * 
 * @module services/settlementService
 */

import { getSupabaseClient, executeQuery } from '../config/supabase.js';

/**
 * Get setting value from database
 * @param {Object} supabase - Supabase client
 * @param {string} key - Setting key
 * @param {string} defaultValue - Default value
 * @returns {Promise<string>} Setting value
 */
async function getSetting(supabase, key, defaultValue) {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    return data?.value || defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Settle a game (⚠️ CRITICAL - Must be atomic)
 * 
 * @param {string} gameId - Game ID (YYYYMMDDHHMM)
 * @param {number} winningCard - Winning card number (1-12)
 * @param {number} adminId - Admin ID who declared the result
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Object>} Settlement summary
 */
export async function settleGame(gameId, winningCard, adminId, env) {
  const supabase = getSupabaseClient(env);
  
  try {
    // Step 1: Get and Lock Game
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .single()
    );

    if (!game) {
      throw new Error('Game not found');
    }

    // Step 2: Validate Game State
    const gameResultType = await getSetting(supabase, 'game_result_type', 'manual');
    
    const allowedStatuses = gameResultType === 'manual' 
      ? ['active', 'completed']
      : ['completed'];
    
    if (!allowedStatuses.includes(game.status)) {
      throw new Error(`Game cannot be settled. Current status: ${game.status}, Mode: ${gameResultType}`);
    }

    if (game.settlement_status !== 'not_settled') {
      throw new Error(`Game is already ${game.settlement_status}. Cannot settle again.`);
    }

    if (!Number.isInteger(winningCard) || winningCard < 1 || winningCard > 12) {
      throw new Error(`Invalid winning card: ${winningCard}. Must be between 1 and 12.`);
    }

    // Step 3: Mark as Settling
    await executeQuery(() =>
      supabase
        .from('games')
        .update({
          settlement_status: 'settling',
          settlement_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('game_id', gameId)
        .eq('settlement_status', 'not_settled') // Optimistic locking
    );

    // Step 4: Get multiplier
    const multiplier = parseFloat(game.payout_multiplier || 10);

    // Step 5: Update Winner Bet Details (PARALLEL — saves N-1 sequential round-trips)
    const { data: winningBets } = await supabase
      .from('bet_details')
      .select('id, bet_amount')
      .eq('game_id', gameId)
      .eq('card_number', winningCard);

    // Step 6: Update Loser Bet Details (1 batch query for ALL losers)
    // Run losers batch + all winner updates IN PARALLEL
    const updatePromises = [
      supabase
        .from('bet_details')
        .update({ is_winner: false, payout_amount: 0 })
        .eq('game_id', gameId)
        .neq('card_number', winningCard)
    ];

    if (winningBets && winningBets.length > 0) {
      for (const bet of winningBets) {
        const payoutAmount = parseFloat(bet.bet_amount) * multiplier;
        updatePromises.push(
          supabase
            .from('bet_details')
            .update({ is_winner: true, payout_amount: payoutAmount })
            .eq('id', bet.id)
        );
      }
    }

    await Promise.all(updatePromises);

    // Steps 7-9: PARALLEL fetch of slips + bet details (cancellation check depends on slips)
    const [slipsResult, detailsResult] = await Promise.all([
      supabase.from('bet_slips').select('id, slip_id').eq('game_id', gameId),
      supabase.from('bet_details').select('slip_id, payout_amount').eq('game_id', gameId)
    ]);

    const gameSlips = slipsResult.data;
    const allBetDetails = detailsResult.data;

    // Step 8: Get cancelled slip IDs
    const gameSlipIds = gameSlips ? gameSlips.map(s => s.slip_id) : [];
    let cancelledSlipIds = new Set();
    
    if (gameSlipIds.length > 0) {
      const { data: cancelledSlips } = await supabase
        .from('wallet_logs')
        .select('reference_id')
        .eq('reference_type', 'cancellation')
        .in('reference_id', gameSlipIds);
      
      if (cancelledSlips) {
        cancelledSlipIds = new Set(cancelledSlips.map(c => c.reference_id));
      }
    }

    const cancelledSlipDbIds = new Set(
      (gameSlips || [])
        .filter(s => cancelledSlipIds.has(s.slip_id))
        .map(s => s.id.toString())
    );

    const slipPayoutMap = {};
    if (allBetDetails) {
      allBetDetails.forEach(detail => {
        if (!cancelledSlipDbIds.has(detail.slip_id.toString())) {
          if (!slipPayoutMap[detail.slip_id]) {
            slipPayoutMap[detail.slip_id] = 0;
          }
          slipPayoutMap[detail.slip_id] += parseFloat(detail.payout_amount || 0);
        }
      });
    }

    // Step 10: Update Bet Slips (PARALLEL — saves N-1 sequential round-trips)
    let winningSlipsCount = 0;
    let losingSlipsCount = 0;
    let totalPayout = 0;

    const winningSlipIds = [];
    const losingSlipIds = [];

    for (const [slipId, payoutAmount] of Object.entries(slipPayoutMap)) {
      if (payoutAmount > 0) {
        winningSlipsCount++;
        totalPayout += payoutAmount;
        winningSlipIds.push({ id: parseInt(slipId), payoutAmount });
      } else {
        losingSlipsCount++;
        losingSlipIds.push(parseInt(slipId));
      }
    }

    // Count cancelled slips as losing slips
    losingSlipsCount += cancelledSlipIds.size;

    // Batch: update ALL losing slips in 1 query, parallel with individual winning slip updates
    const slipUpdatePromises = [];

    if (losingSlipIds.length > 0) {
      slipUpdatePromises.push(
        supabase
          .from('bet_slips')
          .update({ payout_amount: 0, status: 'lost' })
          .in('id', losingSlipIds)
      );
    }

    for (const { id, payoutAmount } of winningSlipIds) {
      slipUpdatePromises.push(
        supabase
          .from('bet_slips')
          .update({ payout_amount: payoutAmount, status: 'won' })
          .eq('id', id)
      );
    }

    if (slipUpdatePromises.length > 0) {
      await Promise.all(slipUpdatePromises);
    }

    // Step 11: Mark Settlement Complete
    const updateData = {
      winning_card: winningCard,
      settlement_status: 'settled',
      settlement_completed_at: new Date().toISOString(),
      settlement_error: null,
      updated_at: new Date().toISOString()
    };

    // If game was settled early (while active), also mark it as completed
    if (game.status === 'active') {
      updateData.status = 'completed';
    }

    await executeQuery(() =>
      supabase
        .from('games')
        .update(updateData)
        .eq('game_id', gameId)
    );

    // Step 12: Audit Log (only if adminId is valid, otherwise skip)
    if (adminId && adminId > 0) {
      await executeQuery(() =>
        supabase
          .from('audit_logs')
          .insert({
            admin_id: adminId,
            action: 'game_settled',
            target_type: 'game',
            target_id: game.id,
            details: `Game ${gameId} settled. Winning card: ${winningCard}. Winning slips: ${winningSlipsCount}, Losing slips: ${losingSlipsCount}, Total payout: ${totalPayout}`,
            created_at: new Date().toISOString()
          })
      ).catch(err => {
        console.error('⚠️ Failed to log audit event (non-critical):', err);
      });
    } else {
      // System settlement (DO alarm) - skip audit log
      console.log(`ℹ️  Skipping audit log for system settlement (adminId: ${adminId})`);
    }

    console.log(`✅ Game ${gameId} settled successfully. Winning card: ${winningCard}, Payout: ${totalPayout}`);

    return {
      success: true,
      game_id: gameId,
      winning_card: winningCard,
      winning_slips: winningSlipsCount,
      losing_slips: losingSlipsCount,
      total_payout: totalPayout,
      multiplier: multiplier
    };

  } catch (error) {
    // Mark settlement as failed
    try {
      await supabase
        .from('games')
        .update({
          settlement_status: 'failed',
          settlement_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('game_id', gameId)
        .eq('settlement_status', 'settling');
    } catch (updateError) {
      console.error('Error updating settlement error:', updateError);
    }

    console.error(`❌ Error settling game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Auto-settle games based on mode
 * Called by: Cron job
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {boolean} applyGracePeriod - Whether to apply 10-second grace period (manual mode)
 * @returns {Promise<{settled: number, failed: number, graceSkipped: number}>}
 */
export async function autoSettleGames(env, applyGracePeriod = false) {
  try {
    const supabase = getSupabaseClient(env);
    const gameResultType = await getSetting(supabase, 'game_result_type', 'manual');
    
    // Import timezone utilities for IST handling
    const { toISTString, parseISTDateTime } = await import('../utils/timezone.js');
    
    const nowUtc = new Date();
    const tenSecondsAgoUtc = new Date(nowUtc.getTime() - 10 * 1000);
    
    // Build query for games that need settlement
    let query = supabase
      .from('games')
      .select('*')
      .eq('status', 'completed')
      .eq('settlement_status', 'not_settled');
    
    // In MANUAL mode with grace period: Only fetch games older than 10 seconds
    // In AUTO mode: Fetch all completed games immediately (no grace period)
    if (applyGracePeriod) {
      // `end_time` is stored as IST string; compare with IST formatted timestamp.
      query = query.lte('end_time', toISTString(tenSecondsAgoUtc));
    }
    
    const { data: gamesToSettle } = await query
      .order('end_time', { ascending: true })
      .limit(10);

    if (!gamesToSettle || gamesToSettle.length === 0) {
      return { settled: 0, failed: 0, graceSkipped: 0 };
    }

    console.log(`🔄 [AUTO-SETTLE] Processing ${gamesToSettle.length} game(s) for settlement (Mode: ${gameResultType})...`);

    let successCount = 0;
    let failureCount = 0;

    // Import winning card selector
    const { getTotalBetsPerCard, selectWinningCard, calculateProfit } = await import('../utils/winningCardSelector.js');

    for (const game of gamesToSettle) {
      try {
        // Parse IST end_time from database as an instant (UTC Date)
        const gameEndUtc = parseISTDateTime(game.end_time);
        if (!gameEndUtc) continue;

        const timeSinceEnd = nowUtc.getTime() - gameEndUtc.getTime();
        const secondsSinceEnd = Math.round(timeSinceEnd / 1000);
        
        // Never settle before a game ends (protect against any parsing/timezone issues)
        if (timeSinceEnd < 0) {
          console.log(`⏳ [AUTO-SETTLE] Game ${game.game_id} not ended yet (${secondsSinceEnd}s)`);
          continue;
        }

        // In AUTO mode: settle as soon as game is completed and end_time has passed
        // In MANUAL mode: settle only after 10s grace (when applyGracePeriod=true we filtered in SQL)
        const shouldSettle = gameResultType === 'auto' || timeSinceEnd >= 10000;
        
        if (shouldSettle) {
          // Get bets for smart selection
          const bets = await getTotalBetsPerCard(game.game_id, supabase);
          
          // Select winning card using smart logic
          const winningCard = selectWinningCard(bets);
          
          // Calculate profit for logging
          const profitAnalysis = calculateProfit(bets, winningCard, parseFloat(game.payout_multiplier || 10));
          
          const settlementReason = gameResultType === 'auto'
            ? `Auto mode - settlement (${secondsSinceEnd}s since game end)`
            : `Manual mode - auto-settling after 10s grace period (${secondsSinceEnd}s since game end)`;
          
          console.log(`🎲 [AUTO-SETTLE] Game ${game.game_id} - ${settlementReason}`);
          console.log(`   📊 Smart selection: Card ${winningCard} selected (Profit: ₹${profitAnalysis.profit.toFixed(2)}, ${profitAnalysis.profit_percentage.toFixed(2)}%)`);

          // Settle the game (using admin_id = 1 as system user)
          const result = await settleGame(game.game_id, winningCard, 1, env);

          if (result.success) {
            successCount++;
            const modeLabel = gameResultType === 'auto' ? 'AUTO' : 'MANUAL (auto-fallback)';
            console.log(`✅ [AUTO-SETTLE] [${modeLabel}] Game ${game.game_id} settled: Card ${winningCard}, Payout: ₹${result.total_payout.toFixed(2)}`);
          } else {
            failureCount++;
            console.error(`❌ [AUTO-SETTLE] Failed to settle game ${game.game_id}`);
          }
        } else {
          console.log(`⏳ [AUTO-SETTLE] Game ${game.game_id} not ready (${secondsSinceEnd}s since end, waiting for 10s)`);
        }
      } catch (error) {
        failureCount++;
        console.error(`❌ [AUTO-SETTLE] Error auto-settling game ${game.game_id}:`, error.message);
        
        // Fallback to random selection if smart selection fails
        try {
          const winningCard = Math.floor(Math.random() * 12) + 1;
          console.log(`🎲 [AUTO-SETTLE] Fallback to random selection for game ${game.game_id}: Card ${winningCard}`);
          
          const result = await settleGame(game.game_id, winningCard, 1, env);
          if (result.success) {
            successCount++;
            failureCount--; // Adjust counts
            console.log(`✅ [AUTO-SETTLE] Game ${game.game_id} settled with fallback: Card ${winningCard}`);
          }
        } catch (fallbackError) {
          console.error(`❌ [AUTO-SETTLE] Fallback settlement also failed for game ${game.game_id}:`, fallbackError.message);
        }
      }
    }

    return {
      settled: successCount,
      failed: failureCount,
      graceSkipped: 0
    };

  } catch (error) {
    console.error('❌ [AUTO-SETTLE] Error in auto-settlement:', error);
    return { settled: 0, failed: 0, graceSkipped: 0 };
  }
}
