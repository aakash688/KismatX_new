// Validation Middleware
// Handles request validation using Joi

import Joi from 'joi';

/**
 * Middleware to validate request body
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Middleware function
 */
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        message: 'Validation Error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

/**
 * Middleware to validate query parameters
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Middleware function
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        message: 'Query Validation Error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

/**
 * Middleware to validate route parameters
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Middleware function
 */
export const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({ 
        message: 'Parameter Validation Error',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

/**
 * Middleware to validate file uploads
 * @param {Object} options - File validation options
 * @returns {Function} Middleware function
 */
export const validateFile = (options = {}) => {
  return (req, res, next) => {
    const { 
      maxSize = 5 * 1024 * 1024, // 5MB default
      allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
      required = false
    } = options;

    if (required && (!req.files || Object.keys(req.files).length === 0)) {
      return res.status(400).json({ message: 'File is required' });
    }

    if (req.files) {
      for (const [fieldName, file] of Object.entries(req.files)) {
        if (file.size > maxSize) {
          return res.status(400).json({ 
            message: `File ${fieldName} is too large. Maximum size is ${maxSize / 1024 / 1024}MB` 
          });
        }

        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({ 
            message: `File ${fieldName} type not allowed. Allowed types: ${allowedTypes.join(', ')}` 
          });
        }
      }
    }

    next();
  };
};

// Common validation schemas
export const commonSchemas = {
  id: Joi.object({
    id: Joi.number().integer().positive().required()
  }),
  
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10)
  }),
  
  user: Joi.object({
    fname: Joi.string().min(2).max(50).required(),
    lname: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    userid: Joi.string().min(3).max(50).required(),
    password: Joi.string().min(6).required(),
    mobileno: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    designation: Joi.string().max(100).optional()
  }),
  
  login: Joi.object({
    userid: Joi.string().required(),
    password: Joi.string().required()
  })
};
