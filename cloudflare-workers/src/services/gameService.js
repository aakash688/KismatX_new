/**
 * Game Service for Cloudflare Workers
 * Handles game lifecycle management and queries
 * 
 * @module services/gameService
 */

import { toUTC, toIST, parseTimeString, formatIST, formatGameId, nowIST, getISTComponents, toISTString, IST_TIMEZONE, parseISTDateTime } from '../utils/timezone.js';
import { getSupabaseClient, executeQuery, executeInsert } from '../config/supabase.js';
import { fromZonedTime } from 'date-fns-tz';

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
 * Get setting as number
 * @param {Object} supabase - Supabase client
 * @param {string} key - Setting key
 * @param {number} defaultValue - Default value
 * @returns {Promise<number>} Setting value as number
 */
async function getSettingAsNumber(supabase, key, defaultValue) {
  const value = await getSetting(supabase, key, defaultValue.toString());
  return parseFloat(value) || defaultValue;
}

/**
 * Create next game (for 5-minute interval scheduler)
 * Called by: Cron job every 5 minutes
 * Creates a game that starts immediately and ends 5 minutes later
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{success: boolean, game_id: string, status: string, message: string}>}
 */
export async function createNextGame(env) {
  try {
    const supabase = getSupabaseClient(env);

    // Get settings
    const payoutMultiplier = await getSettingAsNumber(supabase, 'game_multiplier', 10);
    const gameStartTime = await getSetting(supabase, 'game_start_time', '08:00');
    const gameEndTime = await getSetting(supabase, 'game_end_time', '22:00');

    // IMPORTANT:
    // `nowIST()` returns a UTC Date (Cloudflare runs in UTC). We must NOT mutate that Date
    // and treat it as IST. Always compute the next slot using IST components + fromZonedTime().
    const nowUtc = new Date();
    const istComponents = getISTComponents(nowUtc);
    const currentHour = istComponents.hours;
    const currentMinute = istComponents.minutes;

    // Parse game time limits
    const startTimeObj = parseTimeString(gameStartTime);
    const endTimeObj = parseTimeString(gameEndTime);

    // Check if current time is within game hours
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startTimeObj.hours * 60 + startTimeObj.minutes;
    const endMinutes = endTimeObj.hours * 60 + endTimeObj.minutes;

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      return {
        success: false,
        message: `Outside game hours (${gameStartTime} - ${gameEndTime})`
      };
    }

    // Round current IST time to the next 5-minute interval (in IST clock time)
    let roundedMinutes = Math.ceil(currentMinute / 5) * 5;
    let roundedHour = currentHour;
    if (roundedMinutes >= 60) {
      roundedHour += 1;
      roundedMinutes = 0;
    }

    // Build the slot start/end as real instants using IST timezone
    // (this returns a UTC Date representing the IST wall-clock time)
    const gameStartUTC = fromZonedTime(
      new Date(
        istComponents.year,
        istComponents.getMonth(), // 0-indexed
        istComponents.day,
        roundedHour,
        roundedMinutes,
        0
      ),
      IST_TIMEZONE
    );

    // Check if game start is still within game hours
    const gameStartMinutes = roundedHour * 60 + roundedMinutes;
    if (gameStartMinutes >= endMinutes) {
      return {
        success: false,
        message: 'Next game start time would be outside game hours'
      };
    }

    // Create game end time (5 minutes after start)
    const gameEndUTC = new Date(gameStartUTC.getTime() + 5 * 60 * 1000);

    // Generate game_id in format YYYYMMDDHHMM
    const gameId = formatGameId(gameStartUTC);

    // Convert times to IST strings for storage (database is now in IST timezone)
    const startTimeIST = toISTString(gameStartUTC);
    const endTimeIST = toISTString(gameEndUTC);

    // Check if game already exists
    const existingGame = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('game_id', gameId)
        .maybeSingle() // Use maybeSingle() to return null if no record found
    );
    
    if (existingGame) {
      return {
        success: false,
        game_id: gameId,
        status: existingGame.status,
        message: 'Game already exists'
      };
    }

    // Determine if game should start immediately or be pending
    // If start time is within 1 minute of now, activate immediately
    const timeUntilStart = gameStartUTC.getTime() - nowUtc.getTime();
    const shouldActivateNow = timeUntilStart <= 60000; // 1 minute threshold

    // Create game (database timezone is IST, so we store IST strings directly)
    const newGame = await executeInsert(() =>
      supabase
        .from('games')
        .insert({
          game_id: gameId,
          start_time: startTimeIST,
          end_time: endTimeIST,
          status: shouldActivateNow ? 'active' : 'pending',
          payout_multiplier: payoutMultiplier,
          settlement_status: 'not_settled',
          created_at: toISTString(nowUtc),
          updated_at: toISTString(nowUtc)
        })
        .select()
        .single()
    );

    console.log(
      `✅ Created game ${gameId} (Status: ${newGame.status}, Start: ${formatIST(gameStartUTC, 'HH:mm')}, End: ${formatIST(gameEndUTC, 'HH:mm')})`
    );

    // CRITICAL: If game is created as 'active', schedule alarm immediately
    if (newGame.status === 'active' && env.SettlementAlarmDO) {
      try {
        const { getSetting } = await import('../utils/settings.js');
        const { parseISTDateTime } = await import('../utils/timezone.js');
        const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
        
        const gameEndTime = parseISTDateTime(endTimeIST);
        if (gameEndTime) {
          const alarmTime = gameResultType === 'auto'
            ? gameEndTime.getTime()
            : gameEndTime.getTime() + 10000;
          
          const doId = env.SettlementAlarmDO.idFromName(`game-${gameId}`);
          const stub = env.SettlementAlarmDO.get(doId);
          const scheduleRequest = new Request('http://dummy/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId: gameId,
              alarmTime: alarmTime
            })
          });
          const scheduleResponse = await stub.fetch(scheduleRequest);
          
          if (scheduleResponse.ok) {
            console.log(`✅ [CREATE] Scheduled DO alarm for game ${gameId} (Mode: ${gameResultType})`);
          }
        }
      } catch (alarmError) {
        console.error(`⚠️  [CREATE] Error scheduling alarm for game ${gameId}:`, alarmError.message);
      }
    }

    return {
      success: true,
      game_id: gameId,
      status: newGame.status,
      start_time: formatIST(gameStartUTC, 'yyyy-MM-dd HH:mm:ss'),
      end_time: formatIST(gameEndUTC, 'yyyy-MM-dd HH:mm:ss'),
      message: `Game ${gameId} created successfully (${newGame.status})`
    };

  } catch (error) {
    console.error('❌ Error creating next game:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Activate pending games when start_time arrives
 * Called by: Cron job every minute
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{activated: number, gameIds: string[]}>}
 */
export async function activatePendingGames(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { nowIST, toISTString } = await import('../utils/timezone.js');
    const now = nowIST();
    const nowStr = toISTString(now);
    
    console.log(`🔄 [ACTIVATE] Checking for games to activate (Current IST: ${nowStr})`);

    // Find games that should be activated
    // Note: start_time in DB is now stored in IST timezone
    const { data: gamesToActivate } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'pending')
      .lte('start_time', nowStr);

    if (!gamesToActivate || gamesToActivate.length === 0) {
      return { activated: 0, gameIds: [] };
    }

    // CRITICAL: Schedule Durable Object Alarms BEFORE marking games as active
    // This ensures alarms are scheduled well in advance (when game starts), not when it ends
    // This is the PRIMARY AUTHORITY for settlement timing - alarms fire at exact end_time + grace period
    if (gamesToActivate.length > 0 && env.SettlementAlarmDO) {
      try {
        const { getSetting } = await import('../utils/settings.js');
        const { parseISTDateTime, formatIST } = await import('../utils/timezone.js');
        const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
        
        console.log(`🔔 [ACTIVATE] Scheduling DO alarms for ${gamesToActivate.length} game(s) (Mode: ${gameResultType})`);
        
        for (const game of gamesToActivate) {
          try {
            // Parse end_time (IST string) to Date object
            const gameEndTime = parseISTDateTime(game.end_time);
            if (!gameEndTime) {
              console.error(`⚠️  [ACTIVATE] Failed to parse end_time for game ${game.game_id}`);
              continue;
            }

            // Calculate alarm time based on mode
            // AUTO mode: immediate (end_time + 0 seconds)
            // MANUAL mode: grace period (end_time + 10 seconds)
            const gracePeriod = gameResultType === 'auto' ? 0 : 10000;
            const alarmTime = gameEndTime.getTime() + gracePeriod;
            
            // CRITICAL: Log timing details for debugging
            const now = Date.now();
            const timeUntilAlarm = alarmTime - now;
            const endTimeIST = formatIST(gameEndTime, 'HH:mm:ss');
            const alarmTimeIST = formatIST(new Date(alarmTime), 'HH:mm:ss');
            
            console.log(`⏰ [ACTIVATE] Game ${game.game_id} timing: End=${endTimeIST} IST, Alarm=${alarmTimeIST} IST, Delay=${timeUntilAlarm}ms (${Math.round(timeUntilAlarm/1000)}s), Mode=${gameResultType}`);

            // Get Durable Object instance for this game
            const doId = env.SettlementAlarmDO.idFromName(`game-${game.game_id}`);
            const stub = env.SettlementAlarmDO.get(doId);

            // Schedule the alarm
            const scheduleRequest = new Request('http://dummy/schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gameId: game.game_id,
                alarmTime: alarmTime
              })
            });
            const scheduleResponse = await stub.fetch(scheduleRequest);

            if (scheduleResponse.ok) {
              try {
                const alarmDate = typeof alarmTime === 'number' ? new Date(alarmTime) : (alarmTime instanceof Date ? alarmTime : new Date(alarmTime));
                const alarmIST = formatIST(alarmDate, 'yyyy-MM-dd HH:mm:ss');
                console.log(`✅ [ACTIVATE] Scheduled DO alarm for game ${game.game_id} (Mode: ${gameResultType}, Alarm: ${alarmDate.toISOString()}, IST: ${alarmIST}, Fire in: ${Math.round(timeUntilAlarm/1000)}s)`);
              } catch (formatError) {
                console.log(`✅ [ACTIVATE] Scheduled DO alarm for game ${game.game_id} (Mode: ${gameResultType}, Alarm timestamp: ${alarmTime}, Fire in: ${Math.round(timeUntilAlarm/1000)}s)`);
              }
            } else {
              const errorText = await scheduleResponse.text();
              console.error(`⚠️  [ACTIVATE] Failed to schedule alarm for game ${game.game_id}: ${scheduleResponse.status} - ${errorText}`);
            }
          } catch (alarmError) {
            console.error(`⚠️  [ACTIVATE] Error scheduling alarm for game ${game.game_id}:`, alarmError.message);
          }
        }
      } catch (error) {
        console.error('⚠️  [ACTIVATE] Error in alarm scheduling:', error.message);
      }
    }

    // Update status to active AFTER scheduling alarms
    const gameIds = gamesToActivate.map(g => g.game_id);
    await supabase
      .from('games')
      .update({ status: 'active', updated_at: toISTString(now) })
      .in('game_id', gameIds);

    console.log(`✅ Activated ${gamesToActivate.length} games: ${gameIds.join(', ')}`);

    return {
      activated: gamesToActivate.length,
      gameIds
    };

  } catch (error) {
    console.error('❌ Error activating games:', error);
    return { activated: 0, gameIds: [] };
  }
}

