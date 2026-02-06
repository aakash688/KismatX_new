// Game Controller
// Handles game creation, management, and result declaration

import { AppDataSource } from "../config/typeorm.config.js";
import { auditLog } from "../utils/auditLogger.js";
import { getCurrentGame as getCurrentGameService, getGameById as getGameByIdService } from "../services/gameService.js";
import { settleGame as settleGameService } from "../services/settlementService.js";
import { formatIST } from "../utils/timezone.js";
import { In } from "typeorm";

const GameEntity = "Game";
const GameCardTotalEntity = "GameCardTotal";
const BetSlipEntity = "BetSlip";
const BetDetailEntity = "BetDetail";
const WalletLogEntity = "WalletLog";

/**
 * Generate game_id based on current time
 * Format: GAME_HH-MM (e.g., GAME_12-00, GAME_12-05)
 */
const generateGameId = (startTime) => {
  const hours = String(startTime.getHours()).padStart(2, '0');
  const minutes = String(startTime.getMinutes()).padStart(2, '0');
  return `GAME_${hours}-${minutes}`;
};

/**
 * Create a new game
 * POST /api/games/create
 */
export const createGame = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const cardTotalRepo = AppDataSource.getRepository(GameCardTotalEntity);
    
    const { payout_multiplier } = req.body;
    
    // Calculate start and end time
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 5 * 60 * 1000); // 5 minutes later
    
    const gameId = generateGameId(startTime);
    
    // Check if game already exists for this time slot
    const existingGame = await gameRepo.findOne({ where: { game_id: gameId } });
    if (existingGame) {
      return res.status(400).json({
        success: false,
        message: "Game already exists for this time slot",
      });
    }
    
    // Create new game
    const game = gameRepo.create({
      game_id: gameId,
      start_time: startTime,
      end_time: endTime,
      status: "pending",
      payout_multiplier: payout_multiplier || 10.00,
    });
    
    await gameRepo.save(game);
    
    // Initialize card totals for all 12 cards
    const cardTotals = [];
    for (let cardNumber = 1; cardNumber <= 12; cardNumber++) {
      const cardTotal = cardTotalRepo.create({
        game_id: gameId,
        card_number: cardNumber,
        total_bet_amount: 0.00,
      });
      cardTotals.push(cardTotal);
    }
    await cardTotalRepo.save(cardTotals);
    
    // Audit log
    await auditLog(
      req.user?.id,
      "CREATE_GAME",
      GameEntity,
      game.id,
      { game_id: gameId },
      req
    );
    
    res.status(201).json({
      success: true,
      message: "Game created successfully",
      data: {
        game_id: game.game_id,
        start_time: game.start_time,
        end_time: game.end_time,
        status: game.status,
        payout_multiplier: game.payout_multiplier,
      },
    });
  } catch (error) {
    console.error("❌ Error creating game:", error);
    next(error);
  }
};

/**
 * Get all games with filters
 * GET /api/games
 */
export const getAllGames = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const { status, page = 1, limit = 20 } = req.query;
    
    const queryBuilder = gameRepo.createQueryBuilder("game");
    
    // Filter by status
    if (status) {
      queryBuilder.where("game.status = :status", { status });
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);
    
    // Order by created_at desc
    queryBuilder.orderBy("game.created_at", "DESC");
    
    const [games, total] = await queryBuilder.getManyAndCount();
    
    res.json({
      success: true,
      data: games,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching games:", error);
    next(error);
  }
};

/**
 * Get game by ID with card totals
 * GET /api/games/:gameId
 */
export const getGameById = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    // Use service function
    const game = await getGameByIdService(gameId);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }
    
    return res.status(200).json({
      success: true,
      data: game
    });
  } catch (error) {
    console.error("❌ Error fetching game:", error);
    next(error);
  }
};

/**
 * Start a game (change status to active)
 * PUT /api/games/:gameId/start
 */
