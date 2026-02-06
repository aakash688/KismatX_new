/**
 * Admin Game Controller
 * Handles admin-only game management endpoints
 * 
 * @module controllers/admin/adminGameController
 */

import { AppDataSource } from '../../config/typeorm.config.js';
import { formatIST } from '../../utils/timezone.js';
import { settleGame as settleGameService } from '../../services/settlementService.js';
import { getSetting } from '../../utils/settings.js';
import { In } from 'typeorm';

const GameEntity = "Game";
const BetSlipEntity = "BetSlip";
const BetDetailEntity = "BetDetail";
const GameCardTotalEntity = "GameCardTotal";
const UserEntity = "User";

/**
 * Get user-wise aggregates for a specific game
 * GET /api/admin/games/:gameId/users
 * 
 * Response:
 * [
 *   {
 *     user: { id, user_id, first_name, last_name },
 *     totals: {
 *       total_bet_amount,
 *       total_winning_amount,
 *       total_claimed_amount
 *     }
 *   }
 * ]
 */
export const getGameUserStats = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const userRepo = AppDataSource.getRepository(UserEntity);

        // Verify game exists
        const game = await gameRepo.findOne({ where: { game_id: gameId } });
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get all bet slips for this game
        const allBetSlips = await betSlipRepo.find({
            where: { game_id: gameId }
        });

        // Exclude cancelled slips (based on WalletLog reference_type=cancellation and reference_id=slip_id)
        const walletLogRepo = AppDataSource.getRepository("WalletLog");
        const cancelledSlipUuids = new Set();
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
                    cancelledSlipUuids.add(log.reference_id);
                }
            });
        }

        const betSlips = allBetSlips.filter(slip => !cancelledSlipUuids.has(slip.slip_id));

        // Aggregate by user_id
        const userIdToTotals = new Map();
        betSlips.forEach(slip => {
            const key = slip.user_id;
            const entry = userIdToTotals.get(key) || {
                total_bet_amount: 0,
                total_winning_amount: 0,
                total_claimed_amount: 0
            };
            const totalAmount = parseFloat(slip.total_amount || 0);
            const payoutAmount = parseFloat(slip.payout_amount || 0);
            entry.total_bet_amount += totalAmount;
            entry.total_winning_amount += payoutAmount;
            if (slip.claimed) {
                entry.total_claimed_amount += payoutAmount;
            }
            userIdToTotals.set(key, entry);
        });

        // Fetch user info for involved users
        const involvedUserIds = Array.from(userIdToTotals.keys());
        const users = involvedUserIds.length > 0
            ? await userRepo.find({ where: { id: In(involvedUserIds) } })
            : [];
        const idToUser = new Map(users.map(u => [u.id, u]));

        // Build response array
        const result = involvedUserIds.map(uid => {
            const u = idToUser.get(uid);
            const t = userIdToTotals.get(uid);
            return {
                user: u ? {
                    id: u.id,
                    user_id: u.user_id,
                    first_name: u.first_name,
                    last_name: u.last_name
                } : {
                    id: uid,
                    user_id: `user:${uid}`,
                    first_name: '',
                    last_name: ''
                },
                totals: {
                    total_bet_amount: t.total_bet_amount,
                    total_winning_amount: t.total_winning_amount,
                    total_claimed_amount: t.total_claimed_amount
                }
            };
        }).sort((a, b) => b.totals.total_bet_amount - a.totals.total_bet_amount);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('❌ Error getting game user stats:', error);
        next(error);
    }
};

/**
 * List all games with filters
 * GET /api/admin/games
 */
