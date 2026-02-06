// Wallet Routes
// Handles wallet transactions and transaction history

import express from 'express';
import {
    createTransaction,
    getUserTransactions,
    getTransactionById,
    updateTransaction,
    deleteTransaction,
    getAllWalletLogs,
    getUserWalletSummary
} from '../controllers/walletController.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// All wallet routes require authentication
router.use(verifyToken);

// Admin: Get all wallet logs (with filters/pagination) - MUST BE BEFORE /:user_id
router.get('/logs', isAdmin, getAllWalletLogs);

// Admin: Get user wallet summary - MUST BE BEFORE /:user_id
router.get('/summary/:user_id', isAdmin, getUserWalletSummary);

// Create transaction (admin only - recharge/withdrawal can be done by admin)
router.post('/transaction', isAdmin, createTransaction);

// Get specific transaction (admin only) - MUST BE BEFORE /:user_id
router.get('/transaction/:id', isAdmin, getTransactionById);

// Update transaction (admin only)
router.put('/transaction/:id', isAdmin, updateTransaction);

// Delete transaction (admin only)
router.delete('/transaction/:id', isAdmin, deleteTransaction);

// Get user transactions (admin can view any user, users can only view their own)
// MUST BE LAST among GET routes as it has a catch-all parameter
router.get('/:user_id', async (req, res, next) => {
    // Check if user is admin or requesting their own transactions
    const requestedUserId = req.params.user_id;
    const currentUserId = req.user?.id;

    if (req.user?.role?.includes(1) || req.user?.role?.includes(2)) {
        // Admin/Moderator can view any user's transactions
        return getUserTransactions(req, res, next);
    } else if (requestedUserId === currentUserId?.toString()) {
        // User can view their own transactions
        return getUserTransactions(req, res, next);
    } else {
        return res.status(403).json({ message: "Permission denied" });
    }
});

export default router;

