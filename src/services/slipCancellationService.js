/**
 * Slip Cancellation Service
 * Handles slip cancellation and refund with atomic transactions
 * 
 * @module services/slipCancellationService
 */

import { AppDataSource } from '../config/typeorm.config.js';
import { auditLog } from '../utils/auditLogger.js';

const BetSlipEntity = "BetSlip";
const GameEntity = "Game";
const UserEntity = "User";
const WalletLogEntity = "WalletLog";
const BetDetailEntity = "BetDetail";
const GameCardTotalEntity = "GameCardTotal";

/**
 * Cancel and refund a bet slip (⚠️ CRITICAL - Must be atomic)
 * Users can cancel their own slips, admins can cancel any slip
 * 
 * @param {string} identifier - Slip ID (UUID) or barcode
 * @param {number} userId - User ID who is canceling (user or admin)
 * @param {boolean} isAdmin - Whether the user is an admin
 * @param {string} reason - Reason for cancellation
 * @param {string} ipAddress - User IP address
 * @param {string} userAgent - User user agent string
 * @returns {Promise<Object>} Cancellation result
 */
export async function cancelSlip(identifier, userId, isAdmin, reason, ipAddress, userAgent) {
    const queryRunner = AppDataSource.createQueryRunner();
    let transactionStarted = false;

    try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        transactionStarted = true;

        // Step 1: Lock Bet Slip (PESSIMISTIC WRITE)
        const betSlipRepo = queryRunner.manager.getRepository(BetSlipEntity);
        
        // Find slip by slip_id or barcode
        const slip = await betSlipRepo
            .createQueryBuilder('slip')
            .setLock('pessimistic_write')
            .where('slip.slip_id = :identifier OR slip.barcode = :identifier', { identifier })
            .getOne();

        if (!slip) {
            await queryRunner.rollbackTransaction();
            throw new Error('Bet slip not found');
        }

        // Step 2: Validate Ownership (users can only cancel their own slips, admins can cancel any)
        if (!isAdmin && slip.user_id !== userId) {
            await queryRunner.rollbackTransaction();
            throw new Error('You do not have permission to cancel this slip');
        }

        // Step 3: Validate Cancellation Eligibility
        // Cannot cancel if already claimed
        if (slip.claimed === true) {
            await queryRunner.rollbackTransaction();
            throw new Error('Cannot cancel a slip that has already been claimed');
        }

        // Cannot cancel if game is already settled (to prevent fraud)
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        const game = await gameRepo.findOne({
            where: { game_id: slip.game_id }
        });

        if (!game) {
            await queryRunner.rollbackTransaction();
            throw new Error('Game not found');
        }

        // Allow cancellation only if game is not settled or in progress
        // Once settled, cancellation should not be allowed (too late)
        if (game.settlement_status === 'settled') {
            await queryRunner.rollbackTransaction();
            throw new Error('Cannot cancel slip after game has been settled');
        }

        // Step 4: Lock User Wallet (PESSIMISTIC WRITE)
        const userRepo = queryRunner.manager.getRepository(UserEntity);
        const user = await userRepo
            .createQueryBuilder('user')
            .setLock('pessimistic_write')
            .where('user.id = :userId', { userId: slip.user_id })
            .getOne();

        if (!user) {
            await queryRunner.rollbackTransaction();
            throw new Error('User not found');
        }

        // Step 5: Validate User Account
        if (user.status !== 'active') {
            await queryRunner.rollbackTransaction();
            throw new Error(`Cannot refund to inactive user account. Account status: ${user.status}`);
        }

        // Step 6: Calculate Refund Amount
        // Refund the total bet amount (not payout, since game may not be settled)
        const refundAmount = parseFloat(slip.total_amount || 0);
        
        if (refundAmount <= 0) {
            await queryRunner.rollbackTransaction();
            throw new Error('Refund amount is zero or invalid');
        }

        // Step 7: Refund to User Wallet
        const currentBalance = parseFloat(user.deposit_amount || 0);
        user.deposit_amount = currentBalance + refundAmount;
        await userRepo.save(user);

        // Step 8: Get Bet Details to update card totals
        const betDetailRepo = queryRunner.manager.getRepository(BetDetailEntity);
        const betDetails = await betDetailRepo.find({
            where: { slip_id: slip.id },
            select: ['card_number', 'bet_amount']
        });

        // Step 9: Update Card Totals (subtract bet amounts)
        const cardTotalRepo = queryRunner.manager.getRepository(GameCardTotalEntity);
        
        for (const betDetail of betDetails) {
            const cardNumber = betDetail.card_number;
            const betAmount = parseFloat(betDetail.bet_amount || 0);
            
            if (betAmount > 0) {
                // Find the card total for this card
                const cardTotal = await cardTotalRepo.findOne({
                    where: {
                        game_id: slip.game_id,
                        card_number: cardNumber
                    }
                });

                if (cardTotal) {
                    // Subtract the bet amount from the card total
                    const currentTotal = parseFloat(cardTotal.total_bet_amount || 0);
                    const newTotal = Math.max(0, currentTotal - betAmount); // Ensure non-negative
                    cardTotal.total_bet_amount = newTotal;
                    await cardTotalRepo.save(cardTotal);
                    
                    console.log(`📉 Updated card ${cardNumber} total: ${currentTotal} -> ${newTotal} (subtracted ${betAmount})`);
                } else {
                    console.warn(`⚠️ Card total not found for game ${slip.game_id}, card ${cardNumber}. Skipping update.`);
                }
            }
        }

        // Step 10: Mark Slip as Cancelled
        // We'll add a 'cancelled' status, but for now, we can update status to 'lost' and add a flag
        // Or we could add a new status. Let's use a comment field or mark it specially
        // Since status enum doesn't have 'cancelled', we'll keep status but mark in comment
        slip.status = 'lost'; // Mark as lost since it's being cancelled
        await betSlipRepo.save(slip);

        // Step 11: Create Wallet Log for Refund
        const walletLogRepo = queryRunner.manager.getRepository(WalletLogEntity);
        const cancellationReason = reason || (isAdmin ? 'Slip cancelled by admin' : 'Slip cancelled by user');
        
        // Note: game_id might be varchar in games table, but int in wallet_logs
        // Store game_id in comment to ensure it's tracked
        const walletLog = walletLogRepo.create({
            user_id: slip.user_id,
            transaction_type: 'game',
            amount: refundAmount,
            transaction_direction: 'credit',
            game_id: null, // May be int type, so store in comment instead
            comment: `Refund for cancelled slip ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}. Reason: ${cancellationReason}`,
            reference_type: 'cancellation',
            reference_id: slip.slip_id,
            status: 'completed',
            created_at: new Date()
        });
        await walletLogRepo.save(walletLog);

        // Commit transaction BEFORE audit logging to prevent lock contention
        await queryRunner.commitTransaction();
        transactionStarted = false;

        // Step 12: Create Audit Log (AFTER transaction commit to avoid lock contention)
        // For admin cancellations, log as admin action
        // For user cancellations, log as user action
        // Fire-and-forget to prevent blocking the main flow
        auditLog({
            admin_id: isAdmin ? userId : null,
            user_id: slip.user_id,
            action: 'slip_cancelled',
            target_type: 'bet_slip',
            target_id: slip.id,
            details: `Slip cancelled: ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}, Refund: ₹${refundAmount.toFixed(2)}, Reason: ${cancellationReason}, Cancelled by: ${isAdmin ? 'Admin' : 'User'}`,
            ip_address: ipAddress,
            user_agent: userAgent
        }).catch(err => {
            // Log error but don't throw - audit logging is non-critical
            console.error('⚠️ Failed to log audit event (non-critical):', err.message);
        });

        console.log(`✅ Slip cancelled successfully: ${slip.slip_id}, Refund: ₹${refundAmount.toFixed(2)}, User: ${slip.user_id}`);

        return {
            success: true,
            slip_id: slip.slip_id,
            barcode: slip.barcode,
            refund_amount: refundAmount,
            new_balance: user.deposit_amount,
            game_id: slip.game_id,
            reason: cancellationReason
        };

    } catch (error) {
        if (transactionStarted) {
            await queryRunner.rollbackTransaction();
        }
        console.error(`❌ Error cancelling slip ${identifier}:`, error);
        throw error;
    } finally {
        if (queryRunner && !queryRunner.isReleased) {
            await queryRunner.release();
        }
    }
}

