// Error Handling Utilities
// Common error handling functions

/**
 * Create custom error with status code
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Error} Custom error
 */
export const createError = (message, status = 500) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

/**
 * Create validation error
 * @param {string} message - Error message
 * @returns {Error} Validation error
 */
export const createValidationError = (message) => {
  return createError(message, 400);
};

/**
 * Create not found error
 * @param {string} message - Error message
 * @returns {Error} Not found error
 */
export const createNotFoundError = (message = 'Resource not found') => {
  return createError(message, 404);
};

/**
 * Create unauthorized error
 * @param {string} message - Error message
 * @returns {Error} Unauthorized error
 */
export const createUnauthorizedError = (message = 'Unauthorized') => {
  return createError(message, 401);
};

/**
 * Create forbidden error
 * @param {string} message - Error message
 * @returns {Error} Forbidden error
 */
export const createForbiddenError = (message = 'Forbidden') => {
  return createError(message, 403);
};

/**
 * Create conflict error
 * @param {string} message - Error message
 * @returns {Error} Conflict error
 */
export const createConflictError = (message = 'Conflict') => {
  return createError(message, 409);
};

/**
 * Handle database errors
 * @param {Error} error - Database error
 * @returns {Error} Formatted error
 */
export const handleDatabaseError = (error) => {
  if (error.code === 'ER_DUP_ENTRY') {
    return createConflictError('Duplicate entry');
  }
  
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return createValidationError('Referenced record not found');
  }
  
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return createConflictError('Cannot delete referenced record');
  }
  
  return createError('Database error', 500);
};

/**
 * Handle validation errors
 * @param {Error} error - Validation error
 * @returns {Error} Formatted error
 */
export const handleValidationError = (error) => {
  if (error.name === 'ValidationError') {
    return createValidationError(error.message);
  }
  
  return error;
};

/**
 * Handle JWT errors
 * @param {Error} error - JWT error
 * @returns {Error} Formatted error
 */
export const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return createUnauthorizedError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return createUnauthorizedError('Token expired');
  }
  
  return error;
};
