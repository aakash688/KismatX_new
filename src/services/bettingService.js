/**
 * Betting Service
 * Handles bet placement with atomic transactions and race condition protection
 * 
 * @module services/bettingService
 */

import { AppDataSource } from '../config/typeorm.config.js';
import { generateSecureBarcode } from '../utils/barcode.js';
import { getSettingAsNumber } from '../utils/settings.js';
import { auditLog } from '../utils/auditLogger.js';
import { v4 as uuidv4 } from 'uuid';

const UserEntity = "User";
const GameEntity = "Game";
const BetSlipEntity = "BetSlip";
const BetDetailEntity = "BetDetail";
const GameCardTotalEntity = "GameCardTotal";
const WalletLogEntity = "WalletLog";

/**
 * Place a bet (⚠️ CRITICAL - Must be atomic)
 * 
 * @param {number} userId - User ID
 * @param {string} gameId - Game ID (YYYYMMDDHHMM)
 * @param {Array<{card_number: number, bet_amount: number}>} bets - Array of bets
 * @param {string} idempotencyKey - Idempotency key for duplicate prevention
 * @param {string} ipAddress - User IP address
 * @param {string} userAgent - User agent string
 * @returns {Promise<Object>} Bet slip details
 */
export async function placeBet(userId, gameId, bets, idempotencyKey, ipAddress, userAgent) {
    const queryRunner = AppDataSource.createQueryRunner();
    let transactionStarted = false;
    
    try {
        await queryRunner.connect();
        await queryRunner.startTransaction();
        transactionStarted = true;
        // Step 1: Lock User Row (PESSIMISTIC WRITE)
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

        // Step 2: Check Idempotency
        if (idempotencyKey) {
            const betSlipRepo = queryRunner.manager.getRepository(BetSlipEntity);
            const existingSlip = await betSlipRepo.findOne({
                where: { idempotency_key: idempotencyKey }
            });

            if (existingSlip) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                console.log(`📋 Idempotency check: Duplicate request detected for key: ${idempotencyKey}`);
                return {
                    success: true,
                    duplicate: true,
                    slip_id: existingSlip.slip_id,
                    barcode: existingSlip.barcode,
                    message: 'This bet was already placed (duplicate request)'
                };
            }
        }

        // Step 3: Validate Game
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        const game = await gameRepo.findOne({
            where: { game_id: gameId }
        });

        if (!game) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Game not found');
        }

        if (game.status !== 'active') {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error(`Game is not active. Current status: ${game.status}`);
        }

        const now = new Date();
        if (now >= game.end_time) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Game has ended. Cannot place bets.');
        }

        // Step 4: Validate Bets
        const maximumLimit = await getSettingAsNumber('maximum_limit', 5000);

        if (!Array.isArray(bets) || bets.length === 0) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('At least one bet is required');
        }

        if (bets.length > 12) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error('Maximum 12 cards per bet slip');
        }

        const cardNumbers = new Set();
        let totalAmount = 0;

        for (const bet of bets) {
            // Validate card number
            if (!Number.isInteger(bet.card_number) || bet.card_number < 1 || bet.card_number > 12) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                throw new Error(`Invalid card number: ${bet.card_number}. Must be between 1 and 12.`);
            }

            // Check for duplicates
            if (cardNumbers.has(bet.card_number)) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                throw new Error(`Duplicate card number: ${bet.card_number}. Each card can only be bet once per slip.`);
            }
            cardNumbers.add(bet.card_number);

            // Validate bet amount
            const betAmount = parseFloat(bet.bet_amount);
            if (isNaN(betAmount) || betAmount <= 0) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                throw new Error(`Invalid bet amount: ${bet.bet_amount}. Must be a positive number.`);
            }

            if (betAmount > maximumLimit) {
                if (transactionStarted) {
                    await queryRunner.rollbackTransaction();
                    transactionStarted = false;
                }
                throw new Error(`Bet amount ${betAmount} exceeds maximum limit of ${maximumLimit}`);
            }

            totalAmount += betAmount;
        }

        // Step 5: Check Balance
        const userBalance = parseFloat(user.deposit_amount || 0);
        if (userBalance < totalAmount) {
            if (transactionStarted) {
                await queryRunner.rollbackTransaction();
                transactionStarted = false;
            }
            throw new Error(`Insufficient balance. Required: ${totalAmount}, Available: ${userBalance}`);
        }

        // Step 6: Deduct Balance
        user.deposit_amount = userBalance - totalAmount;
        await userRepo.save(user);

        // Step 7: Create Bet Slip
        const slipId = uuidv4();
        const barcode = generateSecureBarcode(gameId, slipId);

        const betSlipRepo = queryRunner.manager.getRepository(BetSlipEntity);
        const betSlip = betSlipRepo.create({
            slip_id: slipId,
            user_id: userId,
            game_id: gameId,
            total_amount: totalAmount,
            barcode: barcode,
            payout_amount: 0,
            status: 'pending',
            idempotency_key: idempotencyKey || null,
            created_at: new Date(),
            updated_at: new Date()
        });

        const savedSlip = await betSlipRepo.save(betSlip);

        // Step 8: Create Bet Details
        const betDetailRepo = queryRunner.manager.getRepository(BetDetailEntity);
        const betDetails = [];

        for (const bet of bets) {
            const betDetail = betDetailRepo.create({
                slip_id: savedSlip.id,
                card_number: bet.card_number,
                bet_amount: bet.bet_amount,
                is_winner: false,
                payout_amount: 0,
                game_id: gameId,
                user_id: userId,
                created_at: new Date(),
                updated_at: new Date()
            });

            const savedDetail = await betDetailRepo.save(betDetail);
            betDetails.push(savedDetail);
        }

        // Step 9: Update Card Totals
        const cardTotalRepo = queryRunner.manager.getRepository(GameCardTotalEntity);

        for (const bet of bets) {
            // Find or create card total
            let cardTotal = await cardTotalRepo.findOne({
                where: {
                    game_id: gameId,
                    card_number: bet.card_number
                }
            });

            if (cardTotal) {
                // Update existing
                cardTotal.total_bet_amount = parseFloat(cardTotal.total_bet_amount || 0) + bet.bet_amount;
                await cardTotalRepo.save(cardTotal);
            } else {
                // Create new
                cardTotal = cardTotalRepo.create({
                    game_id: gameId,
                    card_number: bet.card_number,
                    total_bet_amount: bet.bet_amount,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                await cardTotalRepo.save(cardTotal);
            }
        }

        // Step 10: Create Wallet Log
        const walletLogRepo = queryRunner.manager.getRepository(WalletLogEntity);
        const walletLog = walletLogRepo.create({
            user_id: userId,
            transaction_type: 'game',
            amount: totalAmount,
            transaction_direction: 'debit',
            game_id: null, // Not using game_id field, using reference_id instead
            comment: `Bet placed on game ${gameId}`,
            reference_type: 'bet_placement',
            reference_id: slipId,
            status: 'completed',
            created_at: new Date()
        });
        await walletLogRepo.save(walletLog);

        // Commit transaction BEFORE audit logging to prevent lock contention
        if (transactionStarted) {
            await queryRunner.commitTransaction();
            transactionStarted = false;
        }

        // Step 11: Create Audit Log (AFTER transaction commit to avoid lock contention)
        // Fire-and-forget to prevent blocking the main flow
        auditLog({
            user_id: userId,
            action: 'bet_placed',
            target_type: 'bet_slip',
            target_id: savedSlip.id,
            details: `Bet placed: Game ${gameId}, Amount: ${totalAmount}, Cards: ${bets.length}, Slip ID: ${slipId}`,
            ip_address: ipAddress,
            user_agent: userAgent
        }).catch(err => {
            // Log error but don't throw - audit logging is non-critical
            console.error('⚠️ Failed to log audit event (non-critical):', err.message);
        });

        console.log(`✅ Bet placed successfully: Slip ${slipId}, Amount: ${totalAmount}, User: ${userId}`);

        return {
            success: true,
            duplicate: false,
            slip_id: slipId,
            barcode: barcode,
            total_amount: totalAmount,
            bets: betDetails.map(bd => ({
                card_number: bd.card_number,
                bet_amount: parseFloat(bd.bet_amount),
                id: bd.id
            })),
            new_balance: user.deposit_amount,
            game_id: gameId,
            created_at: betSlip.created_at
        };

    } catch (error) {
        // Only rollback if transaction was started
        if (transactionStarted) {
            try {
                await queryRunner.rollbackTransaction();
            } catch (rollbackError) {
                console.error('❌ Error during rollback:', rollbackError);
            }
            transactionStarted = false;
        }
        console.error('❌ Error placing bet:', error);
        throw error;
    } finally {
        // Always release the query runner
        if (queryRunner && queryRunner.isReleased === false) {
            await queryRunner.release();
        }
    }
}


