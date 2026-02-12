/**
 * Cloudflare Workers Cron Handler
 * Handles scheduled tasks for game automation
 * 
 * SMART CRON OPTIMIZATION (Time-Aligned Logic):
 * - Games run on 5-minute boundaries (00, 05, 10, 15, ...)
 * - Cron runs every minute but only does heavy work near boundaries
 * - PRE-END (minute % 5 === 4): Safety net before game end
 * - END (minute % 5 === 0): Critical - game state changes
 * - POST-END (minute % 5 === 1): Late fallback for missed settlements
 * - IDLE (all others): Exit immediately, no DB queries
 * 
 * Primary settlement: Durable Object Alarm (exact timing)
 * Secondary fallback: Cron (smart, time-aligned)
 * 
 * @module cron
 */

import { createNextGame, activatePendingGames, completeActiveGames, recoverMissedGames, createDailyGames } from './services/gameService.js';
import { autoSettleGames } from './services/settlementService.js';
import { nowIST, formatIST, getISTComponents } from './utils/timezone.js';

/**
 * Get minute category for smart cron logic
 * All time calculations use IST for consistency
 * 
 * @param {number} minute - Current minute (0-59)
 * @returns {Object} Category flags
 */
function getMinuteCategory(minute) {
  return {
    isEndMinute: minute % 5 === 0,      // 00, 05, 10, 15... (game ends)
    isPreEndMinute: minute % 5 === 4,   // 04, 09, 14, 19... (safety net)
    isPostEndMinute: minute % 5 === 1,  // 01, 06, 11, 16... (late fallback)
    isActivationMinute: minute % 5 === 2, // 02, 07, 12... (optional activation extension)
    getCategoryName: function() {
      if (this.isEndMinute) return 'END';
      if (this.isPreEndMinute) return 'PRE-END';
      if (this.isPostEndMinute) return 'POST-END';
      if (this.isActivationMinute) return 'ACTIVATION';
      return 'IDLE';
    }
  };
}

/**
 * Scheduled event handler
 * Called by Cloudflare Workers Cron Triggers
 * 
 * Uses TIME-ALIGNED SMART LOGIC:
 * - Same frequency (* * * * *)
 * - Smarter execution (exit early on idle minutes)
 * - 60% reduction in DB queries
 * - Same reliability and speed
 * 
 * SUPABASE KEEP-ALIVE:
 * - Supabase free tier pauses projects after 7 days of inactivity
 * - Every 6 hours (at minute 3 of hours 0,6,12,18 IST), a lightweight
 *   SELECT 1 query is sent to prevent the project from being paused
 * - This runs on IDLE minutes so it doesn't interfere with game logic
 * 
 * @param {ScheduledEvent} event - Scheduled event
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 */
export async function scheduled(event, env, ctx) {
  const cronExpression = event.cron;
  const istNow = nowIST();
  const timestamp = formatIST(istNow, 'yyyy-MM-dd HH:mm:ss');
  // CRITICAL: Use getISTComponents() for IST hour/minute, NOT .getHours()/.getMinutes()
  // nowIST() returns a UTC Date, so .getHours()/.getMinutes() give UTC values
  // IST offset is +5:30, so hours are always wrong without conversion
  // (Minutes happen to match for %5 checks since 30%5===0, but use IST for correctness)
  const istComp = getISTComponents(istNow);
  const minute = istComp.minutes;
  const hour = istComp.hours;
  const category = getMinuteCategory(minute);
  
  console.log(`🕐 [CRON] Triggered at ${timestamp} IST (Expression: ${cronExpression}, Minute: ${minute}, Category: ${category.getCategoryName()})`);

  try {
    switch (cronExpression) {
      case '*/5 * * * *':
        // Every 5 minutes - Create next game (unchanged)
        await handleGameCreation(env);
        break;
      
      case '* * * * *':
        // Every minute - SMART state management and settlement
        // Heavy work only near 5-minute game boundaries
        await handleGameStateManagement(env, minute, category);
        await handleAutoSettlement(env, minute, category);
        
        // SUPABASE KEEP-ALIVE: Prevent free tier project from pausing
        // Runs every 6 hours on an IDLE minute (minute 3 of hours 0,6,12,18 IST)
        // Uses a lightweight SELECT 1 — costs almost nothing
        await handleSupabaseKeepAlive(env, hour, minute);
        break;
      
      default:
        console.log(`⚠️  [CRON] Unknown cron expression: ${cronExpression}`);
    }
  } catch (error) {
    console.error(`❌ [CRON] Error in scheduled handler:`, error);
    // Don't throw - allow other crons to continue
  }
}

