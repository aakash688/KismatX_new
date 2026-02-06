/**
 * Response Formatters
 * Helper functions to format data for API responses
 * 
 * @module utils/formatters
 */

import { toISTString } from './timezone.js';

/**
 * Format a single game object with IST timestamps
 * @param {Object} game - Game object from database
 * @returns {Object} Formatted game object
 */
export function formatGame(game) {
  if (!game) return null;
  
  return {
    ...game,
    start_time_ist: toISTString(game.start_time),
    end_time_ist: toISTString(game.end_time),
    created_at_ist: toISTString(game.created_at),
    updated_at_ist: toISTString(game.updated_at),
    settlement_started_at_ist: toISTString(game.settlement_started_at),
    settlement_completed_at_ist: toISTString(game.settlement_completed_at)
  };
}

/**
 * Format games array with IST timestamps
 * @param {Array} games - Array of game objects
 * @returns {Array} Formatted games array
 */
export function formatGames(games) {
  if (!games || !Array.isArray(games)) return [];
  return games.map(formatGame);
}

/**
 * Format a login history entry with IST timestamp
 * @param {Object} entry - Login history entry
 * @returns {Object} Formatted entry
 */
export function formatLoginHistory(entry) {
  if (!entry) return null;
  
  return {
    ...entry,
    login_time_ist: toISTString(entry.login_time),
    created_at_ist: toISTString(entry.created_at)
  };
}

/**
 * Format login history array with IST timestamps
 * @param {Array} entries - Array of login history entries
 * @returns {Array} Formatted entries array
 */
export function formatLoginHistoryArray(entries) {
  if (!entries || !Array.isArray(entries)) return [];
  return entries.map(formatLoginHistory);
}

/**
 * Format audit log entry with IST timestamp
 * @param {Object} entry - Audit log entry
 * @returns {Object} Formatted entry
 */
export function formatAuditLog(entry) {
  if (!entry) return null;
  
  return {
    ...entry,
    created_at_ist: toISTString(entry.created_at)
  };
}

/**
 * Format audit logs array with IST timestamps
 * @param {Array} entries - Array of audit log entries
 * @returns {Array} Formatted entries array
 */
export function formatAuditLogs(entries) {
  if (!entries || !Array.isArray(entries)) return [];
  return entries.map(formatAuditLog);
}

/**
 * Format settings log entry with IST timestamp
 * @param {Object} entry - Settings log entry
 * @returns {Object} Formatted entry
 */
export function formatSettingsLog(entry) {
  if (!entry) return null;
  
  return {
    ...entry,
    changed_at_ist: toISTString(entry.changed_at),
    created_at_ist: toISTString(entry.created_at)
  };
}

/**
 * Format settings logs array with IST timestamps
 * @param {Array} entries - Array of settings log entries
 * @returns {Array} Formatted entries array
 */
export function formatSettingsLogs(entries) {
  if (!entries || !Array.isArray(entries)) return [];
  return entries.map(formatSettingsLog);
}

/**
 * Format bet slip with IST timestamps
 * @param {Object} slip - Bet slip object
 * @returns {Object} Formatted slip
 */
export function formatBetSlip(slip) {
  if (!slip) return null;
  
  return {
    ...slip,
    placed_at_ist: toISTString(slip.placed_at),
    created_at_ist: toISTString(slip.created_at),
    updated_at_ist: toISTString(slip.updated_at)
  };
}

/**
 * Format bet slips array with IST timestamps
 * @param {Array} slips - Array of bet slips
 * @returns {Array} Formatted slips array
 */
export function formatBetSlips(slips) {
  if (!slips || !Array.isArray(slips)) return [];
  return slips.map(formatBetSlip);
}

/**
 * Format user with IST timestamps
 * @param {Object} user - User object
 * @returns {Object} Formatted user
 */
export function formatUser(user) {
  if (!user) return null;
  
  return {
    ...user,
    last_login_ist: toISTString(user.last_login),
    created_at_ist: toISTString(user.created_at),
    updated_at_ist: toISTString(user.updated_at)
  };
}

/**
 * Format users array with IST timestamps
 * @param {Array} users - Array of users
 * @returns {Array} Formatted users array
 */
export function formatUsers(users) {
  if (!users || !Array.isArray(users)) return [];
  return users.map(formatUser);
}
