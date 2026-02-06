// Main Route Aggregator
// Imports and combines all route modules with comprehensive API endpoints

import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import adminRoutes from './admin.js';
import postmanRoutes from './postman.js';

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
router.use('/postman', postmanRoutes);

export default router;