/**
 * Handle game creation (every 5 minutes)
 */
async function handleGameCreation(env) {
  try {
    console.log('🎮 [CRON] Creating next game...');
    
    // Check if games table is empty (first run or manual cleanup)
    const { getSupabaseClient } = await import('./config/supabase.js');
    const { formatIST } = await import('./utils/timezone.js');
    const supabase = getSupabaseClient(env);
    
    const istNow = nowIST();
    const todayStr = formatIST(istNow, 'yyyy-MM-dd');
    
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .gte('start_time', `${todayStr} 00:00:00`)
      .lte('start_time', `${todayStr} 23:59:59`);
    
    // If no games exist for today, trigger recovery (create only MISSED games)
    if (count === 0) {
      console.log('⚠️  [CRON] No games found for today. Triggering recovery...');
      console.log(`ℹ️  [CRON] Current IST time: ${formatIST(istNow, 'HH:mm')}`);
      
      // Create only missed/passed games (NOT future games)
      const recoveryResult = await recoverMissedGames(env);
      if (recoveryResult.created > 0) {
        console.log(`✅ [CRON] Recovery created ${recoveryResult.created} games`);
        console.log(`ℹ️  [CRON] Games: ${recoveryResult.gameIds.join(', ')}`);
        // NOTE: Do NOT run state management / settlement here.
        // The "* * * * *" cron handles activation, completion, and settlement.
        // Running it here causes race conditions when both crons fire in the same second.
        console.log(`✅ [CRON] Recovery complete`);
        return;
      } else {
        console.log(`ℹ️  [CRON] Recovery: ${recoveryResult.message || 'No games to recover'}`);
      }
    }
    
    // Always attempt a small backfill before creating the next slot.
    // This protects us from any missed cron runs and also handles the case where a future
    // game exists (e.g., 03:00) but earlier slots (02:15/02:20/...) are missing.
    const backfill = await recoverMissedGames(env);
    if (backfill?.created > 0) {
      console.log(`✅ [CRON] Backfilled ${backfill.created} game(s): ${backfill.gameIds.join(', ')}`);
      // NOTE: Do NOT run state management / settlement here (handled by "* * * * *" cron).
    }

    // Normal game creation (next 5-minute slot)
    const result = await createNextGame(env);
    
    if (result.success) {
      console.log(`✅ [CRON] Created game: ${result.game_id} (Status: ${result.status})`);
    } else {
      console.log(`ℹ️  [CRON] ${result.message}`);
    }
  } catch (error) {
    console.error('❌ [CRON] Error creating next game:', error);
  }
}

/**
 * Handle game state management (every minute - SMART TIME-ALIGNED)
 * 
 * Only performs heavy work near 5-minute game boundaries:
 * - END (minute % 5 === 0): Complete active games, activate pending
 * - PRE-END (minute % 5 === 4): Safety net for completion
 * - POST-END (minute % 5 === 1): Late fallback for activation
 * - ACTIVATION (minute % 5 === 2): Extended activation window
 * - IDLE (all others): Exit immediately, no DB queries
 * 
 * @param {Object} env - Environment variables
 * @param {number} minute - Current IST minute
 * @param {Object} category - Minute category flags
 */
