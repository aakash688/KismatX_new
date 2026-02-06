/**
 * Settlement Service
 * Handles game settlement with atomic transactions
 * 
 * @module services/settlementService
 */

import { AppDataSource } from '../config/typeorm.config.js';
import { auditLog } from '../utils/auditLogger.js';
import { getSetting } from '../utils/settings.js';

const GameEntity = "Game";
const BetDetailEntity = "BetDetail";
const BetSlipEntity = "BetSlip";
const WalletLogEntity = "WalletLog";

/**
 * Settle a game (⚠️ CRITICAL - Must be atomic)
 * 
 * @param {string} gameId - Game ID (YYYYMMDDHHMM)
 * @param {number} winningCard - Winning card number (1-12)
 * @param {number} adminId - Admin ID who declared the result
 * @returns {Promise<Object>} Settlement summary
 */
export async function settleGame(gameId, winningCard, adminId) {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // Step 1: Lock Game (PESSIMISTIC WRITE)
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        const game = await gameRepo
            .createQueryBuilder('game')
            .setLock('pessimistic_write')
            .where('game.game_id = :gameId', { gameId })
            .getOne();

        if (!game) {
            await queryRunner.rollbackTransaction();
            throw new Error('Game not found');
        }

        // Step 2: Validate Game State
        // Get game_result_type to determine if early settlement is allowed
        const gameResultType = await getSetting('game_result_type', 'manual');
        
        // In manual mode, allow settling active games (early settlement)
        // In auto mode, only allow settling completed games
        const allowedStatuses = gameResultType === 'manual' 
            ? ['active', 'completed']  // Manual mode: can settle during game or after
            : ['completed'];            // Auto mode: only after completion
        
        if (!allowedStatuses.includes(game.status)) {
            await queryRunner.rollbackTransaction();
            throw new Error(`Game cannot be settled. Current status: ${game.status}, Mode: ${gameResultType}. In ${gameResultType} mode, games can only be settled when status is: ${allowedStatuses.join(' or ')}`);
        }

        if (game.settlement_status !== 'not_settled') {
            await queryRunner.rollbackTransaction();
            throw new Error(`Game is already ${game.settlement_status}. Cannot settle again.`);
        }

        if (!Number.isInteger(winningCard) || winningCard < 1 || winningCard > 12) {
            await queryRunner.rollbackTransaction();
            throw new Error(`Invalid winning card: ${winningCard}. Must be between 1 and 12.`);
        }

        // Step 3: Mark as Settling
        game.settlement_status = 'settling';
        game.settlement_started_at = new Date();
        await gameRepo.save(game);

        // Step 4: Update Winner Bet Details (BULK)
        const betDetailRepo = queryRunner.manager.getRepository(BetDetailEntity);
        const multiplier = parseFloat(game.payout_multiplier || 10);

        // Update winners using raw query for better performance
        // Note: TypeORM doesn't easily support calculated fields in bulk updates,
        // so we use raw SQL for the calculation
        await queryRunner.query(`
            UPDATE bet_details
            SET is_winner = TRUE,
                payout_amount = bet_amount * ${multiplier}
            WHERE game_id = ? AND card_number = ?
        `, [gameId, winningCard]);

        // Step 5: Update Loser Bet Details (BULK)
        await betDetailRepo
            .createQueryBuilder()
            .update(BetDetailEntity)
            .set({
                is_winner: false,
                payout_amount: 0
            })
            .where('game_id = :gameId', { gameId })
            .andWhere('card_number != :winningCard', { winningCard })
            .execute();

        // Step 6: Get cancelled slip IDs first (to exclude them from payout calculations)
        const walletLogRepo = queryRunner.manager.getRepository(WalletLogEntity);
        const betSlipRepo = queryRunner.manager.getRepository(BetSlipEntity);
        
        // Get all bet slips for this game to check which ones are cancelled
        const gameSlips = await betSlipRepo.find({
            where: { game_id: gameId },
            select: ['id', 'slip_id']
        });
        
        // Get cancelled slip IDs (reference_id in wallet_logs with reference_type = 'cancellation')
        const gameSlipIds = gameSlips.map(s => s.slip_id);
        const cancelledSlips = gameSlipIds.length > 0 ? await walletLogRepo
            .createQueryBuilder('wl')
            .select('DISTINCT wl.reference_id', 'slip_id')
            .where('wl.reference_type = :refType', { refType: 'cancellation' })
            .andWhere('wl.reference_id IN (:...slipIds)', { slipIds: gameSlipIds })
            .getRawMany() : [];
        
        const cancelledSlipIds = new Set(cancelledSlips.map(c => c.slip_id));
        const cancelledSlipDbIds = new Set(
            gameSlips
                .filter(s => cancelledSlipIds.has(s.slip_id))
                .map(s => s.id.toString())
        );

        // Step 7: Calculate Slip Payouts (exclude cancelled slips)
        // Get all bet details grouped by slip_id, but exclude cancelled slips
        let slipPayoutsQuery = betDetailRepo
            .createQueryBuilder('bd')
            .select('bd.slip_id', 'slip_id')
            .addSelect('SUM(bd.payout_amount)', 'total_payout')
            .where('bd.game_id = :gameId', { gameId });
        
        // Exclude bet details from cancelled slips
        if (cancelledSlipDbIds.size > 0) {
            slipPayoutsQuery = slipPayoutsQuery.andWhere('bd.slip_id NOT IN (:...cancelledSlipDbIds)', { 
                cancelledSlipDbIds: Array.from(cancelledSlipDbIds) 
            });
        }
        
        const slipPayouts = await slipPayoutsQuery
            .groupBy('bd.slip_id')
            .getRawMany();

        // Step 8: Update Bet Slips (cancelled slips already excluded from slipPayouts)
        let winningSlipsCount = 0;
        let losingSlipsCount = 0;
        let totalPayout = 0;

        for (const payout of slipPayouts) {
            const slipPayoutAmount = parseFloat(payout.total_payout || 0);
            const slipStatus = slipPayoutAmount > 0 ? 'won' : 'lost';

            await betSlipRepo
                .createQueryBuilder()
                .update(BetSlipEntity)
                .set({
                    payout_amount: slipPayoutAmount,
                    status: slipStatus
                })
                .where('id = :slipId', { slipId: payout.slip_id })
                .execute();

            if (slipPayoutAmount > 0) {
                winningSlipsCount++;
                totalPayout += slipPayoutAmount;
            } else {
                losingSlipsCount++;
            }
        }

        // Count cancelled slips as losing slips for statistics
        losingSlipsCount += cancelledSlipIds.size;

        // Step 9: Mark Settlement Complete
        // If game was settled early (while active), also mark it as completed
        if (game.status === 'active') {
            game.status = 'completed';
        }
        game.winning_card = winningCard;
        game.settlement_status = 'settled';
        game.settlement_completed_at = new Date();
        game.settlement_error = null;
        await gameRepo.save(game);

        // Commit transaction BEFORE audit logging to prevent lock contention
        await queryRunner.commitTransaction();

        // Step 10: Audit Log (AFTER transaction commit to avoid lock contention)
        // Fire-and-forget to prevent blocking the main flow
        auditLog({
            admin_id: adminId,
            action: 'game_settled',
            target_type: 'game',
            target_id: game.id,
            details: `Game ${gameId} settled. Winning card: ${winningCard}. Winning slips: ${winningSlipsCount}, Losing slips: ${losingSlipsCount}, Total payout: ${totalPayout}`
        }).catch(err => {
            // Log error but don't throw - audit logging is non-critical
            console.error('⚠️ Failed to log audit event (non-critical):', err.message);
        });

        console.log(`✅ Game ${gameId} settled successfully. Winning card: ${winningCard}, Payout: ${totalPayout}`);

        return {
            success: true,
            game_id: gameId,
            winning_card: winningCard,
            winning_slips: winningSlipsCount,
            losing_slips: losingSlipsCount,
            total_payout: totalPayout,
            multiplier: multiplier
        };

    } catch (error) {
        await queryRunner.rollbackTransaction();
        
        // Mark settlement as failed
        try {
            const gameRepo = queryRunner.manager.getRepository(GameEntity);
            const game = await gameRepo.findOne({ where: { game_id: gameId } });
            if (game && game.settlement_status === 'settling') {
                game.settlement_status = 'failed';
                game.settlement_error = error.message;
                await gameRepo.save(game);
            }
        } catch (updateError) {
            console.error('Error updating settlement error:', updateError);
        }

        console.error(`❌ Error settling game ${gameId}:`, error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

