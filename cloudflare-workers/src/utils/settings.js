/**
 * Settings Helper Utilities
 * Convenience functions for fetching settings from database
 * 
 * @module utils/settings
 */

/**
 * Get a setting value from database
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} key - Setting key
 * @param {string} defaultValue - Default value if setting not found
 * @returns {Promise<string>} Setting value
 */
export async function getSetting(supabase, key, defaultValue = null) {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    
    if (error || !data) {
      return defaultValue;
    }
    
    return data.value || defaultValue;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Get a setting value as a number
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} key - Setting key
 * @param {number} defaultValue - Default value if setting not found
 * @returns {Promise<number>} Setting value as number
 */
export async function getSettingAsNumber(supabase, key, defaultValue = 0) {
  const value = await getSetting(supabase, key, String(defaultValue));
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get a setting value as a boolean
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} key - Setting key
 * @param {boolean} defaultValue - Default value if setting not found
 * @returns {Promise<boolean>} Setting value as boolean
 */
export async function getSettingAsBoolean(supabase, key, defaultValue = false) {
  const value = await getSetting(supabase, key, String(defaultValue));
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Set a setting value in database
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 * @param {number} adminId - Admin user ID making the change
 * @returns {Promise<Object>} Update result
 */
export async function setSetting(supabase, key, value, adminId = null) {
  try {
    // Update or insert setting
    const { data, error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    // Log the change if adminId provided
    if (adminId) {
      await supabase
        .from('settings_logs')
        .insert({
          admin_user_id: adminId,
          key,
          old_value: null, // Would need to fetch old value first
          new_value: value,
          changed_at: new Date().toISOString()
        });
    }
    
    return data;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    throw error;
  }
}
