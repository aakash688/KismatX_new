/**
 * Claim Service
 * Handles winnings claim with atomic transactions
 * 
 * @module services/claimService
 */

import { AppDataSource } from '../config/typeorm.config.js';
import { auditLog } from '../utils/auditLogger.js';

const BetSlipEntity = "BetSlip";
const GameEntity = "Game";
const UserEntity = "User";
const WalletLogEntity = "WalletLog";

/**
 * Claim winnings (⚠️ CRITICAL - Must be atomic)
 * 
 * @param {string} identifier - Slip ID (UUID) or barcode
 * @param {number} userId - User ID claiming the winnings
 * @param {string} ipAddress - User IP address
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Claim result
 */
export async function claimWinnings(identifier, userId, ipAddress, userAgent) {
    const queryRunner = AppDataSource.createQueryRunner();
    let transactionStarted = false;

    try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        transactionStarted = true;

        // Step 1: Lock Bet Slip (PESSIMISTIC WRITE)
        const betSlipRepo = queryRunner.manager.getRepository(BetSlipEntity);
        
        // Find slip by slip_id or barcode (case-insensitive for barcode)
        const slip = await betSlipRepo
            .createQueryBuilder('slip')
            .setLock('pessimistic_write')
            .where('slip.slip_id = :identifier', { identifier })
            .orWhere('LOWER(slip.barcode) = LOWER(:identifier)', { identifier })
            .getOne();

        if (!slip) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Bet slip not found');
        }

        // Step 2: Validate Claim Eligibility
        if (slip.user_id !== userId) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('You do not have permission to claim this slip');
        }

        if (slip.claimed === true) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('This slip has already been claimed');
        }

        // Check if slip was cancelled (by checking for cancellation wallet log)
        const walletLogRepo = queryRunner.manager.getRepository(WalletLogEntity);
        const cancellationLog = await walletLogRepo.findOne({
            where: {
                reference_type: 'cancellation',
                reference_id: slip.slip_id
            }
        });

        if (cancellationLog) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Cannot claim winnings for a cancelled slip');
        }

        if (slip.status !== 'won') {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error(`Cannot claim slip with status: ${slip.status}. Only won slips can be claimed.`);
        }

        const payoutAmount = parseFloat(slip.payout_amount || 0);
        if (payoutAmount <= 0) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Payout amount is zero or invalid');
        }

        // Validate game is settled
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        const game = await gameRepo.findOne({
            where: { game_id: slip.game_id }
        });

        if (!game) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Game not found');
        }

        if (game.settlement_status !== 'settled') {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error(`Game is not settled. Current status: ${game.settlement_status}`);
        }

        // Step 3: Lock User Wallet (PESSIMISTIC WRITE)
        const userRepo = queryRunner.manager.getRepository(UserEntity);
        const user = await userRepo
            .createQueryBuilder('user')
            .setLock('pessimistic_write')
            .where('user.id = :userId', { userId })
            .getOne();

        if (!user) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('User not found');
        }

        // Step 4: Validate User Account
        if (user.status !== 'active') {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error(`Cannot claim winnings. Account status: ${user.status}`);
        }

        // Step 5: Credit Winnings
        const currentBalance = parseFloat(user.deposit_amount || 0);
        user.deposit_amount = currentBalance + payoutAmount;
        await userRepo.save(user);

        // Step 6: Mark Slip as Claimed
        slip.claimed = true;
        slip.claimed_at = new Date();
        await betSlipRepo.save(slip);

        // Step 7: Create Wallet Log
        // Note: game_id is stored in comment because WalletLog.game_id is INT
        // but slip.game_id is VARCHAR (e.g., "202511021435")
        // walletLogRepo was already declared above for cancellation check
        const walletLog = walletLogRepo.create({
            user_id: userId,
            transaction_type: 'game',
            amount: payoutAmount,
            transaction_direction: 'credit',
            game_id: null, // Cannot store VARCHAR game_id in INT column, use comment instead
            comment: `Winnings claimed for slip ${slip.slip_id} (${slip.barcode}), Game: ${slip.game_id}`,
            reference_type: 'claim',
            reference_id: slip.slip_id,
            status: 'completed',
            created_at: new Date()
        });
        await walletLogRepo.save(walletLog);

        // Commit transaction BEFORE audit logging to prevent lock contention
        await queryRunner.commitTransaction();
        transactionStarted = false;

        // Step 8: Create Audit Log (AFTER transaction commit to avoid lock contention)
        // Fire-and-forget to prevent blocking the main flow
        auditLog({
            user_id: userId,
            action: 'winnings_claimed',
            target_type: 'bet_slip',
            target_id: slip.id,
            details: `Winnings claimed: Slip ${slip.slip_id}, Amount: ${payoutAmount}, Game: ${slip.game_id}`,
            ip_address: ipAddress,
            user_agent: userAgent
        }).catch(err => {
            // Log error but don't throw - audit logging is non-critical
            console.error('⚠️ Failed to log audit event (non-critical):', err.message);
        });

        console.log(`✅ Winnings claimed successfully: Slip ${slip.slip_id}, Amount: ${payoutAmount}, User: ${userId}`);

        return {
            success: true,
            slip_id: slip.slip_id,
            barcode: slip.barcode,
            amount: payoutAmount,
            new_balance: user.deposit_amount,
            game_id: slip.game_id
        };

    } catch (error) {
        // Only rollback if transaction was started and hasn't been rolled back yet
        if (transactionStarted) {
            try {
                await queryRunner.rollbackTransaction();
            } catch (rollbackError) {
                // Ignore rollback errors (transaction might already be rolled back)
                console.error('⚠️ Error during rollback (may be already rolled back):', rollbackError.message);
            }
        }
        console.error(`❌ Error claiming winnings for ${identifier}:`, error);
        throw error;
    } finally {
        if (queryRunner && !queryRunner.isReleased) {
            await queryRunner.release();
        }
    }
}





