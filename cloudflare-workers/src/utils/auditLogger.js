/**
 * Audit Logger Utility
 * Centralized audit logging for admin actions
 * 
 * @module utils/auditLogger
 */

import { getSupabaseClient } from '../config/supabase.js';

/**
 * Log an audit event
 * 
 * @param {Object} env - Cloudflare Workers environment
 * @param {Object} params - Audit log parameters
 * @param {number} params.admin_id - Admin user ID (optional)
 * @param {number} params.user_id - Target user ID (optional)
 * @param {string} params.action - Action performed
 * @param {string} params.target_type - Type of target (user, game, bet_slip, etc.)
 * @param {string} params.target_id - ID of target
 * @param {string} params.details - Detailed description of action
 * @param {string} params.ip_address - IP address
 * @param {string} params.user_agent - User agent string
 * @returns {Promise<void>}
 */
export async function auditLog(env, params) {
  try {
    const supabase = getSupabaseClient(env);
    
    const logEntry = {
      admin_id: params.admin_id || null,
      user_id: params.user_id || null,
      action: params.action,
      target_type: params.target_type || null,
      target_id: params.target_id || null,
      details: params.details || '',
      ip_address: params.ip_address || 'unknown',
      user_agent: params.user_agent || 'unknown',
      created_at: new Date().toISOString()
    };
    
    await supabase
      .from('audit_logs')
      .insert(logEntry);
    
    console.log(`📝 Audit log: ${params.action} by ${params.admin_id || params.user_id}`);
    
  } catch (error) {
    // Non-critical: log error but don't throw
    console.error('⚠️ Failed to create audit log (non-critical):', error.message);
  }
}

/**
 * Log admin action
 * Convenience wrapper for admin-specific actions
 * 
 * @param {Object} env - Cloudflare Workers environment
 * @param {number} adminId - Admin user ID
 * @param {string} action - Action performed
 * @param {string} targetType - Type of target
 * @param {string} targetId - ID of target
 * @param {string} details - Detailed description
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent
 * @returns {Promise<void>}
 */
export async function logAdminAction(env, adminId, action, targetType, targetId, details, ipAddress, userAgent) {
  return auditLog(env, {
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: ipAddress,
    user_agent: userAgent
  });
}

/**
 * Log user action
 * Convenience wrapper for user-specific actions
 * 
 * @param {Object} env - Cloudflare Workers environment
 * @param {number} userId - User ID
 * @param {string} action - Action performed
 * @param {string} targetType - Type of target
 * @param {string} targetId - ID of target
 * @param {string} details - Detailed description
 * @param {string} ipAddress - IP address
 * @param {string} userAgent - User agent
 * @returns {Promise<void>}
 */
export async function logUserAction(env, userId, action, targetType, targetId, details, ipAddress, userAgent) {
  return auditLog(env, {
    user_id: userId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    ip_address: ipAddress,
    user_agent: userAgent
  });
}
