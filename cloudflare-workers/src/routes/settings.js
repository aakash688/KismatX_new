/**
 * Settings Routes
 * Public settings endpoint
 */

import { Hono } from 'hono';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';

const settings = new Hono();

/**
 * GET /api/settings/public
 * Get public settings (no auth required)
 * Returns: game_multiplier, maximum_limit, game_start_time, game_end_time
 * Note: Does not include game_result_type (admin-only)
 * Matches Node.js version format
 */
settings.get('/public', async (c) => {
  try {
    const supabase = getSupabaseClient(c.env);

    // Get ALL settings (not just one)
    const { data: allSettings } = await supabase
      .from('settings')
      .select('key, value')
      .order('key', { ascending: true });

    if (!allSettings || allSettings.length === 0) {
      // Return defaults if no settings found
      return c.json({
        success: true,
        data: {
          game_multiplier: "10",
          maximum_limit: "5000",
          game_start_time: "08:00",
          game_end_time: "22:00"
        }
      });
    }

    // Convert array to object for easier access
    const settingsObject = {};
    allSettings.forEach(setting => {
      settingsObject[setting.key] = setting.value;
    });

    // Return only public settings (exclude game_result_type which is admin-only)
    // Match Node.js version format exactly
    const publicSettings = {
      game_multiplier: settingsObject.game_multiplier || settingsObject.payout_multiplier || "10",
      maximum_limit: settingsObject.maximum_limit || "5000",
      game_start_time: settingsObject.game_start_time || "08:00",
      game_end_time: settingsObject.game_end_time || "22:00"
    };

    return c.json({
      success: true,
      data: publicSettings
    });

  } catch (error) {
    console.error('❌ Get public settings error:', error);
    return c.json({
      success: false,
      message: 'Failed to get settings',
      error: error.message
    }, 500);
  }
});

export default settings;