/**
 * Immediately create the next game after a game completes
 * Helper function to avoid code duplication
 * Exported so it can be called from manual settlement endpoint
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} completedGameEndTime - End time of the completed game (IST string)
 * @returns {Promise<{created: boolean, game_id: string|null}>}
 */
export async function createNextGameImmediately(env, completedGameEndTime) {
  try {
    const supabase = getSupabaseClient(env);
    
    // Parse the end_time (IST string from DB) to get the next 5-minute slot
    // CRITICAL: Use parseISTDateTime to correctly interpret IST string as IST, not UTC
    // Handle both string and Date inputs
    let endTimeDate;
    if (completedGameEndTime instanceof Date) {
      endTimeDate = completedGameEndTime;
    } else if (typeof completedGameEndTime === 'string') {
      endTimeDate = parseISTDateTime(completedGameEndTime);
    } else {
      throw new Error(`Invalid end_time type: ${typeof completedGameEndTime}, value: ${completedGameEndTime}`);
    }
    
    if (!endTimeDate || !(endTimeDate instanceof Date) || isNaN(endTimeDate.getTime())) {
      throw new Error(`Invalid end_time: ${completedGameEndTime}`);
    }
    
    const istComponents = getISTComponents(endTimeDate);
    
    // CRITICAL: Next game starts at the SAME time as previous game's end_time
    // Example: If game ends at 08:05:00, next game starts at 08:05:00 (not 08:10:00)
    // This ensures continuous game flow - no gaps between games
    let nextHour = istComponents.hours;
    let nextMinute = istComponents.minutes; // Same minute, not +5
    // No need to add 5 minutes - next game starts exactly when previous ends
    
    // Check if we're still within game hours
    const gameStartTime = await getSetting(supabase, 'game_start_time', '08:00');
    const gameEndTime = await getSetting(supabase, 'game_end_time', '22:00');
    const payoutMultiplier = await getSettingAsNumber(supabase, 'game_multiplier', 10);
    const startTimeObj = parseTimeString(gameStartTime);
    const endTimeObj = parseTimeString(gameEndTime);
    
    const nextMinutes = nextHour * 60 + nextMinute;
    const startMinutes = startTimeObj.hours * 60 + startTimeObj.minutes;
    const endMinutes = endTimeObj.hours * 60 + endTimeObj.minutes;
    
    if (nextMinutes >= startMinutes && nextMinutes < endMinutes) {
      // Create the next game immediately
      // CRITICAL: getMonth() returns 0-indexed (0-11) for new Date()
      const month = istComponents.getMonth ? istComponents.getMonth() : (istComponents.month ? istComponents.month - 1 : 0);
      // CRITICAL: formatGameId expects a Date object, not individual components
      const nextGameStartDate = fromZonedTime(
        new Date(istComponents.year, month, istComponents.day, nextHour, nextMinute, 0),
        IST_TIMEZONE
      );
      const gameId = formatGameId(nextGameStartDate);
      
      // Check if game already exists
      const { data: existing } = await supabase
        .from('games')
        .select('game_id')
        .eq('game_id', gameId)
        .maybeSingle();
      
      if (!existing) {
        // Calculate end time (5 minutes after start time)
        // Example: If start is 08:05:00, end is 08:10:00
        let endHour = nextHour;
        let endMinute = nextMinute + 5;
        if (endMinute >= 60) {
          endHour += 1;
          endMinute = endMinute - 60;
        }
        
        // Build IST timestamps
        // CRITICAL: Use the same month value (0-indexed) for new Date()
        const gameStartIST = fromZonedTime(
          new Date(istComponents.year, month, istComponents.day, nextHour, nextMinute, 0),
          IST_TIMEZONE
        );
        const gameEndIST = fromZonedTime(
          new Date(istComponents.year, month, istComponents.day, endHour, endMinute, 0),
          IST_TIMEZONE
        );
        
        const startTimeIST = toISTString(gameStartIST);
        const endTimeIST = toISTString(gameEndIST);
        
        // Determine status based on current time
        // CRITICAL: If start_time has passed, game should be ACTIVE immediately
        // This ensures continuous game flow - no gaps between games
        const currentTime = nowIST();
        // CRITICAL: Ensure currentTime is a Date object
        if (!(currentTime instanceof Date)) {
          throw new Error(`nowIST() returned non-Date: ${typeof currentTime}`);
        }
        
        const startTimeDate = parseISTDateTime(startTimeIST);
        const endTimeDate = parseISTDateTime(endTimeIST);
        
        let status = 'pending';
        // Ensure both dates are valid Date objects before calling getTime()
        if (endTimeDate && endTimeDate instanceof Date && !isNaN(endTimeDate.getTime()) && endTimeDate.getTime() <= currentTime.getTime()) {
          status = 'completed';
        } else if (startTimeDate && startTimeDate instanceof Date && !isNaN(startTimeDate.getTime()) && startTimeDate.getTime() <= currentTime.getTime()) {
          status = 'active'; // Game should be active immediately if start_time has passed
        }
        
        // Insert the game
        const { error: insertErr } = await supabase
          .from('games')
          .insert({
            game_id: gameId,
            start_time: startTimeIST,
            end_time: endTimeIST,
            status: status,
            payout_multiplier: payoutMultiplier,
            settlement_status: 'not_settled',
            created_at: toISTString(currentTime),
            updated_at: toISTString(currentTime)
          });
        
        if (!insertErr) {
          console.log(`✅ [IMMEDIATE] Created next game: ${gameId} (Status: ${status})`);
          
          // CRITICAL: If game is created as 'active', schedule alarm immediately
          if (status === 'active' && env.SettlementAlarmDO) {
            try {
              const { getSetting } = await import('../utils/settings.js');
              const { parseISTDateTime, formatIST } = await import('../utils/timezone.js');
              const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
              
              const gameEndTime = parseISTDateTime(endTimeIST);
              if (gameEndTime) {
                const alarmTime = gameResultType === 'auto'
                  ? gameEndTime.getTime()
                  : gameEndTime.getTime() + 10000;
                
                const doId = env.SettlementAlarmDO.idFromName(`game-${gameId}`);
                const stub = env.SettlementAlarmDO.get(doId);
                const scheduleRequest = new Request('http://dummy/schedule', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    gameId: gameId,
                    alarmTime: alarmTime
                  })
                });
                const scheduleResponse = await stub.fetch(scheduleRequest);
                
                if (scheduleResponse.ok) {
                  console.log(`✅ [IMMEDIATE] Scheduled DO alarm for game ${gameId} (Mode: ${gameResultType})`);
                }
              }
            } catch (alarmError) {
              console.error(`⚠️  [IMMEDIATE] Error scheduling alarm for game ${gameId}:`, alarmError.message);
            }
          }
          
          return { created: true, game_id: gameId, status: status };
        } else {
          console.error(`⚠️  [IMMEDIATE] Failed to create next game: ${insertErr.message}`);
          return { created: false, game_id: null };
        }
      } else {
        return { created: false, game_id: gameId, reason: 'already_exists' };
      }
    }
    
    return { created: false, game_id: null, reason: 'outside_game_hours' };
  } catch (error) {
    console.error('⚠️  [IMMEDIATE] Error creating next game:', error);
    return { created: false, game_id: null, error: error.message };
  }
}