export const startGame = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const { gameId } = req.params;
    
    const game = await gameRepo.findOne({ where: { game_id: gameId } });
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }
    
    if (game.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot start game with status: ${game.status}`,
      });
    }
    
    game.status = "active";
    await gameRepo.save(game);
    
    // Audit log
    await auditLog(
      req.user?.id,
      "START_GAME",
      GameEntity,
      game.id,
      { game_id: gameId, status: "active" },
      req
    );
    
    res.json({
      success: true,
      message: "Game started successfully",
      data: game,
    });
  } catch (error) {
    console.error("❌ Error starting game:", error);
    next(error);
  }
};

/**
 * Declare result - set winning card and complete game
 * PUT /api/games/:gameId/result
 */
export const declareResult = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const { gameId } = req.params;
    const { winning_card } = req.body;
    
    // Validate winning card
    if (!winning_card || winning_card < 1 || winning_card > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid winning card. Must be between 1 and 12",
      });
    }
    
    const game = await gameRepo.findOne({ where: { game_id: gameId } });
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }
    
    if (game.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Game already completed",
      });
    }
    
    game.winning_card = winning_card;
    game.status = "completed";
    await gameRepo.save(game);
    
    // Audit log
    await auditLog(
      req.user?.id,
      "DECLARE_RESULT",
      GameEntity,
      game.id,
      { game_id: gameId, winning_card },
      req
    );
    
    res.json({
      success: true,
      message: "Result declared successfully",
      data: {
        game_id: game.game_id,
        winning_card: game.winning_card,
        status: game.status,
      },
    });
  } catch (error) {
    console.error("❌ Error declaring result:", error);
    next(error);
  }
};

/**
 * Settle bets after result declaration
 * POST /api/games/:gameId/settle
 */
export const settleBets = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { winning_card } = req.body;
    const adminId = req.user?.id || 1; // Use admin ID from request or default to 1 (system)
    
    if (!winning_card || !Number.isInteger(winning_card) || winning_card < 1 || winning_card > 12) {
      return res.status(400).json({
        success: false,
        message: "Valid winning card (1-12) is required for settlement",
      });
    }
    
    // Use settlement service
    const result = await settleGameService(gameId, winning_card, adminId);
    
    return res.status(200).json({
      success: true,
      message: "Game settled successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Error settling game:", error);
    
    // Handle specific error types
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
 * Get current active game
 * GET /api/games/current
 */
export const getCurrentGame = async (req, res, next) => {
  try {
    // Use service function
    const game = await getCurrentGameService();
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "No active game found",
      });
    }
    
    return res.status(200).json({
      success: true,
      data: game
    });
  } catch (error) {
    console.error("❌ Error fetching current game:", error);
    next(error);
  }
};

/**
 * Get game statistics
 * GET /api/games/:gameId/stats
 */
export const getGameStats = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
    const cardTotalRepo = AppDataSource.getRepository(GameCardTotalEntity);
    const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
    
    const { gameId } = req.params;
    
    const game = await gameRepo.findOne({ where: { game_id: gameId } });
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }
    
    // Get all bet slips for this game
    const allSlips = await betSlipRepo.find({
      where: { game_id: gameId },
    });
    
    // Get cancelled slip IDs for this game
    const cancelledSlipIds = new Set();
    if (allSlips.length > 0) {
      const slipIds = allSlips.map(slip => slip.slip_id);
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
    const slips = allSlips.filter(slip => !cancelledSlipIds.has(slip.slip_id));
    const totalSlips = slips.length;
    
    const totalBetAmount = slips.reduce((sum, slip) => sum + parseFloat(slip.total_amount || 0), 0);
    const totalPayoutAmount = slips.reduce((sum, slip) => sum + parseFloat(slip.payout_amount || 0), 0);
    
    // Get card totals (these should already exclude cancelled amounts, but we'll use them as-is)
    const cardTotals = await cardTotalRepo.find({
      where: { game_id: gameId },
      order: { card_number: "ASC" },
    });
    
    res.json({
      success: true,
      data: {
        game_id: gameId,
        status: game.status,
        winning_card: game.winning_card,
        total_slips: totalSlips,
        total_bet_amount: totalBetAmount,
        total_payout_amount: totalPayoutAmount,
        profit: totalBetAmount - totalPayoutAmount,
        card_totals: cardTotals,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching game stats:", error);
    next(error);
  }
};

/**
 * Get last 10 games results with winning cards
 * GET /api/games/recent-winners
 */
export const getRecentWinners = async (req, res, next) => {
  try {
    const gameRepo = AppDataSource.getRepository(GameEntity);
    
    // Get last 10 settled games with winning cards (not null)
    const games = await gameRepo
      .createQueryBuilder('game')
      .select(['game.game_id', 'game.winning_card', 'game.start_time'])
      .where('game.settlement_status = :status', { status: 'settled' })
      .andWhere('game.winning_card IS NOT NULL')
      .orderBy('game.end_time', 'DESC')
      .take(10)
      .getMany();
    
    // Format response - only game_id and winning_card
    const results = games.map(game => ({
      game_id: game.game_id,
      game_time: game.start_time,
      winning_card: game.winning_card
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        count: results.length,
        games: results
      }
    });
    
  } catch (error) {
    console.error("❌ Error fetching recent winners:", error);
    next(error);
  }
};

/**
 * Get date-wise game card winning details
 * GET /api/games/by-date?date=YYYY-MM-DD
 * Returns all settled games for a specific date with winning card information
 */
export const getGamesByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required (format: YYYY-MM-DD)"
      });
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD format (e.g., 2024-11-05)"
      });
    }
    
    const gameRepo = AppDataSource.getRepository(GameEntity);
    
    // Parse date and create date range (00:00:00 to 23:59:59 IST)
    // Since dates from query are treated as IST, we need to handle this properly
    const startDate = new Date(date + 'T00:00:00');
    const endDate = new Date(date + 'T23:59:59');
    
    // Get all settled games for this date with winning cards (ordered by latest first)
    const games = await gameRepo
      .createQueryBuilder('game')
      .where('game.settlement_status = :status', { status: 'settled' })
      .andWhere('game.winning_card IS NOT NULL')
      .andWhere('game.start_time >= :startDate', { startDate })
      .andWhere('game.start_time <= :endDate', { endDate })
      .orderBy('game.start_time', 'DESC')
      .getMany();
    
    // Format response with game details
    const results = games.map(game => ({
      game_id: game.game_id,
      game_start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
      game_end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
      winning_card: game.winning_card,
      payout_multiplier: parseFloat(game.payout_multiplier || 10),
      settlement_completed_at: game.settlement_completed_at 
        ? formatIST(game.settlement_completed_at, 'yyyy-MM-dd HH:mm:ss') 
        : null
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        date: date,
        total_games: results.length,
        games: results
      }
    });
    
  } catch (error) {
    console.error("❌ Error fetching games by date:", error);
    next(error);
  }
};

/**
 * Get previous games by date with user's bet slips
 * GET /api/games/previousgames/by-date?date=YYYY-MM-DD
 * Returns all games for a specific date with the logged-in user's bet slips
 */
export const getPreviousGamesByDate = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { date } = req.query;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required (format: YYYY-MM-DD)"
      });
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD format (e.g., 2025-11-05)"
      });
    }
    
    const gameRepo = AppDataSource.getRepository(GameEntity);
    const betSlipRepo = AppDataSource.getRepository(BetSlipEntity);
    const betDetailRepo = AppDataSource.getRepository(BetDetailEntity);
    const walletLogRepo = AppDataSource.getRepository(WalletLogEntity);
    
    // Parse date and create date range (00:00:00 to 23:59:59)
    const startDate = new Date(date + 'T00:00:00');
    const endDate = new Date(date + 'T23:59:59');
    
    // Get all games for this date (ordered by start time)
    const games = await gameRepo
      .createQueryBuilder('game')
      .where('game.start_time >= :startDate', { startDate })
      .andWhere('game.start_time <= :endDate', { endDate })
      .orderBy('game.start_time', 'ASC')
      .getMany();
    
    // Process each game and get user's bet slips
    const gamesWithSlipsPromises = games.map(async (game) => {
      // Get all bet slips for this user and this game
      const betSlips = await betSlipRepo.find({
        where: {
          user_id: userId,
          game_id: game.game_id
        },
        order: { created_at: 'ASC' }
      });
      
      // Skip games where user has no slips
      if (betSlips.length === 0) {
        return null;
      }
      
      // Process each slip
      const slipsData = await Promise.all(
        betSlips.map(async (slip) => {
          // Check if slip was cancelled
          const cancellationLog = await walletLogRepo.findOne({
            where: {
              reference_type: 'cancellation',
              reference_id: slip.slip_id
            }
          });
          
          const isCancelled = !!cancellationLog;
          
          // Get bet details to count cards
          const betDetails = await betDetailRepo.find({
            where: { slip_id: slip.id }
          });
          
          // Determine status
          let status = slip.status;
          if (isCancelled) {
            status = 'cancelled';
          } else if (slip.status === 'won') {
            status = 'won';
          } else if (slip.status === 'lost') {
            status = 'lost';
          } else {
            status = 'pending';
          }
          
          const slipData = {
            cards: betDetails.length,
            amount: parseFloat(slip.total_amount || 0),
            win_points: slip.claimed ? parseFloat(slip.payout_amount || 0) : 0,
            barcode: slip.barcode,
            issue_date_time: formatIST(slip.created_at, 'yyyy-MM-dd HH:mm:ss'),
            status: status,
            is_cancelled: isCancelled,
            claim_status: slip.claimed || false,
            claimed_at: slip.claimed_at ? formatIST(slip.claimed_at, 'yyyy-MM-dd HH:mm:ss') : null
          };
          
          return slipData;
        })
      );
      
      // Format game start and end times as "YYYY-MM-DD HH:MM"
      const startTimeStr = formatIST(game.start_time, 'yyyy-MM-dd HH:mm');
      const endTimeStr = formatIST(game.end_time, 'yyyy-MM-dd HH:mm');
      
      return {
        id: game.game_id,
        start: startTimeStr,
        end: endTimeStr,
        slips: slipsData
      };
    });
    
    const gamesWithSlips = (await Promise.all(gamesWithSlipsPromises)).filter(game => game !== null);
    
    return res.status(200).json({
      success: true,
      data: {
        game_date: date,
        games: gamesWithSlips
      }
    });
    
  } catch (error) {
    console.error("❌ Error fetching previous games by date:", error);
    next(error);
  }
};


