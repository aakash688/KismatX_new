/**
 * Betting Routes
 * Handles all betting-related endpoints
 * 
 * @module routes/betting
 */

import express from 'express';
import {
    placeBetHandler,
    claimWinningsHandler,
    getBetSlip,
    getMyBets,
    getBetSlipResult,
    scanAndClaimHandler,
    cancelSlipHandler,
    getBettingStats,
    getDailyBets
} from '../controllers/bettingController.js';
import { verifyToken } from '../middleware/auth.js';
import { validatePlaceBet, validateClaim } from '../middleware/validation/betValidation.js';

const router = express.Router();

// All betting routes require authentication
router.use(verifyToken);

// Place a bet
router.post('/place', validatePlaceBet, placeBetHandler);

// Claim winnings
router.post('/claim', validateClaim, claimWinningsHandler);

// Get bet slip by identifier (requires ownership unless admin)
router.get('/slip/:identifier', getBetSlip);

// Get bet slip result by barcode/slip ID (read-only, does not claim)
router.get('/result/:identifier', getBetSlipResult);

// Scan barcode and claim winnings if winning (all-in-one operation)
router.post('/scan-and-claim/:identifier', scanAndClaimHandler);

// Cancel and refund bet slip (users can cancel their own slips)
router.post('/cancel/:identifier', cancelSlipHandler);

// Get user's bet history
router.get('/my-bets', getMyBets);

// Get user betting statistics with daily breakdown
router.get('/stats', getBettingStats);

// Get user's daily bets with detailed information
router.get('/daily', getDailyBets);

export default router;