/**
 * Complete active games when end_time passes
 * Called by: Cron job every minute
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{completed: number, gameIds: string[]}>}
 */
export async function completeActiveGames(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { nowIST, toISTString } = await import('../utils/timezone.js');
    const now = nowIST();
    const nowStr = toISTString(now);
    
    console.log(`🔄 [COMPLETE] Checking for games to complete (Current IST: ${nowStr})`);

    // Find games that should be completed
    // Note: end_time in DB is now stored in IST timezone
    const { data: gamesToComplete } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'active')
      .lte('end_time', nowStr);

    if (!gamesToComplete || gamesToComplete.length === 0) {
      return { completed: 0, gameIds: [] };
    }

    // Prepare gameIds for return value
    const gameIds = gamesToComplete.map(g => g.game_id);

    // NOTE: Alarms should already be scheduled when games are activated (in activatePendingGames)
    // If a game is being completed without an alarm scheduled (edge case), we skip alarm scheduling here
    // because the alarm time would be in the past. The cron backup will handle settlement.

    // Update status to completed
    await supabase
      .from('games')
      .update({ status: 'completed', updated_at: toISTString(now) })
      .in('game_id', gameIds);

    console.log(`✅ Completed ${gamesToComplete.length} games: ${gameIds.join(', ')}`);

    // CRITICAL: Immediately create the next game after completing a game
    // This ensures continuous game flow - when one game ends, next starts immediately
    // Game creation is INDEPENDENT of settlement - games should always be active during game hours
    if (gamesToComplete.length > 0) {
      // Get the latest completed game's end_time to determine next game start
      const latestCompleted = gamesToComplete.sort((a, b) => 
        new Date(b.end_time) - new Date(a.end_time)
      )[0];
      
      try {
        const nextGameResult = await createNextGameImmediately(env, latestCompleted.end_time);
        if (nextGameResult.created) {
          console.log(`✅ [COMPLETE] Immediately created next game: ${nextGameResult.game_id} (Status: ${nextGameResult.status || 'active'})`);
          
          // CRITICAL: If game was created as 'active', ensure it's properly activated
          // This includes scheduling alarms if needed
          if (nextGameResult.status === 'active' && env.SettlementAlarmDO) {
            // Alarm should already be scheduled in createNextGameImmediately, but verify
            console.log(`✅ [COMPLETE] Next game ${nextGameResult.game_id} is active and alarm should be scheduled`);
          }
        } else if (nextGameResult.reason === 'already_exists') {
          console.log(`ℹ️  [COMPLETE] Next game ${nextGameResult.game_id} already exists`);
        } else if (nextGameResult.reason === 'outside_game_hours') {
          console.log(`ℹ️  [COMPLETE] Next game would be outside game hours, skipping creation`);
        } else {
          console.error(`⚠️  [COMPLETE] Failed to create next game: ${nextGameResult.error || 'Unknown error'}`);
        }
      } catch (createError) {
        console.error(`❌ [COMPLETE] Error creating next game after completion:`, createError.message, createError.stack);
      }
    }

    // NOTE:
    // Settlement is now handled by Durable Object Alarms (primary authority)
    // Alarms are scheduled when games are activated, ensuring they fire at the correct time
    // Cron auto-settlement remains as disaster recovery backup

    return {
      completed: gamesToComplete.length,
      gameIds
    };

  } catch (error) {
    console.error('❌ Error completing games:', error);
    return { completed: 0, gameIds: [] };
  }
}

