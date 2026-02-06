/**
 * Timezone Utility Functions
 * Handles IST ↔ UTC conversions for all game timing
 * 
 * @module utils/timezone
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

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
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date provided to formatIST');
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
 * Get current time in IST
 * @returns {Date} Current date/time in IST timezone
 */
export function nowIST() {
    return toZonedTime(new Date(), IST_TIMEZONE);
}

// Export timezone constant for use in other modules
export { IST_TIMEZONE };