async function handleGameStateManagement(env, minute, category) {
  try {
    const { isEndMinute, isPreEndMinute, isPostEndMinute, isActivationMinute } = category;
    
    // ============================================
    // EARLY EXIT: Skip idle minutes (saves ~60% of runs)
    // ============================================
    if (!isEndMinute && !isPreEndMinute && !isPostEndMinute && !isActivationMinute) {
      console.log(`⏭️  [CRON] Minute ${minute} - IDLE, skipping state management (no DB queries)`);
      return;
    }
    
    console.log(`🔄 [CRON] Minute ${minute} - ${category.getCategoryName()} minute, running state management`);
    
    // ============================================
    // COMPLETE ACTIVE GAMES (HIGH PRIORITY)
    // When: END or PRE-END minutes
    // Why: Games end exactly at 5-min boundaries, users wait for results
    // ============================================
    if (isEndMinute || isPreEndMinute) {
      console.log(`🔄 [COMPLETE] Checking for games to complete...`);
      const completionResult = await completeActiveGames(env);
      if (completionResult.completed > 0) {
        console.log(`✅ [CRON] Completed ${completionResult.completed} games: ${completionResult.gameIds.join(', ')}`);
      }
    }

    // ============================================
    // ACTIVATE PENDING GAMES (MEDIUM PRIORITY)
    // When: END, POST-END, or ACTIVATION minutes
    // Why: 0-120s delay for betting open is acceptable
    // ============================================
    if (isEndMinute || isPostEndMinute || isActivationMinute) {
      console.log(`🔄 [ACTIVATE] Checking for games to activate...`);
      const activationResult = await activatePendingGames(env);
      if (activationResult.activated > 0) {
        console.log(`✅ [CRON] Activated ${activationResult.activated} games: ${activationResult.gameIds.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('❌ [CRON] Error in game state management:', error);
  }
}

/**
 * Handle auto-settlement (every minute - SMART TIME-ALIGNED)
 * 
 * IMPORTANT: Durable Object Alarm is the PRIMARY settlement trigger.
 * This cron is a SMART FALLBACK only.
 * 
 * Only runs near game boundaries:
 * - END (minute % 5 === 0): Primary fallback check
 * - POST-END (minute % 5 === 1): Late fallback for missed settlements
 * - IDLE (all others): Exit immediately, no DB queries
 * 
 * Settlement is IDEMPOTENT:
 * - Uses optimistic locking (settlement_status = 'not_settled')
 * - Safe for concurrent attempts from DO + cron
 * 
 * @param {Object} env - Environment variables
 * @param {number} minute - Current IST minute
 * @param {Object} category - Minute category flags
 */
async function handleAutoSettlement(env, minute, category) {
  try {
    const { isEndMinute, isPostEndMinute } = category;
    
    // ============================================
    // EARLY EXIT: Settlement only matters at/after game end
    // Skip PRE-END (games not yet completed)
    // Skip IDLE and ACTIVATION (too early)
    // ============================================
    if (!isEndMinute && !isPostEndMinute) {
      console.log(`⏭️  [CRON] Minute ${minute} - skipping settlement check (not END/POST-END)`);
      return;
    }
    
    const { getSetting } = await import('./utils/settings.js');
    const { getSupabaseClient } = await import('./config/supabase.js');
    
    const supabase = getSupabaseClient(env);
    const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
    
    console.log(`🎯 [CRON] Settlement mode: ${gameResultType.toUpperCase()} (fallback check at minute ${minute})`);
    
    if (gameResultType === 'auto') {
      // AUTO mode: Settle all completed games immediately
      // Note: DO alarm is primary; this catches any missed games
      const result = await autoSettleGames(env, false); // No grace period
      if (result.settled > 0) {
        console.log(`✅ [CRON] AUTO mode - Settled ${result.settled} games (fallback)`);
      }
      if (result.failed > 0) {
        console.log(`⚠️  [CRON] Failed to settle ${result.failed} games`);
      }
    } else {
      // MANUAL mode: Only settle games after 10-second grace period
      const result = await autoSettleGames(env, true); // Apply grace period
      if (result.settled > 0) {
        console.log(`✅ [CRON] MANUAL mode - Settled ${result.settled} games after grace period (fallback)`);
      }
      if (result.graceSkipped > 0) {
        console.log(`ℹ️  [CRON] MANUAL mode - Skipped ${result.graceSkipped} games (within grace period)`);
      }
      if (result.failed > 0) {
        console.log(`⚠️  [CRON] Failed to settle ${result.failed} games`);
      }
    }
  } catch (error) {
    console.error('❌ [CRON] Error in auto-settlement:', error);
  }
}

/**
 * Handle Supabase keep-alive ping
 * 
 * Supabase free tier pauses projects after 7 days of inactivity.
 * This function sends a lightweight SELECT 1 query every 6 hours
 * to prevent the project from being paused, even during periods
 * when no users are actively using the application.
 * 
 * Runs on IDLE minutes only (minute 3 of hours 0, 6, 12, 18 IST)
 * so it never interferes with game logic or settlement.
 * 
 * Cost: ~0.05ms CPU time, 1 subrequest per 6 hours = negligible
 * 
 * @param {Object} env - Environment variables
 * @param {number} hour - Current IST hour (0-23)
 * @param {number} minute - Current IST minute (0-59)
 */
async function handleSupabaseKeepAlive(env, hour, minute) {
  // Only run at minute 3 of hours 0, 6, 12, 18 IST (every 6 hours)
  // Minute 3 is always an IDLE minute (3 % 5 === 3), so no game logic runs
  const keepAliveHours = [0, 6, 12, 18];
  if (minute !== 3 || !keepAliveHours.includes(hour)) {
    return; // Not a keep-alive window — exit silently (no log to save CPU)
  }

  try {
    const { getSupabaseClient } = await import('./config/supabase.js');
    const supabase = getSupabaseClient(env);
    
    // Lightweight health check — just SELECT 1, no table scan
    const { data, error } = await supabase.rpc('version');
    
    if (error) {
      // Fallback: simple query if rpc('version') doesn't exist
      const { error: fallbackError } = await supabase
        .from('games')
        .select('game_id', { count: 'exact', head: true })
        .limit(1);
      
      if (fallbackError) {
        console.warn(`⚠️  [KEEP-ALIVE] Supabase ping failed:`, fallbackError.message);
      } else {
        console.log(`💓 [KEEP-ALIVE] Supabase ping OK at ${hour}:03 IST (fallback query)`);
      }
    } else {
      console.log(`💓 [KEEP-ALIVE] Supabase ping OK at ${hour}:03 IST`);
    }
  } catch (error) {
    // Never let keep-alive failure affect game operations
    console.warn(`⚠️  [KEEP-ALIVE] Error:`, error.message);
  }
}

/**
 * Manual trigger endpoint for recovery (call once on deployment)
 * This can be called via an API endpoint to recover missed games on startup
 * 
 * NOTE: Recovery bypasses smart cron logic - it always runs full work
 * This is intentional as recovery is a one-time catch-up operation
 */
export async function runRecovery(env) {
  console.log('🔄 [RECOVERY] Starting recovery process...');
  
  try {
    // Step 1: Create all games for today (if missing)
    const dailyGames = await createDailyGames(env);
    if (dailyGames.created > 0) {
      console.log(`✅ [RECOVERY] Created ${dailyGames.created} games for today`);
    }
    
    // Step 2: Activate and complete games based on current time
    // Recovery always runs full work (bypass smart cron logic)
    console.log(`🔄 [RECOVERY] Running state management (full work mode)...`);
    const activationResult = await activatePendingGames(env);
    if (activationResult.activated > 0) {
      console.log(`✅ [RECOVERY] Activated ${activationResult.activated} games: ${activationResult.gameIds.join(', ')}`);
    }
    const completionResult = await completeActiveGames(env);
    if (completionResult.completed > 0) {
      console.log(`✅ [RECOVERY] Completed ${completionResult.completed} games: ${completionResult.gameIds.join(', ')}`);
    }
    
    // Step 3: Recover any remaining missed games (gap filling)
    const gameRecovery = await recoverMissedGames(env);
    if (gameRecovery.recovered > 0) {
      console.log(`✅ [RECOVERY] Recovered ${gameRecovery.recovered} additional missed games`);
    }
    
    // Step 4: Run auto-settlement to settle any stuck games
    const settlementResult = await autoSettleGames(env);
    if (settlementResult.settled > 0) {
      console.log(`✅ [RECOVERY] Settled ${settlementResult.settled} games during recovery`);
    }
    
    console.log('✅ [RECOVERY] Recovery completed successfully');
    
    return {
      success: true,
      games_created: dailyGames.created,
      games_recovered: gameRecovery.recovered,
      games_settled: settlementResult.settled,
      total_games: dailyGames.created + gameRecovery.recovered
    };
  } catch (error) {
    console.error('❌ [RECOVERY] Recovery failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