export const listGames = async (req, res, next) => {
    try {
        const { status, settlement_status, date, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const queryBuilder = gameRepo.createQueryBuilder('game');

        // Apply filters
        if (status) {
            queryBuilder.andWhere('game.status = :status', { status });
        }

        if (settlement_status) {
            queryBuilder.andWhere('game.settlement_status = :settlement_status', { settlement_status });
        }

        if (date) {
            // Filter by date (match start_time date)
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            queryBuilder.andWhere('game.start_time >= :startDate', { startDate });
            queryBuilder.andWhere('game.start_time <= :endDate', { endDate });
        }

        // Get total count
        const total = await queryBuilder.getCount();

        // Get paginated results
        const games = await queryBuilder
            .orderBy('game.start_time', 'DESC')
            .skip(skip)
            .take(parseInt(limit))
            .getMany();

        // Get bet slip totals for all games in one query (more efficient)
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const gameIds = games.map(g => g.game_id);
        
        // Get all bet slips for these games
        const allBetSlips = gameIds.length > 0 ? await betSlipRepo.find({
            where: {
                game_id: In(gameIds)
            }
        }) : [];
        
        // Get cancelled slip IDs for all games
        const walletLogRepo = AppDataSource.getRepository("WalletLog");
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
        
        // Create a map of game_id -> total_wagered (excluding cancelled slips)
        const wageredMap = new Map();
        betSlips.forEach(slip => {
            const current = wageredMap.get(slip.game_id) || 0;
            wageredMap.set(slip.game_id, current + parseFloat(slip.total_amount || 0));
        });
        
        // Format response with IST times and add total wagered
        const formattedGames = games.map(game => ({
            id: game.id,
            game_id: game.game_id,
            start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
            end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
            status: game.status,
            winning_card: game.winning_card,
            payout_multiplier: parseFloat(game.payout_multiplier || 0),
            settlement_status: game.settlement_status,
            settlement_started_at: game.settlement_started_at ? formatIST(game.settlement_started_at, 'yyyy-MM-dd HH:mm:ss') : null,
            settlement_completed_at: game.settlement_completed_at ? formatIST(game.settlement_completed_at, 'yyyy-MM-dd HH:mm:ss') : null,
            settlement_error: game.settlement_error,
            created_at: formatIST(game.created_at, 'yyyy-MM-dd HH:mm:ss'),
            updated_at: formatIST(game.updated_at, 'yyyy-MM-dd HH:mm:ss'),
            total_wagered: wageredMap.get(game.game_id) || 0
        }));

        return res.status(200).json({
            success: true,
            data: formattedGames,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                hasNextPage: skip + parseInt(limit) < total,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('❌ Error listing games:', error);
        next(error);
    }
};

/**
 * Get detailed game statistics
 * GET /api/admin/games/:gameId/stats
 */
export const getGameStats = async (req, res, next) => {
    try {
        const { gameId } = req.params;

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const cardTotalRepo = AppDataSource.getRepository(GameCardTotalEntity);

        // Get game
        const game = await gameRepo.findOne({ where: { game_id: gameId } });
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get all bet slips for this game
        const allBetSlips = await betSlipRepo.find({
            where: { game_id: gameId }
        });

        // Get cancelled slip IDs for this game
        const walletLogRepo = AppDataSource.getRepository("WalletLog");
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

        // Calculate statistics (excluding cancelled slips)
        const totalSlips = betSlips.length;
        let totalBetAmount = 0;
        let totalPayoutAmount = 0;
        let pendingCount = 0;
        let wonCount = 0;
        let lostCount = 0;

        betSlips.forEach(slip => {
            totalBetAmount += parseFloat(slip.total_amount || 0);
            totalPayoutAmount += parseFloat(slip.payout_amount || 0);
            
            if (slip.status === 'pending') pendingCount++;
            else if (slip.status === 'won') wonCount++;
            else if (slip.status === 'lost') lostCount++;
        });

        // Get card totals
        const cardTotals = await cardTotalRepo.find({
            where: { game_id: gameId },
            order: { card_number: 'ASC' }
        });

        const profit = totalBetAmount - totalPayoutAmount;

        return res.status(200).json({
            success: true,
            data: {
                game: {
                    id: game.id,
                    game_id: game.game_id,
                    start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
                    end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
                    status: game.status,
                    winning_card: game.winning_card,
                    payout_multiplier: parseFloat(game.payout_multiplier || 0),
                    settlement_status: game.settlement_status
                },
                statistics: {
                    total_slips: totalSlips,
                    total_wagered: totalBetAmount,
                    total_payout: totalPayoutAmount,
                    profit: profit,
                    slip_breakdown: {
                        pending: pendingCount,
                        won: wonCount,
                        lost: lostCount
                    }
                },
                card_totals: cardTotals.map(ct => ({
                    card_number: ct.card_number,
                    total_bet_amount: parseFloat(ct.total_bet_amount || 0)
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error getting game stats:', error);
        next(error);
    }
};

/**
 * Get all bets for a specific game
 * GET /api/admin/games/:gameId/bets
 */
export const getGameBets = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const userRepo = AppDataSource.getRepository(UserEntity);

        // Verify game exists
        const game = await gameRepo.findOne({ where: { game_id: gameId } });
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Get bet slips with pagination
        const queryBuilder = betSlipRepo
            .createQueryBuilder('slip')
            .where('slip.game_id = :gameId', { gameId })
            .orderBy('slip.created_at', 'DESC');

        const total = await queryBuilder.getCount();
        const betSlips = await queryBuilder
            .skip(skip)
            .take(parseInt(limit))
            .getMany();

        // Get bet details and user info for each slip
        const slipsWithDetails = await Promise.all(
            betSlips.map(async (slip) => {
                const betDetails = await betDetailRepo.find({
                    where: { slip_id: slip.id },
                    order: { card_number: 'ASC' }
                });

                // Get user info (mask sensitive data)
                const user = await userRepo.findOne({ where: { id: slip.user_id } });
                const userInfo = user ? {
                    id: user.id,
                    user_id: user.user_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    // Don't expose email, mobile, or other sensitive data
                } : null;

                return {
                    slip_id: slip.slip_id,
                    barcode: slip.barcode,
                    user: userInfo,
                    total_amount: parseFloat(slip.total_amount || 0),
                    payout_amount: parseFloat(slip.payout_amount || 0),
                    status: slip.status,
                    claimed: slip.claimed || false,
                    claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                    created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                    bets: betDetails.map(bd => ({
                        card_number: bd.card_number,
                        bet_amount: parseFloat(bd.bet_amount || 0),
                        is_winner: bd.is_winner || false,
                        payout_amount: parseFloat(bd.payout_amount || 0)
                    }))
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: slipsWithDetails,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                hasNextPage: skip + parseInt(limit) < total,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('❌ Error getting game bets:', error);
        next(error);
    }
};

/**
 * Get settlement report for a game
 * GET /api/admin/games/:gameId/settlement-report
 */
export const getSettlementReport = async (req, res, next) => {
    try {
        const { gameId } = req.params;

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);

        // Get game
        const game = await gameRepo.findOne({ where: { game_id: gameId } });
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        if (game.settlement_status !== 'settled') {
            return res.status(400).json({
                success: false,
                message: `Game is not settled. Current status: ${game.settlement_status}`
            });
        }

        // Get all winning slips
        const winningSlips = await betSlipRepo.find({
            where: {
                game_id: gameId,
                status: 'won'
            },
            order: { payout_amount: 'DESC' }
        });

        // Calculate claim summary
        let claimedCount = 0;
        let unclaimedCount = 0;
        let totalClaimedAmount = 0;
        let totalUnclaimedAmount = 0;

        winningSlips.forEach(slip => {
            const payout = parseFloat(slip.payout_amount || 0);
            if (slip.claimed) {
                claimedCount++;
                totalClaimedAmount += payout;
            } else {
                unclaimedCount++;
                totalUnclaimedAmount += payout;
            }
        });

        // Get bet details for winning slips
        const winningSlipsWithDetails = await Promise.all(
            winningSlips.map(async (slip) => {
                const betDetails = await betDetailRepo.find({
                    where: { slip_id: slip.id },
                    order: { card_number: 'ASC' }
                });

                return {
                    slip_id: slip.slip_id,
                    barcode: slip.barcode,
                    user_id: slip.user_id,
                    total_amount: parseFloat(slip.total_amount || 0),
                    payout_amount: parseFloat(slip.payout_amount || 0),
                    claimed: slip.claimed || false,
                    claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null,
                    created_at: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
                    winning_bets: betDetails
                        .filter(bd => bd.is_winner)
                        .map(bd => ({
                            card_number: bd.card_number,
                            bet_amount: parseFloat(bd.bet_amount || 0),
                            payout_amount: parseFloat(bd.payout_amount || 0)
                        }))
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: {
                game: {
                    game_id: game.game_id,
                    start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
                    end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
                    winning_card: game.winning_card,
                    payout_multiplier: parseFloat(game.payout_multiplier || 0),
                    settlement_status: game.settlement_status,
                    settlement_completed_at: game.settlement_completed_at ? formatIST(game.settlement_completed_at, 'yyyy-MM-dd HH:mm:ss') : null
                },
                summary: {
                    total_winning_slips: winningSlips.length,
                    total_payout: parseFloat(game.winning_card ? winningSlips.reduce((sum, s) => sum + parseFloat(s.payout_amount || 0), 0) : 0),
                    claim_summary: {
                        claimed: {
                            count: claimedCount,
                            amount: totalClaimedAmount
                        },
                        unclaimed: {
                            count: unclaimedCount,
                            amount: totalUnclaimedAmount
                        }
                    }
                },
                winning_slips: winningSlipsWithDetails
            }
        });

    } catch (error) {
        console.error('❌ Error getting settlement report:', error);
        next(error);
    }
};

/**
 * Get settlement decision data (for manual settlement screen)
 * Shows payout and profit/loss projections for each card
 * GET /api/admin/games/:gameId/settlement-decision
 */
export const getSettlementDecisionData = async (req, res, next) => {
    try {
        const { gameId } = req.params;

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);

        // Get game
        const game = await gameRepo.findOne({ where: { game_id: gameId } });
        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Validate game can be settled
        if (game.settlement_status !== 'not_settled') {
            return res.status(400).json({
                success: false,
                message: `Game is already ${game.settlement_status}. Cannot prepare settlement decision.`
            });
        }
        
        // In manual mode, allow viewing settlement data for active games
        // In auto mode, only allow for completed games
        // This check is informational only - actual settlement validation is in settlementService
        const gameResultType = await getSetting('game_result_type', 'manual');
        const allowedStatuses = gameResultType === 'manual' 
            ? ['active', 'completed']
            : ['completed'];
            
        if (!allowedStatuses.includes(game.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot prepare settlement decision. Game status: ${game.status}, Mode: ${gameResultType}`
            });
        }

        // Get all bet slips for this game
        const allBetSlips = await betSlipRepo.find({
            where: { game_id: gameId }
        });
        
        // Get cancelled slip IDs for this game
        const walletLogRepo = AppDataSource.getRepository("WalletLog");
        const cancelledSlipUuids = new Set();
        const cancelledSlipDbIds = new Set();
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
                    cancelledSlipUuids.add(log.reference_id);
                }
            });
            // Map cancelled UUIDs to database IDs
            allBetSlips.forEach(slip => {
                if (cancelledSlipUuids.has(slip.slip_id)) {
                    cancelledSlipDbIds.add(slip.id);
                }
            });
        }
        
        // Filter out cancelled slips
        const betSlips = allBetSlips.filter(slip => !cancelledSlipUuids.has(slip.slip_id));
        
        // Get all bet details for this game
        const allBetDetails = await betDetailRepo.find({
            where: { game_id: gameId }
        });
        
        // Filter out bet details from cancelled slips
        const betDetails = allBetDetails.filter(bd => !cancelledSlipDbIds.has(bd.slip_id));
        
        // Calculate total wagered (excluding cancelled slips)
        const totalWagered = betSlips.reduce((sum, slip) => {
            return sum + parseFloat(slip.total_amount || 0);
        }, 0);

        // Get payout multiplier
        const multiplier = parseFloat(game.payout_multiplier || 10);

        // Calculate for each card (1-12) what would happen if it wins
        const cardAnalysis = [];
        
        for (let card = 1; card <= 12; card++) {
            // Find all bets on this card (already filtered to exclude cancelled)
            const betsOnCard = betDetails.filter(bd => bd.card_number === card);
            
            // Calculate total bet amount on this card
            const totalBetOnCard = betsOnCard.reduce((sum, bet) => {
                return sum + parseFloat(bet.bet_amount || 0);
            }, 0);
            
            // Calculate total payout if this card wins
            const totalPayout = totalBetOnCard * multiplier;
            
            // Calculate profit/loss
            // Profit = Total Wagered - Total Payout
            const profit = totalWagered - totalPayout;
            const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
            
            // Count slips that would win (bet details are already filtered to exclude cancelled)
            const slipIdsWithThisCard = new Set(betsOnCard.map(bd => bd.slip_id));
            const winningSlipsCount = slipIdsWithThisCard.size;
            const losingSlipsCount = betSlips.length - winningSlipsCount;

            cardAnalysis.push({
                card_number: card,
                total_bet_amount: totalBetOnCard,
                total_payout: totalPayout,
                profit: profit,
                profit_percentage: profitPercentage,
                winning_slips_count: winningSlipsCount,
                losing_slips_count: losingSlipsCount,
                bets_count: betsOnCard.length
            });
        }

        // Sort by profit (descending) to show most profitable first
        cardAnalysis.sort((a, b) => b.profit - a.profit);

        return res.status(200).json({
            success: true,
            data: {
                game: {
                    game_id: game.game_id,
                    start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
                    end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
                    status: game.status,
                    payout_multiplier: multiplier,
                    settlement_status: game.settlement_status
                },
                summary: {
                    total_wagered: totalWagered,
                    total_slips: betSlips.length,
                    total_bets: betDetails.length
                },
                card_analysis: cardAnalysis
            }
        });

    } catch (error) {
        console.error('❌ Error getting settlement decision data:', error);
        next(error);
    }
};

/**
 * Declare result and settle game
 * POST /api/admin/games/:gameId/settle
 */
export const declareResultAndSettle = async (req, res, next) => {
    try {
        const { gameId } = req.params;
        const { winning_card } = req.body;
        const adminId = req.user?.id || 1;

        if (!winning_card || !Number.isInteger(winning_card) || winning_card < 1 || winning_card > 12) {
            return res.status(400).json({
                success: false,
                message: 'Valid winning card (1-12) is required'
            });
        }

        // Use settlement service
        const result = await settleGameService(gameId, winning_card, adminId);

        return res.status(200).json({
            success: true,
            message: 'Game settled successfully',
            data: result
        });

    } catch (error) {
        console.error('❌ Error settling game:', error);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        if (error.message.includes('not completed') ||
            error.message.includes('already') ||
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
 * Get live game settlement data
 * Returns current active/pending game with card betting stats, previous games history, and mode
 * GET /api/admin/games/live-settlement
 */
export const getLiveSettlementData = async (req, res, next) => {
    try {
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
        const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
        const userRepo = AppDataSource.getRepository(UserEntity);
        
        // Optional filter: user_id (number)
        const rawUserId = req.query.user_id;
        const selectedUserId = rawUserId ? parseInt(rawUserId, 10) : null;
        
        // Get game result type (auto/manual)
        const gameResultType = await getSetting('game_result_type', 'manual');
        
        // Get current time
        const now = new Date();
        
        // Priority: Show the most recent completed but un-settled game FIRST
        // This ensures we keep showing the completed game during the 10-second settlement window
        // Only show active/pending games if there's no completed un-settled game
        
        // First, check for completed but un-settled games (these take priority during settlement window)
        const completedUnsettledGame = await gameRepo
            .createQueryBuilder('game')
            .where('game.status = :completed', { completed: 'completed' })
            .andWhere('game.settlement_status = :notSettled', { notSettled: 'not_settled' })
            .orderBy('game.end_time', 'DESC')
            .getOne();
        
        // If there's a completed un-settled game, use it (even if there's a new active game)
        // This ensures the settlement window is respected
        let currentGame = completedUnsettledGame;
        
        // Only if no completed un-settled game exists, look for active/pending games
        if (!currentGame) {
            currentGame = await gameRepo
                .createQueryBuilder('game')
                .where('game.status IN (:...statuses)', { 
                    statuses: ['pending', 'active']
                })
                .orderBy('game.start_time', 'DESC')
                .getOne();
        }
        
        // Get last 10 settled games for history
        const recentGames = await gameRepo
            .createQueryBuilder('game')
            .where('game.settlement_status = :status', { status: 'settled' })
            .orderBy('game.end_time', 'DESC')
            .take(10)
            .getMany();
        
        const recentGamesHistory = recentGames.map(game => ({
            game_id: game.game_id,
            winning_card: game.winning_card,
            end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss')
        }));
        
        // Prepare current game data with card analysis
        // currentGame will only be non-null if it's pending, active, or completed but not settled
        let currentGameData = null;
        
        if (currentGame) {
            // Get all bet slips for current game
            const allBetSlips = await betSlipRepo.find({
                where: { game_id: currentGame.game_id }
            });
            
            // Get cancelled slip IDs for this game
            const walletLogRepo = AppDataSource.getRepository("WalletLog");
            const cancelledSlipUuids = new Set();
            const cancelledSlipDbIds = new Set();
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
                        cancelledSlipUuids.add(log.reference_id);
                    }
                });
                // Map cancelled UUIDs to database IDs
                allBetSlips.forEach(slip => {
                    if (cancelledSlipUuids.has(slip.slip_id)) {
                        cancelledSlipDbIds.add(slip.id);
                    }
                });
            }
            
            // Filter out cancelled slips
            let betSlips = allBetSlips.filter(slip => !cancelledSlipUuids.has(slip.slip_id));
            
            // Build list of users who have non-cancelled slips for this game
            const userIdsInGame = Array.from(new Set(betSlips.map(slip => slip.user_id)));
            const usersInGame = userIdsInGame.length > 0
                ? await userRepo.find({ where: { id: In(userIdsInGame) }, relations: ['roles'] })
                : [];
            const usersResponse = usersInGame.map(u => ({
                id: u.id,
                user_id: u.user_id,
                first_name: u.first_name,
                last_name: u.last_name,
                roles: Array.isArray(u.roles) ? u.roles.map(r => r.name) : []
            }));
            
            // Optional user filter
            if (selectedUserId && Number.isInteger(selectedUserId)) {
                betSlips = betSlips.filter(slip => slip.user_id === selectedUserId);
            }
            
            // Get all bet details for current game
            const allBetDetails = await betDetailRepo.find({
                where: { game_id: currentGame.game_id }
            });
            
            // Filter out bet details from cancelled slips
            let betDetails = allBetDetails.filter(bd => !cancelledSlipDbIds.has(bd.slip_id));
            
            // If filtering by user, restrict bet details to slips of that user
            if (selectedUserId && Number.isInteger(selectedUserId)) {
                const allowedSlipDbIds = new Set(betSlips.map(s => s.id));
                betDetails = betDetails.filter(bd => allowedSlipDbIds.has(bd.slip_id));
            }
            
            const totalWagered = betSlips.reduce((sum, slip) => {
                return sum + parseFloat(slip.total_amount || 0);
            }, 0);
            
            const multiplier = parseFloat(currentGame.payout_multiplier || 10);
            
            // Calculate betting stats for each card (1-12)
            const cardStats = [];
            for (let card = 1; card <= 12; card++) {
                // Bet details are already filtered to exclude cancelled slips
                const betsOnCard = betDetails.filter(bd => bd.card_number === card);
                const totalBetOnCard = betsOnCard.reduce((sum, bet) => {
                    return sum + parseFloat(bet.bet_amount || 0);
                }, 0);
                
                const totalPayout = totalBetOnCard * multiplier;
                const profit = totalWagered - totalPayout;
                const profitPercentage = totalWagered > 0 ? (profit / totalWagered) * 100 : 0;
                
                cardStats.push({
                    card_number: card,
                    total_bet_amount: totalBetOnCard,
                    total_payout: totalPayout,
                    profit: profit,
                    profit_percentage: profitPercentage,
                    bets_count: betsOnCard.length
                });
            }
            
            // Calculate time remaining
            const gameEndTime = new Date(currentGame.end_time);
            const timeRemaining = Math.max(0, gameEndTime.getTime() - now.getTime());
            const secondsRemaining = Math.floor(timeRemaining / 1000);
            
            // Check if game is completed and in settlement window (10 seconds after completion)
            const isCompleted = currentGame.status === 'completed';
            const timeSinceEnd = isCompleted ? now.getTime() - gameEndTime.getTime() : 0;
            
            // For completed un-settled games, always show them during the settlement window
            // The settlement window is 10 seconds from game end time
            // Even if more than 10 seconds have passed, keep showing it until settled (for manual mode)
            const isInSettlementWindow = isCompleted && 
                                         currentGame.settlement_status === 'not_settled';
            
            // Calculate remaining time in settlement window (10 seconds from end time)
            const settlementWindowRemaining = isInSettlementWindow 
                ? Math.max(0, 10000 - timeSinceEnd) 
                : 0;
            
            currentGameData = {
                game_id: currentGame.game_id,
                start_time: formatIST(currentGame.start_time, 'yyyy-MM-dd HH:mm:ss'),
                end_time: formatIST(currentGame.end_time, 'yyyy-MM-dd HH:mm:ss'),
                status: currentGame.status,
                settlement_status: currentGame.settlement_status,
                payout_multiplier: multiplier,
                total_wagered: totalWagered,
                total_slips: betSlips.length,
                card_stats: cardStats,
                time_remaining_seconds: secondsRemaining,
                is_completed: isCompleted,
                is_in_settlement_window: isInSettlementWindow,
                settlement_window_remaining_ms: settlementWindowRemaining
            };
            
            // Attach users list and current filter
            currentGameData.users = usersResponse;
            if (selectedUserId && Number.isInteger(selectedUserId)) {
                currentGameData.selected_user_id = selectedUserId;
            }
        }
        
        return res.status(200).json({
            success: true,
            data: {
                mode: gameResultType, // 'auto' or 'manual'
                current_game: currentGameData,
                recent_games: recentGamesHistory
            }
        });
        
    } catch (error) {
        console.error('❌ Error getting live settlement data:', error);
        next(error);
    }
};

