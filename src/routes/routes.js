// API Routes Configuration
// Main routes file that imports and configures all route modules

import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import adminRoutes from './admin.js';
import walletRoutes from './wallet.js';
import gameRoutes from './game.js';
import bettingRoutes from './betting.js';
import postmanRoutes from './postman.js';
import { getPublicSettings } from '../controllers/settingsController.js';

const router = express.Router();

// Health check endpoint (must be before other routes)
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            user: '/api/user',
            admin: '/api/admin'
        }
    });
});

// Public settings endpoint (no authentication required)
// This route must be defined before other route modules to avoid conflicts
router.get('/settings/public', getPublicSettings);
router.post('/settings/public', getPublicSettings); // Also support POST for convenience

// Debug endpoint to check refresh tokens
router.get('/debug/refresh-tokens', async (req, res) => {
    try {
        const { AppDataSource } = await import('../config/typeorm.config.js');
        const refreshTokenRepo = AppDataSource.getRepository("RefreshToken");
        const tokens = await refreshTokenRepo.find({ relations: ["user"] });
        res.json({
            count: tokens.length,
            tokens: tokens.map(t => ({
                id: t.id,
                token: t.token.substring(0, 20) + '...',
                expiresAt: t.expiresAt,
                user: t.user ? { id: t.user.id, email: t.user.email } : null
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/admin', adminRoutes);
router.use('/wallet', walletRoutes);
router.use('/games', gameRoutes);
router.use('/bets', bettingRoutes);
router.use('/postman', postmanRoutes);

export default router;
