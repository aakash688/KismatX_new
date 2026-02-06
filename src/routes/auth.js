// Enhanced Authentication Routes
// Comprehensive auth endpoints with verification and password management

import express from 'express';
import {
    register,
    login,
    logout,
    refreshToken,
    forgotPassword,
    resetPassword,
    changePassword
} from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes (authentication required)
router.use(verifyToken);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.post('/change-password', changePassword);

export default router;