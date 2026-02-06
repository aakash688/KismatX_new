/**
 * Timezone Utility Functions for Cloudflare Workers
 * Handles IST ↔ UTC conversions for all game timing
 * 
 * @module utils/timezone
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

// Timezone constant - Indian Standard Time
const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Convert IST datetime to UTC
 * @param {Date|string} dateIST - Date in IST timezone
 * @returns {Date} Date object in UTC
 */
export function toUTC(dateIST) {
  const date = typeof dateIST === 'string' ? new Date(dateIST) : dateIST;
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided to toUTC');
  }
  
  // If date is already a Date object, treat it as IST and convert to UTC
  return fromZonedTime(date, IST_TIMEZONE);
}

/**
 * Convert UTC datetime to IST
 * @param {Date|string} dateUTC - Date in UTC timezone
 * @returns {Date} Date object in IST timezone
 */
export function toIST(dateUTC) {
  const date = typeof dateUTC === 'string' ? new Date(dateUTC) : dateUTC;
  
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date provided to toIST');
  }
  
  // Convert UTC date to IST timezone representation
  return toZonedTime(date, IST_TIMEZONE);
}

/**
 * Format date in IST timezone
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (date-fns format)
 * @returns {string} Formatted date string in IST
 */
export function formatIST(date, formatStr = 'yyyy-MM-dd HH:mm:ss') {
  // CRITICAL: Ensure we have a valid Date object
  let dateObj;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (typeof date === 'number') {
    // Handle timestamp (number) - convert to Date
    dateObj = new Date(date);
  } else {
    throw new Error(`formatIST: Invalid date type - expected Date, string, or number, got ${typeof date} (value: ${date})`);
  }
  
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    throw new Error(`formatIST: Invalid date provided - ${date} (type: ${typeof date}, parsed: ${dateObj})`);
  }
  
  // Format date in IST timezone
  return formatInTimeZone(dateObj, IST_TIMEZONE, formatStr);
}

/**
 * Parse time string "HH:mm" to object with hours and minutes
 * @param {string} timeStr - Time string in format "HH:mm" (e.g., "08:00", "22:30")
 * @returns {{hours: number, minutes: number}} Object with hours and minutes
 * @throws {Error} If time string format is invalid
 */
export function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    throw new Error('Time string must be a non-empty string');
  }
  
  // Validate format HH:mm
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(timeStr)) {
    throw new Error(`Invalid time format: ${timeStr}. Expected format: HH:mm (e.g., "08:00")`);
  }
  
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  
  return { hours, minutes };
}

/**
 * Get current time in IST timezone
 * Returns a Date object (UTC) that can be formatted to IST
 * @returns {Date} Current UTC date/time (use formatIST to display in IST)
 */
export function nowIST() {
  // Return current UTC time - use formatIST() to display in IST
  return new Date();
}

/**
 * Get IST time components from a Date object
 * @param {Date} date - Date object (typically UTC)
 * @returns {Object} IST time components
 */
export function getISTComponents(date = new Date()) {
  const istString = formatInTimeZone(date, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const [datePart, timePart] = istString.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  
  return {
    year,
    month, // Keep as 1-indexed (1-12) for display
    day,
    hours,
    minutes,
    seconds,
    getFullYear: () => year,
    getMonth: () => month - 1, // Return 0-indexed (0-11) for new Date()
    getDate: () => day,
    getHours: () => hours,
    getMinutes: () => minutes,
    getSeconds: () => seconds,
    dateString: datePart,
    timeString: timePart,
    fullString: istString
  };
}

/**
 * Get current IST time
 * Alias for nowIST for better clarity
 * @returns {Date} Current date/time in IST timezone
 */
export function getCurrentISTTime() {
  return nowIST();
}

/**
 * Format date as game ID (YYYYMMDDHHMM)
 * @param {Date} date - Date in IST
 * @returns {string} Game ID format
 */
export function formatGameId(date) {
  return formatIST(date, 'yyyyMMddHHmm');
}

/**
 * Convert timestamp to IST string for API responses
 * @param {Date|string} date - Date to convert
 * @returns {string} IST formatted string
 */
export function toISTString(date) {
  if (!date) return null;
  return formatIST(date, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Parse a DB datetime string that should be interpreted as IST (no timezone offset)
 * into a real UTC Date instant.
 *
 * Accepts:
 * - "YYYY-MM-DD HH:mm:ss"
 * - "YYYY-MM-DDTHH:mm:ss"
 * - "YYYY-MM-DD HH:mm"
 * - "YYYY-MM-DDTHH:mm"
 *
 * @param {string|Date} dateTimeIST
 * @returns {Date|null} UTC Date representing the IST wall-clock time
 */
export function parseISTDateTime(dateTimeIST) {
  if (!dateTimeIST) return null;
  if (dateTimeIST instanceof Date) return dateTimeIST;

  let s = String(dateTimeIST).trim();
  // Normalize common DB formats
  s = s.replace('T', ' ').replace(/Z$/, '');

  // Add seconds if missing
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
    s = `${s}:00`;
  }

  const parts = s.split(' ');
  if (parts.length !== 2) {
    throw new Error(`Invalid IST datetime: ${dateTimeIST}`);
  }

  const [datePart, timePart] = parts;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);

  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error(`Invalid IST datetime: ${dateTimeIST}`);
  }

  return fromZonedTime(new Date(y, m - 1, d, hh, mm, ss || 0), IST_TIMEZONE);
}

// Export timezone constant for use in other modules
export { IST_TIMEZONE };
