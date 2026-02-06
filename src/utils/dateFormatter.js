// Date Formatting Utilities
// Handles date formatting and manipulation

import { format, parseISO, isValid, addDays, subDays, startOfDay, endOfDay } from 'date-fns';

/**
 * Format date to string
 * @param {Date|string} date - Date to format
 * @param {string} formatString - Format string
 * @returns {string} Formatted date
 */
export const formatDate = (date, formatString = 'yyyy-MM-dd') => {
  try {
    if (!date) return null;
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return null;
    
    return format(dateObj, formatString);
  } catch (error) {
    console.error('Date formatting error:', error);
    return null;
  }
};

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date
 */
export const formatDateForDisplay = (date) => {
  return formatDate(date, 'MMM dd, yyyy');
};

/**
 * Format date and time
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date and time
 */
export const formatDateTime = (date) => {
  return formatDate(date, 'yyyy-MM-dd HH:mm:ss');
};

/**
 * Get date range for current month
 * @returns {Object} Date range
 */
export const getCurrentMonthRange = () => {
  const now = new Date();
  const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  
  return { start, end };
};

/**
 * Get date range for current week
 * @returns {Object} Date range
 */
export const getCurrentWeekRange = () => {
  const now = new Date();
  const start = startOfDay(subDays(now, now.getDay()));
  const end = endOfDay(addDays(start, 6));
  
  return { start, end };
};

/**
 * Get date range for current year
 * @returns {Object} Date range
 */
export const getCurrentYearRange = () => {
  const now = new Date();
  const start = startOfDay(new Date(now.getFullYear(), 0, 1));
  const end = endOfDay(new Date(now.getFullYear(), 11, 31));
  
  return { start, end };
};

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean} Is today
 */
export const isToday = (date) => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    const today = new Date();
    return dateObj.toDateString() === today.toDateString();
  } catch (error) {
    return false;
  }
};

/**
 * Check if date is in the past
 * @param {Date|string} date - Date to check
 * @returns {boolean} Is in the past
 */
export const isPastDate = (date) => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    return dateObj < new Date();
  } catch (error) {
    return false;
  }
};

/**
 * Check if date is in the future
 * @param {Date|string} date - Date to check
 * @returns {boolean} Is in the future
 */
export const isFutureDate = (date) => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    return dateObj > new Date();
  } catch (error) {
    return false;
  }
};
