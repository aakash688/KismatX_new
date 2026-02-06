/**
 * Betting Controller
 * Handles bet placement, claim, and bet slip retrieval
 * 
 * @module controllers/bettingController
 */

import { placeBet } from '../services/bettingService.js';
import { claimWinnings } from '../services/claimService.js';
import { cancelSlip } from '../services/slipCancellationService.js';
import { AppDataSource } from '../config/typeorm.config.js';
import { formatIST, toUTC } from '../utils/timezone.js';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';

const BetSlipEntity = "BetSlip";
const BetDetailEntity = "BetDetail";
const GameEntity = "Game";

/**
 * Place a bet
 * POST /api/bets/place
 */
export const placeBetHandler = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { game_id, bets } = req.validatedData || req.body;

        // Get idempotency key from header or generate one
        const idempotencyKey = req.headers['x-idempotency-key'] || uuidv4();

        // Extract IP and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        // Call betting service
        const result = await placeBet(
            userId,
            game_id,
            bets,
            idempotencyKey,
            ipAddress,
            userAgent
        );

        // If duplicate request, return 200 OK
        if (result.duplicate) {
            return res.status(200).json({
                success: true,
                message: result.message,
                data: {
                    slip_id: result.slip_id,
                    barcode: result.barcode,
                    duplicate: true
                }
            });
        }

        // New bet created, return 201 Created
        return res.status(201).json({
            success: true,
            message: 'Bet placed successfully',
            data: {
                slip_id: result.slip_id,
                barcode: result.barcode,
                game_id: result.game_id,
                total_amount: result.total_amount,
                bets: result.bets,
                new_balance: result.new_balance,
                created_at: result.created_at
            }
        });

    } catch (error) {
        console.error('❌ Error placing bet:', error);
        
        // Handle specific error types
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.message.includes('not active') || 
            error.message.includes('has ended') ||
            error.message.includes('Insufficient balance') ||
            error.message.includes('exceeds maximum') ||
            error.message.includes('Invalid')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

/**
 * Claim winnings
 * POST /api/bets/claim
 */
export const claimWinningsHandler = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { identifier } = req.validatedData || req.body;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier (slip_id or barcode) is required'
            });
        }

        // Extract IP and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        // Call claim service
        const result = await claimWinnings(
            identifier,
            userId,
            ipAddress,
            userAgent
        );

        return res.status(200).json({
            success: true,
            message: 'Winnings claimed successfully',
            data: {
                slip_id: result.slip_id,
                barcode: result.barcode,
                amount: result.amount,
                new_balance: result.new_balance,
                game_id: result.game_id
            }
        });

    } catch (error) {
        console.error('❌ Error claiming winnings:', error);

        // Handle specific error types
        if (error.message.includes('not found') || error.message.includes('Bet slip not found')) {
            return res.status(404).json({
                success: false,
                message: 'Bet slip not found',
                hint: 'Make sure you are using the correct barcode (e.g., GAME_YYYYMMDDHHMM_UUIDPREFIX_CHECKSUM) or slip ID'
            });
        }

        if (error.message.includes('already been claimed') ||
            error.message.includes('Cannot claim') ||
            error.message.includes('not settled') ||
            error.message.includes('permission')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

/**
 * Get bet slip by identifier (slip_id or barcode)
 * GET /api/bets/slip/:identifier
 */
export const getBetSlip = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { identifier } = req.params;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier is required'
            });
        }

        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const gameRepo = AppDataSource.getRepository(GameEntity);

        // Find slip by slip_id or barcode
        const slip = await betSlipRepo.findOne({
            where: [
                { slip_id: identifier },
                { barcode: identifier }
            ]
        });

        if (!slip) {
            return res.status(404).json({
                success: false,
                message: 'Bet slip not found'
            });
        }

        // Check ownership (unless user is admin)
        const isAdmin = req.user.roles?.some(role => role.name === 'Admin' || role.name === 'admin');
        if (!isAdmin && slip.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Bet slip not found'
            });
        }

        // Get bet details
        const betDetails = await betDetailRepo.find({
            where: { slip_id: slip.id },
            order: { card_number: 'ASC' }
        });

        // Get game information
        const game = await gameRepo.findOne({
            where: { game_id: slip.game_id }
        });

        // Format response
        return res.status(200).json({
            success: true,
            data: {
                slip_id: slip.slip_id,
                barcode: slip.barcode,
                game_id: slip.game_id,
                total_amount: parseFloat(slip.total_amount || 0),
                payout_amount: parseFloat(slip.payout_amount || 0),
                status: slip.status,
                claimed: slip.claimed || false,
                claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                game: game ? {
                    game_id: game.game_id,
                    start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
                    end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
                    status: game.status,
                    winning_card: game.winning_card,
                    payout_multiplier: parseFloat(game.payout_multiplier || 0),
                    settlement_status: game.settlement_status
                } : null,
                bets: betDetails.map(bd => ({
                    id: bd.id,
                    card_number: bd.card_number,
                    bet_amount: parseFloat(bd.bet_amount || 0),
                    is_winner: bd.is_winner || false,
                    payout_amount: parseFloat(bd.payout_amount || 0)
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error getting bet slip:', error);
        next(error);
    }
};

/**
 * Get user's bet history
 * GET /api/bets/my-bets
 */
export const getMyBets = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status; // optional filter

        const skip = (page - 1) * limit;

        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);

        // Build query
        const queryBuilder = betSlipRepo
            .createQueryBuilder('slip')
            .where('slip.user_id = :userId', { userId })
            .orderBy('slip.created_at', 'DESC');

        // Apply status filter if provided
        if (status) {
            queryBuilder.andWhere('slip.status = :status', { status });
        }

        // Get total count
        const total = await queryBuilder.getCount();

        // Get paginated results
        const slips = await queryBuilder
            .skip(skip)
            .take(limit)
            .getMany();

        // Format response
        return res.status(200).json({
            success: true,
            data: slips.map(slip => ({
                slip_id: slip.slip_id,
                barcode: slip.barcode,
                game_id: slip.game_id,
                total_amount: parseFloat(slip.total_amount || 0),
                payout_amount: parseFloat(slip.payout_amount || 0),
                status: slip.status,
                claimed: slip.claimed || false,
                claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss')
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error('❌ Error getting user bets:', error);
        next(error);
    }
};

/**
 * Get bet slip result by barcode/slip ID (read-only, does not claim)
 * GET /api/bets/result/:identifier
 */
export const getBetSlipResult = async (req, res, next) => {
    try {
        const { identifier } = req.params;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier is required'
            });
        }

        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const gameRepo = AppDataSource.getRepository(GameEntity);

        // Find slip by slip_id or barcode (case-insensitive search for barcode)
        const slip = await betSlipRepo
            .createQueryBuilder('slip')
            .where('slip.slip_id = :identifier', { identifier })
            .orWhere('LOWER(slip.barcode) = LOWER(:identifier)', { identifier })
            .getOne();

        if (!slip) {
            return res.status(404).json({
                success: false,
                message: 'Bet slip not found',
                hint: 'Make sure you are using the correct barcode or slip ID. Barcode format: GAME_YYYYMMDDHHMM_UUIDPREFIX_CHECKSUM'
            });
        }

        // Check if slip was cancelled
        const WalletLogEntity = "WalletLog";
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const cancellationLog = await walletLogRepo.findOne({
            where: {
                reference_type: 'cancellation',
                reference_id: slip.slip_id
            }
        });

        const isCancelled = !!cancellationLog;

        // Get bet details
        const betDetails = await betDetailRepo.find({
            where: { slip_id: slip.id },
            order: { card_number: 'ASC' }
        });

        // Get game information
        const game = await gameRepo.findOne({
            where: { game_id: slip.game_id }
        });

        // Format response (read-only, no claim action)
        return res.status(200).json({
            success: true,
            cancelled: isCancelled,
            message: isCancelled ? 'This slip has been cancelled' : undefined,
            data: {
                slip_id: slip.slip_id,
                barcode: slip.barcode,
                game_id: slip.game_id,
                total_amount: parseFloat(slip.total_amount || 0),
                payout_amount: parseFloat(slip.payout_amount || 0),
                status: slip.status,
                claimed: slip.claimed || false,
                claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                can_claim: !isCancelled && slip.status === 'won' && !slip.claimed && game?.settlement_status === 'settled',
                cancelled: isCancelled,
                game: game ? {
                    game_id: game.game_id,
                    start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
                    end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
                    status: game.status,
                    winning_card: game.winning_card,
                    payout_multiplier: parseFloat(game.payout_multiplier || 0),
                    settlement_status: game.settlement_status
                } : null,
                bets: betDetails.map(bd => ({
                    id: bd.id,
                    card_number: bd.card_number,
                    bet_amount: parseFloat(bd.bet_amount || 0),
                    is_winner: bd.is_winner || false,
                    payout_amount: parseFloat(bd.payout_amount || 0)
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error getting bet slip result:', error);
        next(error);
    }
};

/**
 * Scan barcode and claim winnings if winning (all-in-one)
 * POST /api/bets/scan-and-claim/:identifier
 * 
 * This endpoint:
 * 1. Gets the slip result
 * 2. If winning and not claimed, automatically claims it
 * 3. Marks as claimed and transfers money to user wallet
 */
export const scanAndClaimHandler = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { identifier } = req.params;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier (barcode or slip_id) is required'
            });
        }

        // Extract IP and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        // First, get slip info
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const gameRepo = AppDataSource.getRepository(GameEntity);

        const slip = await betSlipRepo.findOne({
            where: [
                { slip_id: identifier },
                { barcode: identifier }
            ]
        });

        if (!slip) {
            return res.status(404).json({
                success: false,
                message: 'Bet slip not found'
            });
        }

        // Check ownership
        if (slip.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to claim this slip'
            });
        }

        // Check if slip was cancelled
        const WalletLogEntity = "WalletLog";
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
        const cancellationLog = await walletLogRepo.findOne({
            where: {
                reference_type: 'cancellation',
                reference_id: slip.slip_id
            }
        });

        if (cancellationLog) {
            return res.status(400).json({
                success: false,
                message: 'This slip has been cancelled and cannot be claimed',
                cancelled: true
            });
        }

        // Check if already claimed
        if (slip.claimed === true) {
            // Return slip info even if already claimed
            const betDetails = await betDetailRepo.find({
                where: { slip_id: slip.id },
                order: { card_number: 'ASC' }
            });

            const game = await gameRepo.findOne({
                where: { game_id: slip.game_id }
            });

            return res.status(200).json({
                success: true,
                message: 'Slip has already been claimed',
                already_claimed: true,
                data: {
                    slip_id: slip.slip_id,
                    barcode: slip.barcode,
                    game_id: slip.game_id,
                    total_amount: parseFloat(slip.total_amount || 0),
                    payout_amount: parseFloat(slip.payout_amount || 0),
                    status: slip.status,
                    claimed: true,
                    claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                    created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                    game: game ? {
                        game_id: game.game_id,
                        winning_card: game.winning_card,
                        settlement_status: game.settlement_status
                    } : null,
                    bets: betDetails.map(bd => ({
                        card_number: bd.card_number,
                        bet_amount: parseFloat(bd.bet_amount || 0),
                        is_winner: bd.is_winner || false,
                        payout_amount: parseFloat(bd.payout_amount || 0)
                    }))
                }
            });
        }

        // If slip is winning and not claimed, claim it
        if (slip.status === 'won' && !slip.claimed) {
            try {
                const result = await claimWinnings(identifier, userId, ipAddress, userAgent);
                
                // Get updated slip info with bet details
                const updatedSlip = await betSlipRepo.findOne({
                    where: { id: slip.id }
                });

                const betDetails = await betDetailRepo.find({
                    where: { slip_id: slip.id },
                    order: { card_number: 'ASC' }
                });

                const game = await gameRepo.findOne({
                    where: { game_id: slip.game_id }
                });

                return res.status(200).json({
                    success: true,
                    message: 'Winnings claimed successfully',
                    claimed: true,
                    data: {
                        slip_id: result.slip_id,
                        barcode: result.barcode,
                        game_id: result.game_id,
                        total_amount: parseFloat(updatedSlip.total_amount || 0),
                        payout_amount: parseFloat(result.amount),
                        status: updatedSlip.status,
                        claimed: true,
                        claimed_at: updatedSlip.claimed_at ? formatIST(updatedSlip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                        new_balance: result.new_balance,
                        game: game ? {
                            game_id: game.game_id,
                            winning_card: game.winning_card,
                            settlement_status: game.settlement_status
                        } : null,
                        bets: betDetails.map(bd => ({
                            card_number: bd.card_number,
                            bet_amount: parseFloat(bd.bet_amount || 0),
                            is_winner: bd.is_winner || false,
                            payout_amount: parseFloat(bd.payout_amount || 0)
                        }))
                    }
                });
            } catch (claimError) {
                // If claim fails, return error
                if (claimError.message.includes('not settled') ||
                    claimError.message.includes('Cannot claim') ||
                    claimError.message.includes('already been claimed')) {
                    return res.status(400).json({
                        success: false,
                        message: claimError.message
                    });
                }
                throw claimError;
            }
        } else {
            // Slip is not winning or cannot be claimed
            const betDetails = await betDetailRepo.find({
                where: { slip_id: slip.id },
                order: { card_number: 'ASC' }
            });

            const game = await gameRepo.findOne({
                where: { game_id: slip.game_id }
            });

            return res.status(200).json({
                success: true,
                message: slip.status === 'won' ? 'Slip is winning but cannot be claimed yet' : `Slip status: ${slip.status}`,
                claimed: false,
                data: {
                    slip_id: slip.slip_id,
                    barcode: slip.barcode,
                    game_id: slip.game_id,
                    total_amount: parseFloat(slip.total_amount || 0),
                    payout_amount: parseFloat(slip.payout_amount || 0),
                    status: slip.status,
                    claimed: slip.claimed || false,
                    created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                    game: game ? {
                        game_id: game.game_id,
                        winning_card: game.winning_card,
                        settlement_status: game.settlement_status
                    } : null,
                    bets: betDetails.map(bd => ({
                        card_number: bd.card_number,
                        bet_amount: parseFloat(bd.bet_amount || 0),
                        is_winner: bd.is_winner || false,
                        payout_amount: parseFloat(bd.payout_amount || 0)
                    }))
                }
            });
        }

    } catch (error) {
        console.error('❌ Error in scan and claim:', error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

/**
 * Cancel and refund a bet slip
 * Users can cancel their own slips, admins can cancel any slip
 * POST /api/bets/cancel/:identifier
 * POST /api/admin/slips/:identifier/cancel (admin route, same handler)
 */
export const cancelSlipHandler = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { identifier } = req.params;
        const { reason } = req.body;

        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Identifier (barcode or slip_id) is required'
            });
        }

        // Check if user is admin
        const userRoles = req.user.roles || [];
        const isAdmin = userRoles.some(role => 
            role.id === 1 || 
            role.id === 2 || 
            role.name?.toLowerCase() === 'admin' ||
            req.user.user_type?.toLowerCase() === 'admin'
        ) || (Array.isArray(req.user.role) && (req.user.role.includes(1) || req.user.role.includes(2)));

        // Extract IP and user agent
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.get('User-Agent') || 'unknown';

        // Call cancellation service
        const result = await cancelSlip(identifier, userId, isAdmin, reason, ipAddress, userAgent);

        return res.status(200).json({
            success: true,
            message: 'Slip cancelled and refunded successfully',
            data: {
                slip_id: result.slip_id,
                barcode: result.barcode,
                refund_amount: result.refund_amount,
                new_balance: result.new_balance,
                game_id: result.game_id,
                reason: result.reason
            }
        });

    } catch (error) {
        console.error('❌ Error cancelling slip:', error);

        // Handle specific error types
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.message.includes('already been claimed') ||
            error.message.includes('Cannot cancel') ||
            error.message.includes('after game') ||
            error.message.includes('inactive')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        next(error);
    }
};

/**
 * Get user betting statistics with daily breakdown
 * GET /api/bets/stats
 * 
 * Query parameters:
 * - date_from: Start date (YYYY-MM-DD), defaults to first day of current month
 * - date_to: End date (YYYY-MM-DD), defaults to today
 * - game_id: Optional game ID (YYYYMMDDHHMM). If provided, returns all bets for that specific game
 */
export const getBettingStats = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { date_from, date_to, game_id } = req.query;

        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const WalletLogEntity = "WalletLog";
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);

        // If game_id is provided, return detailed slip information for that game
        if (game_id) {
            // Get all bet slips for this user and this game
            const allBetSlips = await betSlipRepo.find({
                where: {
                    user_id: userId,
                    game_id: game_id
                },
                order: {
                    created_at: 'ASC'
                }
            });

            // Get cancelled slip IDs for these slips
            const cancelledSlipIds = new Set();
            if (allBetSlips.length > 0) {
                const slipIds = allBetSlips.map(slip => slip.slip_id);
                const cancellationLogs = await walletLogRepo.find({
                    where: {
                        reference_type: 'cancellation',
                        reference_id: In(slipIds)
                    }
                });
                cancellationLogs.forEach(log => {
                    if (log.reference_id) {
                        cancelledSlipIds.add(log.reference_id);
                    }
                });
            }

            // Filter out cancelled slips
            const betSlips = allBetSlips.filter(slip => !cancelledSlipIds.has(slip.slip_id));

            // Get game information
            const game = await gameRepo.findOne({
                where: { game_id: game_id }
            });

            if (!game) {
                return res.status(404).json({
                    success: false,
                    message: 'Game not found'
                });
            }

            // Format game times to YYYYMMDDHHMM
            const gameStartDatetime = formatIST(game.start_time, 'yyyyMMddHHmm');
            const gameEndDatetime = formatIST(game.end_time, 'yyyyMMddHHmm');

            // Get detailed information for each slip (already filtered to exclude cancelled)
            const detailedSlips = await Promise.all(
                betSlips.map(async (slip) => {
                    // Get bet details to count cards
                    const betDetails = await betDetailRepo.find({
                        where: { slip_id: slip.id }
                    });

                    return {
                        game_id: slip.game_id,
                        game_start_datetime: gameStartDatetime,
                        game_end_datetime: gameEndDatetime,
                        number_of_cards: betDetails.length,
                        total_amount: parseFloat(slip.total_amount || 0),
                        total_winning_points: parseFloat(slip.payout_amount || 0),
                        barcode: slip.barcode,
                        issue_date_time: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                        status: slip.status,
                        is_cancelled: false,
                        claim_status: slip.claimed || false,
                        claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null
                    };
                })
            );

            return res.status(200).json({
                success: true,
                data: {
                    game_id: game_id,
                    game_start_datetime: gameStartDatetime,
                    game_end_datetime: gameEndDatetime,
                    total_slips: detailedSlips.length,
                    slips: detailedSlips
                }
            });
        }

        // Original stats logic when game_id is not provided

        // Parse date range
        // User provides dates in YYYY-MM-DD format (treat as IST dates)
        // Convert to UTC for database query
        let startDate, endDate;
        let startDateStr, endDateStr; // For display purposes
        
        if (date_from) {
            // Parse YYYY-MM-DD as IST date (00:00:00 IST)
            // Create date string and parse as IST
            startDateStr = date_from;
            const dateIST = new Date(date_from + 'T00:00:00');
            // Treat as IST and convert to UTC
            startDate = toUTC(dateIST);
        } else {
            // Default to first day of current month (IST)
            const nowIST = formatIST(new Date(), 'yyyy-MM-dd');
            const [year, month] = nowIST.split('-').map(Number);
            startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
            const dateIST = new Date(startDateStr + 'T00:00:00');
            startDate = toUTC(dateIST);
        }

        if (date_to) {
            // Parse YYYY-MM-DD as IST date (23:59:59 IST)
            endDateStr = date_to;
            const dateIST = new Date(date_to + 'T23:59:59');
            // Treat as IST and convert to UTC
            endDate = toUTC(dateIST);
        } else {
            // Default to today (IST)
            endDateStr = formatIST(new Date(), 'yyyy-MM-dd');
            const dateIST = new Date(endDateStr + 'T23:59:59');
            endDate = toUTC(dateIST);
        }

        // Get all bet slips for user in date range
        const allBetSlips = await betSlipRepo
            .createQueryBuilder('slip')
            .where('slip.user_id = :userId', { userId })
            .andWhere('slip.created_at >= :startDate', { startDate })
            .andWhere('slip.created_at <= :endDate', { endDate })
            .orderBy('slip.created_at', 'ASC')
            .getMany();

        // Get cancelled slip IDs for these slips
        const cancelledSlipIds = new Set();
        if (allBetSlips.length > 0) {
            const slipIds = allBetSlips.map(slip => slip.slip_id);
            const cancellationLogs = await walletLogRepo.find({
                where: {
                    reference_type: 'cancellation',
                    reference_id: In(slipIds)
                }
            });
            cancellationLogs.forEach(log => {
                if (log.reference_id) {
                    cancelledSlipIds.add(log.reference_id);
                }
            });
        }

        // Filter out cancelled slips
        const betSlips = allBetSlips.filter(slip => !cancelledSlipIds.has(slip.slip_id));

        // Group by date and calculate totals (excluding cancelled slips)
        const dailyStats = new Map();
        let totalBetsPlaced = 0;
        let totalWinnings = 0;
        let totalSlips = 0;
        let winningSlips = 0;
        let losingSlips = 0;
        let pendingSlips = 0;

        betSlips.forEach(slip => {
            const slipDate = new Date(slip.created_at);
            const dateKey = formatIST(slipDate, 'yyyy-MM-dd');
            
            // Initialize day stats if not exists
            if (!dailyStats.has(dateKey)) {
                dailyStats.set(dateKey, {
                    date: dateKey,
                    total_bets_placed: 0,
                    total_winnings: 0,
                    slips_count: 0,
                    winning_slips: 0,
                    losing_slips: 0,
                    pending_slips: 0
                });
            }

            const dayStats = dailyStats.get(dateKey);
            const betAmount = parseFloat(slip.total_amount || 0);
            const payoutAmount = parseFloat(slip.payout_amount || 0);

            // Add to daily totals
            dayStats.total_bets_placed += betAmount;
            dayStats.slips_count += 1;

            // Add winnings only for won slips that have been claimed/scanned (status = 'won' AND claimed = true)
            if (slip.status === 'won' && slip.claimed === true) {
                dayStats.total_winnings += payoutAmount;
                dayStats.winning_slips += 1;
                totalWinnings += payoutAmount;
                winningSlips += 1;
            } else if (slip.status === 'lost') {
                dayStats.losing_slips += 1;
                losingSlips += 1;
            } else {
                dayStats.pending_slips += 1;
                pendingSlips += 1;
            }

            // Add to overall totals
            totalBetsPlaced += betAmount;
            totalSlips += 1;
        });

        // Convert map to array and sort by date
        const dailyBreakdown = Array.from(dailyStats.values()).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        // Calculate net profit/loss
        const netProfit = totalWinnings - totalBetsPlaced;

        // Format dates for response
        const formattedStartDate = startDateStr;
        const formattedEndDate = endDateStr;

        return res.status(200).json({
            success: true,
            data: {
                period: {
                    date_from: formattedStartDate,
                    date_to: formattedEndDate
                },
                summary: {
                    total_bets_placed: parseFloat(totalBetsPlaced.toFixed(2)),
                    total_winnings: parseFloat(totalWinnings.toFixed(2)),
                    net_profit: parseFloat(netProfit.toFixed(2)),
                    total_slips: totalSlips,
                    winning_slips: winningSlips,
                    losing_slips: losingSlips,
                    pending_slips: pendingSlips
                },
                daily_breakdown: dailyBreakdown.map(day => ({
                    date: day.date,
                    total_bets_placed: parseFloat(day.total_bets_placed.toFixed(2)),
                    total_winnings: parseFloat(day.total_winnings.toFixed(2)),
                    net_profit: parseFloat((day.total_winnings - day.total_bets_placed).toFixed(2)),
                    slips_count: day.slips_count,
                    winning_slips: day.winning_slips,
                    losing_slips: day.losing_slips,
                    pending_slips: day.pending_slips
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error getting betting stats:', error);
        next(error);
    }
};

/**
 * Get user's daily bets with detailed information
 * GET /api/bets/daily?date=YYYY-MM-DD
 * 
 * Returns all bets for the logged-in user for a specific day
 * with detailed game info, bet details, and profit/loss
 */
export const getDailyBets = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { date } = req.query;

        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const WalletLogEntity = "WalletLog";
        const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);

        // Parse date (default to today in IST)
        let targetDate, startDate, endDate;
        
        if (date) {
            // User provided date in YYYY-MM-DD format (treat as IST)
            targetDate = date;
            const dateIST = new Date(date + 'T00:00:00');
            startDate = toUTC(dateIST);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Default to today (IST)
            targetDate = formatIST(new Date(), 'yyyy-MM-dd');
            const dateIST = new Date(targetDate + 'T00:00:00');
            startDate = toUTC(dateIST);
            const endDateIST = new Date(targetDate + 'T23:59:59');
            endDate = toUTC(endDateIST);
        }

        // Get all bet slips for user on this date
        const betSlips = await betSlipRepo
            .createQueryBuilder('slip')
            .where('slip.user_id = :userId', { userId })
            .andWhere('slip.created_at >= :startDate', { startDate })
            .andWhere('slip.created_at <= :endDate', { endDate })
            .orderBy('slip.created_at', 'DESC')
            .getMany();

        // Get detailed information for each slip
        const detailedBets = await Promise.all(
            betSlips.map(async (slip) => {
                // Get bet details (cards bet on)
                const betDetails = await betDetailRepo.find({
                    where: { slip_id: slip.id },
                    order: { card_number: 'ASC' }
                });

                // Get game information
                const game = await gameRepo.findOne({
                    where: { game_id: slip.game_id }
                });

                // Calculate profit/loss if game is settled
                let profit = null;
                if (game && game.settlement_status === 'settled') {
                    // Profit = payout_amount - total_amount
                    // If negative, it's a loss
                    profit = parseFloat(slip.payout_amount || 0) - parseFloat(slip.total_amount || 0);
                }

                // Determine slip status - check if slip is cancelled
                let slipStatus = slip.status;
                let isCancelled = false;
                
                // Check wallet logs to see if this slip was cancelled (refunded)
                const cancellationLog = await walletLogRepo.findOne({
                    where: {
                        user_id: userId,
                        reference_type: 'cancellation',
                        reference_id: slip.slip_id
                    }
                });
                
                if (cancellationLog) {
                    slipStatus = 'cancelled';
                    isCancelled = true;
                }

                return {
                    game_id: slip.game_id,
                    game_full_start_time: game ? formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss') : null,
                    game_full_end_time: game ? formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss') : null,
                    game_status: game ? game.status : null,
                    game_settlement_status: game ? game.settlement_status : null,
                    winning_card: game && game.settlement_status === 'settled' ? game.winning_card : null,
                    slip_id: slip.slip_id,
                    barcode: slip.barcode,
                    barcode_issue_time: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                    total_cards: betDetails.length,
                    total_amount: parseFloat(slip.total_amount || 0),
                    payout_amount: game && game.settlement_status === 'settled' ? parseFloat(slip.payout_amount || 0) : null,
                    profit: game && game.settlement_status === 'settled' ? parseFloat(profit.toFixed(2)) : null,
                    status: slipStatus,
                    is_cancelled: isCancelled,
                    claimed: slip.claimed || false,
                    claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: {
                date: targetDate,
                total_bets: detailedBets.length,
                bets: detailedBets
            }
        });

    } catch (error) {
        console.error('❌ Error getting daily bets:', error);
        next(error);
    }
};
