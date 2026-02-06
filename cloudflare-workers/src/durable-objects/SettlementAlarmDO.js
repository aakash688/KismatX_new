/**
 * Durable Object for Game Settlement Alarms
 * Guarantees 15-second settlement timing using Cloudflare Durable Object Alarms
 * 
 * @module durable-objects/SettlementAlarmDO
 */

export class SettlementAlarmDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Handle HTTP requests to the Durable Object
   * Routes: /schedule, /cancel-alarm
   */
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/schedule') {
        return await this.handleSchedule(request);
      } else if (url.pathname === '/cancel-alarm') {
        return await this.handleCancelAlarm();
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      console.error('[SettlementAlarmDO] Error in fetch:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Schedule an alarm for game settlement
   * POST /schedule
   * Body: { gameId: string, alarmTime: number (timestamp) }
   */
  async handleSchedule(request) {
    const { gameId, alarmTime } = await request.json();

    if (!gameId || !alarmTime) {
      return new Response(JSON.stringify({ error: 'gameId and alarmTime are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Store game ID for alarm handler
    await this.state.storage.put('gameId', gameId);
    await this.state.storage.put('alarmTime', alarmTime);

    // Schedule the alarm
    await this.state.storage.setAlarm(alarmTime);

    console.log(`✅ [SettlementAlarmDO] Scheduled alarm for game ${gameId} at ${new Date(alarmTime).toISOString()}`);

    return new Response(JSON.stringify({
      success: true,
      gameId,
      alarmTime,
      scheduledAt: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Cancel a scheduled alarm
   * POST /cancel-alarm
   */
  async handleCancelAlarm() {
    try {
      await this.state.storage.deleteAlarm();
      const gameId = await this.state.storage.get('gameId');
      
      console.log(`✅ [SettlementAlarmDO] Cancelled alarm for game ${gameId || 'unknown'}`);
      
      return new Response(JSON.stringify({
        success: true,
        cancelled: true,
        gameId: gameId || null
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // Alarm might not exist - that's OK
      console.log(`ℹ️  [SettlementAlarmDO] No alarm to cancel: ${error.message}`);
      
      return new Response(JSON.stringify({
        success: true,
        cancelled: false,
        note: 'No alarm found (may have already fired or been cancelled)'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  /**
   * Alarm handler - fires at scheduled time
   * This is the PRIMARY AUTHORITY for settlement timing
   */
  async alarm() {
    const alarmStartTime = Date.now();
    try {
      const gameId = await this.state.storage.get('gameId');
      
      if (!gameId) {
        console.error('❌ [SettlementAlarmDO] Alarm fired but no gameId found');
        return;
      }

      const alarmFiredAt = new Date();
      const scheduledAlarmTime = await this.state.storage.get('alarmTime');
      const alarmDelay = scheduledAlarmTime ? (alarmFiredAt.getTime() - scheduledAlarmTime) : 0;
      
      // Get Supabase client
      const { getSupabaseClient } = await import('../config/supabase.js');
      const supabase = getSupabaseClient(this.env);
      
      // Parse game end time to calculate total settlement time
      const { data: gameInfo } = await supabase
        .from('games')
        .select('end_time')
        .eq('game_id', gameId)
        .single();
      
      let totalSettlementTime = 'unknown';
      if (gameInfo?.end_time) {
        const { parseISTDateTime } = await import('../utils/timezone.js');
        const gameEndTime = parseISTDateTime(gameInfo.end_time);
        if (gameEndTime) {
          const timeFromGameEnd = alarmFiredAt.getTime() - gameEndTime.getTime();
          totalSettlementTime = `${Math.round(timeFromGameEnd / 1000)}s`;
        }
      }
      
      console.log(`🔔 [SettlementAlarmDO] Alarm fired for game ${gameId} at ${alarmFiredAt.toISOString()} (scheduled: ${scheduledAlarmTime ? new Date(scheduledAlarmTime).toISOString() : 'unknown'}, alarm delay: ${Math.round(alarmDelay)}ms, total from game end: ${totalSettlementTime})`);

      // Get full game data including end_time
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id, game_id, settlement_status, status, payout_multiplier, end_time')
        .eq('game_id', gameId)
        .maybeSingle(); // Use maybeSingle() to handle deleted games gracefully

      if (gameError) {
        console.error(`❌ [SettlementAlarmDO] Error fetching game ${gameId}:`, gameError);
        return;
      }

      if (!game) {
        // Game was deleted - this is OK, just log and return
        console.log(`ℹ️  [SettlementAlarmDO] Game ${gameId} not found (may have been deleted). Skipping settlement.`);
        return;
      }

      // Idempotency check - if already settled, skip
      if (game.settlement_status !== 'not_settled') {
        console.log(`ℹ️  [SettlementAlarmDO] Game ${gameId} already ${game.settlement_status}, skipping`);
        return;
      }

      // CRITICAL: If game is still 'active' but end_time has passed, mark it as 'completed' first
      // This ensures the alarm can settle games immediately at end_time, even before cron marks them as completed
      if (game.status === 'active' && game.end_time) {
        const { parseISTDateTime } = await import('../utils/timezone.js');
        const gameEndTime = parseISTDateTime(game.end_time);
        const now = new Date();
        
        if (gameEndTime && gameEndTime.getTime() <= now.getTime()) {
          console.log(`🔄 [SettlementAlarmDO] Game ${gameId} is still 'active' but end_time has passed. Marking as 'completed'...`);
          const { toISTString } = await import('../utils/timezone.js');
          const { error: updateError } = await supabase
            .from('games')
            .update({
              status: 'completed',
              updated_at: toISTString(now)
            })
            .eq('game_id', gameId)
            .eq('status', 'active'); // Optimistic locking
          
          if (updateError) {
            console.error(`⚠️  [SettlementAlarmDO] Failed to mark game ${gameId} as completed:`, updateError.message);
            // Continue anyway - settleGame might handle it
          } else {
            console.log(`✅ [SettlementAlarmDO] Game ${gameId} marked as 'completed'`);
            // Update local game object
            game.status = 'completed';
          }
        }
      }

      // CRITICAL: BEFORE settling, ensure next game is created and ACTIVE
      // This ensures NO GAPS - always an active game available for betting
      // Priority: Next game first, then settlement
      let nextGameActivated = false;
      try {
        const { createNextGameImmediately } = await import('../services/gameService.js');
        const { parseISTDateTime, nowIST, toISTString } = await import('../utils/timezone.js');
        const { getSetting } = await import('../utils/settings.js');
        
        // Try to create/activate next game
        const nextGameResult = await createNextGameImmediately(this.env, game.end_time);
        
        if (nextGameResult.created) {
          console.log(`✅ [SettlementAlarmDO] Created next game BEFORE settlement: ${nextGameResult.game_id} (Status: ${nextGameResult.status || 'active'})`);
          nextGameActivated = (nextGameResult.status === 'active');
        } else if (nextGameResult.reason === 'already_exists') {
          // Game exists but might be 'pending' - activate it immediately if start_time has passed
          const { getISTComponents, formatGameId } = await import('../utils/timezone.js');
          const { fromZonedTime } = await import('date-fns-tz');
          const { IST_TIMEZONE } = await import('../utils/timezone.js');
          
          const istComponents = getISTComponents(parseISTDateTime(game.end_time));
          const month = istComponents.getMonth ? istComponents.getMonth() : (istComponents.month ? istComponents.month - 1 : 0);
          const nextHour = istComponents.hours;
          const nextMinute = istComponents.minutes;
          
          // Calculate next game_id
          const nextGameStartDate = fromZonedTime(
            new Date(istComponents.year, month, istComponents.day, nextHour, nextMinute, 0),
            IST_TIMEZONE
          );
          const nextGameId = formatGameId(nextGameStartDate);
          
          // Check if next game exists and is pending
          const { data: nextGame } = await supabase
            .from('games')
            .select('game_id, status, start_time')
            .eq('game_id', nextGameId)
            .maybeSingle();
          
          if (nextGame && nextGame.status === 'pending') {
            const nextGameStartTime = parseISTDateTime(nextGame.start_time);
            const currentTime = nowIST();
            
            // If start_time has passed, activate immediately
            if (nextGameStartTime && nextGameStartTime.getTime() <= currentTime.getTime()) {
              // Activate the game
              await supabase
                .from('games')
                .update({ status: 'active', updated_at: toISTString(currentTime) })
                .eq('game_id', nextGameId)
                .eq('status', 'pending');
              
              // Schedule alarm for this newly activated game
              if (this.env.SettlementAlarmDO) {
                try {
                  const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
                  let endHour = nextHour;
                  let endMinute = nextMinute + 5;
                  if (endMinute >= 60) {
                    endHour += 1;
                    endMinute = endMinute - 60;
                  }
                  const gameEndIST = fromZonedTime(
                    new Date(istComponents.year, month, istComponents.day, endHour, endMinute, 0),
                    IST_TIMEZONE
                  );
                  const gameEndTime = parseISTDateTime(toISTString(gameEndIST));
                  
                  if (gameEndTime) {
                    const alarmTime = gameResultType === 'auto'
                      ? gameEndTime.getTime()
                      : gameEndTime.getTime() + 10000;
                    
                    const doId = this.env.SettlementAlarmDO.idFromName(`game-${nextGameId}`);
                    const stub = this.env.SettlementAlarmDO.get(doId);
                    const scheduleRequest = new Request('http://dummy/schedule', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        gameId: nextGameId,
                        alarmTime: alarmTime
                      })
                    });
                    await stub.fetch(scheduleRequest);
                  }
                } catch (alarmError) {
                  console.error(`⚠️  [SettlementAlarmDO] Error scheduling alarm for activated game ${nextGameId}:`, alarmError.message);
                }
              }
              
              console.log(`✅ [SettlementAlarmDO] Activated next game BEFORE settlement: ${nextGameId}`);
              nextGameActivated = true;
            }
          } else if (nextGame && nextGame.status === 'active') {
            console.log(`✅ [SettlementAlarmDO] Next game ${nextGameId} already active`);
            nextGameActivated = true;
          } else {
            console.log(`ℹ️  [SettlementAlarmDO] Next game ${nextGameId} exists but status: ${nextGame?.status || 'unknown'}`);
          }
        } else if (nextGameResult.reason === 'outside_game_hours') {
          console.log(`ℹ️  [SettlementAlarmDO] Next game would be outside game hours, skipping creation`);
        } else {
          console.log(`ℹ️  [SettlementAlarmDO] Next game creation skipped: ${nextGameResult.reason || 'unknown'}`);
        }
      } catch (createError) {
        console.error(`⚠️  [SettlementAlarmDO] Error creating/activating next game before settlement:`, createError.message);
        // Continue with settlement anyway
      }
      
      // NOW settle the current game (next game is already active)
      // Use the SAME smart logic as Node.js version (winningCardSelector)
      const { settleGame } = await import('../services/settlementService.js');
      const { getTotalBetsPerCard, selectWinningCard, calculateProfit } = await import('../utils/winningCardSelector.js');
      
      // Get bets for smart selection (same as Node.js version)
      let winningCard = 1; // Default fallback
      try {
        const bets = await getTotalBetsPerCard(gameId, supabase);
        
        // Select winning card using smart logic (SAME as Node.js version)
        winningCard = selectWinningCard(bets);
        
        // Calculate profit for logging (same as Node.js version)
        const profitAnalysis = calculateProfit(bets, winningCard, parseFloat(game.payout_multiplier || 10));
        console.log(`📊 [SettlementAlarmDO] Smart selection for game ${gameId}: Card ${winningCard} selected (Profit: ₹${profitAnalysis.profit.toFixed(2)}, ${profitAnalysis.profit_percentage.toFixed(2)}%)`);
      } catch (selectionError) {
        console.error(`⚠️  [SettlementAlarmDO] Error in smart selection for game ${gameId}, using random fallback:`, selectionError.message);
        // Fallback to random if smart selection fails
        winningCard = Math.floor(Math.random() * 12) + 1;
      }
      
      // Settle the game directly
      const settlementStartTime = Date.now();
      try {
        const result = await settleGame(gameId, winningCard, 0, this.env); // 0 = system
        const settlementDuration = Date.now() - settlementStartTime;
        const totalDuration = Date.now() - alarmStartTime;
        console.log(`✅ [SettlementAlarmDO] Game ${gameId} settled successfully via alarm (Card: ${winningCard}, settlement: ${settlementDuration}ms, total: ${totalDuration}ms, next game active: ${nextGameActivated})`);
      } catch (settleError) {
        // Check if it's already settled (race condition with cron)
        if (settleError.message && settleError.message.includes('already')) {
          console.log(`ℹ️  [SettlementAlarmDO] Game ${gameId} was already settled by another process`);
        } else {
          console.error(`❌ [SettlementAlarmDO] Failed to settle game ${gameId} via alarm:`, settleError.message);
        }
      }

    } catch (error) {
      console.error(`❌ [SettlementAlarmDO] Error in alarm handler:`, error);
      // Don't retry - let cron handle failures
    }
  }
}
