/**
 * Betting Validation Middleware
 * Validates bet placement and claim requests
 * 
 * @module middleware/validation/betValidation
 */

import Joi from 'joi';

/**
 * Schema for place bet request
 */
export const placeBetSchema = Joi.object({
    game_id: Joi.string()
        .pattern(/^\d{12}$/)
        .required()
        .messages({
            'string.pattern.base': 'Game ID must be 12 digits (format: YYYYMMDDHHMM)',
            'any.required': 'Game ID is required',
            'string.empty': 'Game ID cannot be empty'
        }),
    bets: Joi.array()
        .items(
            Joi.object({
                card_number: Joi.number()
                    .integer()
                    .min(1)
                    .max(12)
                    .required()
                    .messages({
                        'number.base': 'Card number must be a number',
                        'number.integer': 'Card number must be an integer',
                        'number.min': 'Card number must be between 1 and 12',
                        'number.max': 'Card number must be between 1 and 12',
                        'any.required': 'Card number is required'
                    }),
                bet_amount: Joi.number()
                    .positive()
                    .precision(2)
                    .required()
                    .messages({
                        'number.base': 'Bet amount must be a number',
                        'number.positive': 'Bet amount must be greater than 0',
                        'number.precision': 'Bet amount can have up to 2 decimal places',
                        'any.required': 'Bet amount is required'
                    })
            })
        )
        .min(1)
        .max(12)
        .required()
        .messages({
            'array.min': 'At least one bet is required',
            'array.max': 'Maximum 12 bets per slip',
            'any.required': 'Bets array is required'
        })
});

/**
 * Schema for claim request
 */
export const claimSchema = Joi.object({
    identifier: Joi.string()
        .required()
        .messages({
            'any.required': 'Identifier (slip_id or barcode) is required',
            'string.empty': 'Identifier cannot be empty'
        })
});

/**
 * Validate place bet request
 */
export const validatePlaceBet = (req, res, next) => {
    const { error, value } = placeBetSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    // Store validated data
    req.validatedData = value;
    next();
};

/**
 * Validate claim request
 */
export const validateClaim = (req, res, next) => {
    const { error, value } = claimSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors
        });
    }

    // Store validated data
    req.validatedData = value;
    next();
};








