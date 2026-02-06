// Date Formatting Middleware
// Formats date fields in request/response

import { format, parseISO, isValid } from 'date-fns';

/**
 * Middleware to format date fields in request body
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const formatDatesMiddleware = (req, res, next) => {
  // List of date fields to format
  const dateFields = ['birthDate', 'dateOfJoining', 'createdAt', 'updatedAt'];
  
  // Format date fields in request body
  if (req.body) {
    dateFields.forEach(field => {
      if (req.body[field]) {
        try {
          const date = parseISO(req.body[field]);
          if (isValid(date)) {
            req.body[field] = format(date, 'yyyy-MM-dd');
          }
        } catch (error) {
          // If parsing fails, keep original value
          console.warn(`Failed to parse date field ${field}:`, error.message);
        }
      }
    });
  }
  
  next();
};

/**
 * Middleware to format date fields in response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const formatResponseDates = (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    if (data && typeof data === 'object') {
      data = formatDatesInObject(data);
    }
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Recursively format dates in an object
 * @param {Object} obj - Object to format
 * @returns {Object} Formatted object
 */
function formatDatesInObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => formatDatesInObject(item));
  }
  
  if (obj && typeof obj === 'object') {
    const formatted = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value instanceof Date) {
        formatted[key] = format(value, 'yyyy-MM-dd HH:mm:ss');
      } else if (typeof value === 'string' && isDateString(value)) {
        try {
          const date = parseISO(value);
          if (isValid(date)) {
            formatted[key] = format(date, 'yyyy-MM-dd HH:mm:ss');
          } else {
            formatted[key] = value;
          }
        } catch (error) {
          formatted[key] = value;
        }
      } else if (value && typeof value === 'object') {
        formatted[key] = formatDatesInObject(value);
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  }
  
  return obj;
}

/**
 * Check if a string is a date string
 * @param {string} str - String to check
 * @returns {boolean} True if string is a date
 */
function isDateString(str) {
  if (typeof str !== 'string') return false;
  
  // Check for common date patterns
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO format
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/ // YYYY-MM-DD HH:mm:ss
  ];
  
  return datePatterns.some(pattern => pattern.test(str));
}