/**
 * Create all games for today
 * Creates all 5-minute interval games between game_start_time and game_end_time
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{created: number, gameIds: string[]}>}
 */
export async function createDailyGames(env, forceCreateAll = false) {
  try {
    console.log(`🔄 [DAILY] Creating all games for today${forceCreateAll ? ' (FORCE MODE - all games)' : ''}...`);
    
    const supabase = getSupabaseClient(env);
    const gameStartTime = await getSetting(supabase, 'game_start_time', '08:00');
    const gameEndTime = await getSetting(supabase, 'game_end_time', '22:00');
    const payoutMultiplier = await getSettingAsNumber(supabase, 'game_multiplier', 10);
    
    const startTimeObj = parseTimeString(gameStartTime);
    const endTimeObj = parseTimeString(gameEndTime);
    
    // Get current date in IST
    const istNow = nowIST();
    const istComponents = getISTComponents(istNow);
    const year = istComponents.year;
    const month = istComponents.month;
    const date = istComponents.day;
    
    // Create start datetime
    let currentTime = new Date(year, month, date, startTimeObj.hours, startTimeObj.minutes, 0);
    const endDateTime = new Date(year, month, date, endTimeObj.hours, endTimeObj.minutes, 0);
    
    const gamesToCreate = [];
    
    // Generate all 5-minute slots for the day
    while (currentTime < endDateTime) {
      const gameId = formatGameId(currentTime);
      
      // Check if game exists
      const { data: existingGames } = await supabase
        .from('games')
        .select('id')
        .eq('game_id', gameId)
        .limit(1);
      
      if (!existingGames || existingGames.length === 0) {
        const gameEndTime = new Date(currentTime);
        gameEndTime.setMinutes(gameEndTime.getMinutes() + 5);
        
        const startTimeIST = toISTString(currentTime);
        const endTimeIST = toISTString(gameEndTime);
        
        // Determine status based on current time
        let status = 'pending';
        if (currentTime <= istNow && gameEndTime > istNow) {
          status = 'active';
        } else if (gameEndTime <= istNow) {
          status = 'completed';
        }
        
        gamesToCreate.push({
          game_id: gameId,
          start_time: startTimeIST,
          end_time: endTimeIST,
          status: status,
          payout_multiplier: payoutMultiplier,
          settlement_status: 'not_settled',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      currentTime.setMinutes(currentTime.getMinutes() + 5);
    }
    
    if (gamesToCreate.length === 0) {
      console.log('✅ [DAILY] All games already exist for today');
      return { created: 0, gameIds: [] };
    }
    
    console.log(`⚠️  [DAILY] Creating ${gamesToCreate.length} missing game(s) for today`);
    
    // Create all games
    const createdGameIds = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const gameData of gamesToCreate) {
      try {
        const insertedGame = await executeInsert(() =>
          supabase
            .from('games')
            .insert(gameData)
            .select()
            .single()
        );
        
        createdGameIds.push(gameData.game_id);
        successCount++;
        console.log(`✅ [DAILY] Created game: ${gameData.game_id} (Status: ${gameData.status})`);
      } catch (error) {
        console.error(`❌ [DAILY] Failed to create game ${gameData.game_id}:`, error.message);
        failCount++;
      }
    }
    
    console.log(`✅ [DAILY] Created ${successCount} game(s) for today (${failCount} failed)`);
    
    return {
      created: successCount,
      failed: failCount,
      gameIds: createdGameIds
    };
    
  } catch (error) {
    console.error('❌ [DAILY] Error creating daily games:', error);
    return { created: 0, failed: 0, gameIds: [], error: error.message };
  }
}

/**
 * Recover missed games on startup
 * Detects games that should exist but don't due to scheduler failures
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<{recovered: number, gameIds: string[]}>}
 */
export async function recoverMissedGames(env) {
  try {
    console.log('🔄 [RECOVERY] Checking for missed game creation...');

    const supabase = getSupabaseClient(env);
    const gameStartTime = await getSetting(supabase, 'game_start_time', '08:00');
    const gameEndTime = await getSetting(supabase, 'game_end_time', '22:00');
    const payoutMultiplier = await getSettingAsNumber(supabase, 'game_multiplier', 10);

    const nowUtc = new Date();
    const ist = getISTComponents(nowUtc);

    const startTimeObj = parseTimeString(gameStartTime);
    const endTimeObj = parseTimeString(gameEndTime);

    const currentMinutes = ist.hours * 60 + ist.minutes;
    const startMinutes = startTimeObj.hours * 60 + startTimeObj.minutes;
    const endMinutes = endTimeObj.hours * 60 + endTimeObj.minutes;

    if (currentMinutes < startMinutes) {
      console.log(`ℹ️  [RECOVERY] Outside game hours (before ${gameStartTime}).`);
      return { created: 0, gameIds: [], message: 'Outside game hours (before start)' };
    }

    if (currentMinutes >= endMinutes) {
      console.log(`ℹ️  [RECOVERY] Outside game hours (after ${gameEndTime}).`);
      return { created: 0, gameIds: [], message: 'Outside game hours (after end)' };
    }

    const scheduleStartUTC = fromZonedTime(
      new Date(ist.year, ist.getMonth(), ist.day, startTimeObj.hours, startTimeObj.minutes, 0),
      IST_TIMEZONE
    );
    const scheduleEndUTC = fromZonedTime(
      new Date(ist.year, ist.getMonth(), ist.day, endTimeObj.hours, endTimeObj.minutes, 0),
      IST_TIMEZONE
    );

    const nowStr = toISTString(nowUtc);
    const scheduleStartStr = toISTString(scheduleStartUTC);

    // Latest game for today up to now (ignore future games like 03:00)
    const { data: latestGames, error: latestErr } = await supabase
      .from('games')
      .select('game_id, end_time, start_time')
      .gte('start_time', scheduleStartStr)
      .lte('start_time', nowStr)
      .order('start_time', { ascending: false })
      .limit(1);

    if (latestErr) throw new Error(latestErr.message);

    let currentStartUTC = scheduleStartUTC;
    if (latestGames && latestGames.length > 0) {
      const { parseISTDateTime } = await import('../utils/timezone.js');
      const endUtc = parseISTDateTime(latestGames[0].end_time);
      if (endUtc && endUtc.getTime() > currentStartUTC.getTime()) currentStartUTC = endUtc;
      console.log(`ℹ️  [RECOVERY] Latest (<=now): ${latestGames[0].game_id}. Resume from ${toISTString(currentStartUTC)}`);
    } else {
      console.log(`ℹ️  [RECOVERY] No games for today (<= now). Start from ${gameStartTime}`);
    }

    const MAX_CREATE = 24;
    const gamesToCreate = [];

    while (
      currentStartUTC.getTime() < nowUtc.getTime() &&
      currentStartUTC.getTime() < scheduleEndUTC.getTime() &&
      gamesToCreate.length < MAX_CREATE
    ) {
      const slotEndUTC = new Date(currentStartUTC.getTime() + 5 * 60 * 1000);
      const gameId = formatGameId(currentStartUTC);

      let status = 'pending';
      if (slotEndUTC.getTime() <= nowUtc.getTime()) status = 'completed';
      else if (currentStartUTC.getTime() <= nowUtc.getTime() && slotEndUTC.getTime() > nowUtc.getTime()) status = 'active';

      gamesToCreate.push({
        game_id: gameId,
        start_time: toISTString(currentStartUTC),
        end_time: toISTString(slotEndUTC),
        status,
        payout_multiplier: payoutMultiplier,
        settlement_status: 'not_settled',
        created_at: toISTString(nowUtc),
        updated_at: toISTString(nowUtc)
      });

      currentStartUTC = slotEndUTC;
    }

    if (gamesToCreate.length === 0) {
      console.log('✅ [RECOVERY] No missed games detected.');
      return { created: 0, gameIds: [], message: 'No missed games' };
    }

    const { error: upsertErr } = await supabase
      .from('games')
      .upsert(gamesToCreate, { onConflict: 'game_id', ignoreDuplicates: true });

    if (upsertErr) throw new Error(upsertErr.message);

    // CRITICAL: Schedule alarms for games created as 'active'
    const activeGames = gamesToCreate.filter(g => g.status === 'active');
    if (activeGames.length > 0 && env.SettlementAlarmDO) {
      try {
        const { getSetting } = await import('../utils/settings.js');
        const { parseISTDateTime } = await import('../utils/timezone.js');
        const gameResultType = await getSetting(supabase, 'game_result_type', 'auto');
        
        console.log(`🔔 [RECOVERY] Scheduling DO alarms for ${activeGames.length} active game(s) (Mode: ${gameResultType})`);
        
        for (const game of activeGames) {
          try {
            const gameEndTime = parseISTDateTime(game.end_time);
            if (gameEndTime) {
              const alarmTime = gameResultType === 'auto'
                ? gameEndTime.getTime()
                : gameEndTime.getTime() + 10000;
              
              const doId = env.SettlementAlarmDO.idFromName(`game-${game.game_id}`);
              const stub = env.SettlementAlarmDO.get(doId);
              const scheduleRequest = new Request('http://dummy/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  gameId: game.game_id,
                  alarmTime: alarmTime
                })
              });
              const scheduleResponse = await stub.fetch(scheduleRequest);
              
              if (scheduleResponse.ok) {
                console.log(`✅ [RECOVERY] Scheduled DO alarm for game ${game.game_id} (Mode: ${gameResultType})`);
              }
            }
          } catch (alarmError) {
            console.error(`⚠️  [RECOVERY] Error scheduling alarm for game ${game.game_id}:`, alarmError.message);
          }
        }
      } catch (error) {
        console.error('⚠️  [RECOVERY] Error in alarm scheduling:', error.message);
      }
    }

    const statusCounts = {
      completed: gamesToCreate.filter(g => g.status === 'completed').length,
      active: gamesToCreate.filter(g => g.status === 'active').length,
      pending: gamesToCreate.filter(g => g.status === 'pending').length
    };

    console.log(`✅ [RECOVERY] Backfilled ${gamesToCreate.length} game(s): ${statusCounts.completed} completed, ${statusCounts.active} active, ${statusCounts.pending} pending`);

    return {
      created: gamesToCreate.length,
      gameIds: gamesToCreate.map(g => g.game_id),
      statusCounts,
      message: gamesToCreate.length >= MAX_CREATE ? 'Backfill capped; will continue next run' : 'Backfill complete'
    };
  } catch (error) {
    console.error('❌ [RECOVERY] Error recovering missed games:', error);
    return { created: 0, gameIds: [], message: error.message };
  }
}

/**
 * Get currently active game
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @returns {Promise<Object|null>} Active game or null
 */
export async function getCurrentGame(env) {
  try {
    const supabase = getSupabaseClient(env);
    
    const game = await executeQuery(() =>
      supabase
        .from('games')
        .select('*')
        .eq('status', 'active')
        .order('start_time', { ascending: false })
        .limit(1)
        .single()
    );
    
    return game;
    
  } catch (error) {
    console.error('Error getting current game:', error);
    return null;
  }
}
