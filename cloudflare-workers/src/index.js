/**
 * KismatX API - Cloudflare Workers
 * Main entry point for all API routes
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import gameRoutes from './routes/game.js';
import bettingRoutes from './routes/betting.js';
import settingsRoutes from './routes/settings.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';

// Import Supabase client
import { getSupabaseClient } from './config/supabase.js';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: (origin, c) => {
    const allowedOrigins = c.env?.CORS_ORIGIN?.split(',') || ['*'];
    return allowedOrigins.includes('*') || allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'success',
    message: 'KismatX API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    uptime: Date.now(),
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Public settings endpoint is handled in routes/settings.js
// Removed duplicate endpoint from here to avoid conflicts

// API Routes - Match original Express routes exactly
app.route('/api/auth', authRoutes);
app.route('/api/user', userRoutes);  // Changed from /users to /user
app.route('/api/admin', adminRoutes);
app.route('/api/wallet', walletRoutes);
app.route('/api/games', gameRoutes);
app.route('/api/bets', bettingRoutes);  // Changed from /betting to /bets
app.route('/api/settings', settingsRoutes);

// Import cron handler
import { scheduled } from './cron.js';
import { runRecovery } from './cron.js';

// Export Durable Object class
export { SettlementAlarmDO } from './durable-objects/SettlementAlarmDO.js';

// Recovery endpoint (call once after deployment)
app.get('/api/recovery', async (c) => {
  try {
    const result = await runRecovery(c.env);
    return c.json(result);
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// Manual cron trigger (for testing/debugging)
app.get('/api/trigger-cron', async (c) => {
  try {
    const { activatePendingGames, completeActiveGames } = await import('./services/gameService.js');
    const { autoSettleGames } = await import('./services/settlementService.js');
    const { nowIST, formatIST } = await import('./utils/timezone.js');
    
    const istNow = nowIST();
    const timestamp = istNow.toString();
    
    console.log(`🔧 [MANUAL CRON] Triggered at ${timestamp}`);
    
    // Run game state management
    const activateResult = await activatePendingGames(c.env);
    const completeResult = await completeActiveGames(c.env);
    const settleResult = await autoSettleGames(c.env);
    
    return c.json({
      success: true,
      timestamp,
      results: {
        activated: activateResult,
        completed: completeResult,
        settled: settleResult
      }
    });
  } catch (error) {
    console.error('Manual cron error:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// Database health check endpoint
app.get('/api/db-health', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);
    
    // Try RPC first, fallback to basic count queries if RPC doesn't exist
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_database_size_report');
    
    if (!rpcError && rpcData) {
      return c.json({ success: true, data: rpcData });
    }
    
    // Fallback: basic table row counts (works without RPC function)
    const [gamesRes, slipsRes, usersRes, walletRes] = await Promise.all([
      supabase.from('games').select('*', { count: 'exact', head: true }),
      supabase.from('bet_slips').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('wallet_logs').select('*', { count: 'exact', head: true })
    ]);
    
    return c.json({
      success: true,
      data: {
        tables: {
          games: gamesRes.count || 0,
          bet_slips: slipsRes.count || 0,
          users: usersRes.count || 0,
          wallet_logs: walletRes.count || 0
        },
        note: rpcError ? 'RPC not available, showing row counts only' : undefined
      }
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Diagnostic endpoint to check game creation status
app.get('/api/diagnostic', async (c) => {
  try {
    const { nowIST, parseTimeString, formatIST } = await import('./utils/timezone.js');
    
    const supabase = getSupabaseClient(c.env);
    
    // Get settings
    const { data: settingsData } = await supabase
      .from('settings')
      .select('*');
    
    const settings = {};
    if (settingsData) {
      settingsData.forEach(s => {
        settings[s.key] = s.value;
      });
    }
    
    // Get current time info
    const istNow = nowIST();
    const { getISTComponents } = await import('./utils/timezone.js');
    const istComponents = getISTComponents(istNow);
    const startTimeObj = parseTimeString(settings.game_start_time || '08:00');
    const endTimeObj = parseTimeString(settings.game_end_time || '22:00');
    
    const currentMinutes = istComponents.hours * 60 + istComponents.minutes;
    const startMinutes = startTimeObj.hours * 60 + startTimeObj.minutes;
    const endMinutes = endTimeObj.hours * 60 + endTimeObj.minutes;
    
    const withinGameHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    
    // Get games count for today
    const todayStr = formatIST(istNow, 'yyyy-MM-dd');
    const { data: todayGames, count } = await supabase
      .from('games')
      .select('*', { count: 'exact' })
      .gte('start_time', `${todayStr} 00:00:00`)
      .lte('start_time', `${todayStr} 23:59:59`);
    
    // Get unsettled completed games
    const { data: unsettledGames } = await supabase
      .from('games')
      .select('game_id, status, settlement_status, end_time')
      .eq('status', 'completed')
      .eq('settlement_status', 'not_settled')
      .order('end_time', { ascending: false })
      .limit(10);
    
    return c.json({
      current_time_utc: new Date().toISOString(),
      current_time_ist: formatIST(istNow, 'yyyy-MM-dd HH:mm:ss'),
      current_hour: istComponents.hours,
      current_minute: istComponents.minutes,
      game_start_time: settings.game_start_time || '08:00',
      game_end_time: settings.game_end_time || '22:00',
      game_result_type: settings.game_result_type || 'auto',
      within_game_hours: withinGameHours,
      games_today: count || 0,
      game_status_breakdown: {
        pending: todayGames?.filter(g => g.status === 'pending').length || 0,
        active: todayGames?.filter(g => g.status === 'active').length || 0,
        completed: todayGames?.filter(g => g.status === 'completed').length || 0,
        settled: todayGames?.filter(g => g.settlement_status === 'settled').length || 0,
        not_settled: todayGames?.filter(g => g.settlement_status === 'not_settled').length || 0
      },
      latest_games: todayGames?.slice(0, 5).map(g => ({
        game_id: g.game_id,
        status: g.status,
        settlement_status: g.settlement_status,
        end_time: g.end_time
      })) || [],
      unsettled_completed_games_count: unsettledGames?.length || 0,
      unsettled_sample: unsettledGames?.slice(0, 3).map(g => ({
        game_id: g.game_id,
        end_time: g.end_time
      })) || []
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// 404 Handler (MUST be after all route registrations)
app.notFound((c) => {
  return c.json({
    status: 'error',
    message: 'Endpoint not found',
    path: c.req.path
  }, 404);
});

// Error Handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`, err.stack);
  
  return c.json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(c.env?.NODE_ENV === 'development' && { stack: err.stack })
  }, err.status || 500);
});

// Export both fetch and scheduled handlers for Cloudflare Workers
export default {
  fetch: app.fetch,
  scheduled
};
