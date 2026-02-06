/**
 * Game Service
 * Handles game lifecycle management and queries
 * 
 * @module services/gameService
 */

import { AppDataSource } from '../config/typeorm.config.js';
import { getSetting, getSettingAsNumber } from '../utils/settings.js';
import { toUTC, toIST, parseTimeString, formatIST } from '../utils/timezone.js';

const GameEntity = "Game";
const GameCardTotalEntity = "GameCardTotal";

/**
 * Create all games for current day
 * Called by: Cron job at 07:55 IST
 * 
 * @returns {Promise<{success: boolean, gamesCreated: number, message: string}>}
 */
export async function createDailyGames() {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // Get settings
        const gameStartTime = await getSetting('game_start_time', '08:00');
        const gameEndTime = await getSetting('game_end_time', '22:00');
        const payoutMultiplier = await getSettingAsNumber('game_multiplier', 10);

        // Parse start and end times
        const startTimeObj = parseTimeString(gameStartTime);
        const endTimeObj = parseTimeString(gameEndTime);

        // Get current date in IST
        const now = new Date();
        const istYear = now.getFullYear();
        const istMonth = now.getMonth();
        const istDate = now.getDate();

        // Calculate all 5-minute intervals for the day
        const games = [];
        const gameDate = new Date(istYear, istMonth, istDate, startTimeObj.hours, startTimeObj.minutes, 0);

        // Calculate end datetime
        const endDateTime = new Date(istYear, istMonth, istDate, endTimeObj.hours, endTimeObj.minutes, 0);

        // Generate games in 5-minute intervals
        let currentTime = new Date(gameDate);
        let gameIndex = 0;

        while (currentTime < endDateTime) {
            // Create game end time (5 minutes after start)
            const gameEndTime = new Date(currentTime);
            gameEndTime.setMinutes(gameEndTime.getMinutes() + 5);

            // Generate game_id in format YYYYMMDDHHMM
            const gameId = formatIST(currentTime, 'yyyyMMddHHmm');

            // Convert times to UTC for storage
            const startTimeUTC = toUTC(currentTime);
            const endTimeUTC = toUTC(gameEndTime);

            games.push({
                game_id: gameId,
                start_time: startTimeUTC,
                end_time: endTimeUTC,
                status: 'pending',
                payout_multiplier: payoutMultiplier,
                settlement_status: 'not_settled',
                created_at: new Date(),
                updated_at: new Date()
            });

            // Move to next 5-minute interval
            currentTime.setMinutes(currentTime.getMinutes() + 5);
            gameIndex++;
        }

        if (games.length === 0) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                gamesCreated: 0,
                message: 'No games to create (invalid time range)'
            };
        }

        // Bulk insert games with duplicate check
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        
        // Insert games one by one with duplicate check
        // This is safer than raw SQL and handles TypeORM correctly
        let insertedCount = 0;
        for (const gameData of games) {
            const existing = await gameRepo.findOne({ where: { game_id: gameData.game_id } });
            if (!existing) {
                const game = gameRepo.create(gameData);
                await gameRepo.save(game);
                insertedCount++;
            }
        }

        await queryRunner.commitTransaction();

        console.log(`✅ Created ${insertedCount} games (${games.length - insertedCount} duplicates skipped) for ${formatIST(new Date(), 'yyyy-MM-dd')}`);

        return {
            success: true,
            gamesCreated: insertedCount,
            duplicatesSkipped: games.length - insertedCount,
            message: `Successfully created ${insertedCount} games for today`,
            firstGameId: games[0]?.game_id,
            lastGameId: games[games.length - 1]?.game_id
        };

    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('❌ Error creating daily games:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Activate pending games when start_time arrives
 * Called by: Cron job every minute
 * 
 * @returns {Promise<{activated: number, gameIds: string[]}>}
 */
export async function activatePendingGames() {
    try {
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const now = new Date();

        // Find games that should be activated
        const gamesToActivate = await gameRepo
            .createQueryBuilder('game')
            .where('game.status = :status', { status: 'pending' })
            .andWhere('game.start_time <= :now', { now })
            .getMany();

        if (gamesToActivate.length === 0) {
            return { activated: 0, gameIds: [] };
        }

        // Update status to active
        const gameIds = gamesToActivate.map(g => g.game_id);
        await gameRepo
            .createQueryBuilder()
            .update(GameEntity)
            .set({ status: 'active' })
            .where('game_id IN (:...gameIds)', { gameIds })
            .execute();

        console.log(`✅ Activated ${gamesToActivate.length} games: ${gameIds.join(', ')}`);

        return {
            activated: gamesToActivate.length,
            gameIds
        };

    } catch (error) {
        console.error('❌ Error activating games:', error);
        throw error;
    }
}

/**
 * Create next game (for 5-minute interval scheduler)
 * Called by: Cron job every 5 minutes
 * Creates a game that starts immediately and ends 5 minutes later
 * 
 * @returns {Promise<{success: boolean, game_id: string, status: string, message: string}>}
 */
export async function createNextGame() {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // Get settings
        const payoutMultiplier = await getSettingAsNumber('game_multiplier', 10);
        const gameStartTime = await getSetting('game_start_time', '08:00');
        const gameEndTime = await getSetting('game_end_time', '22:00');

        // Get current time in IST
        const now = new Date();
        const istNow = toIST(now);
        const currentHour = istNow.getHours();
        const currentMinute = istNow.getMinutes();

        // Parse game time limits
        const startTimeObj = parseTimeString(gameStartTime);
        const endTimeObj = parseTimeString(gameEndTime);

        // Check if current time is within game hours
        const currentMinutes = currentHour * 60 + currentMinute;
        const startMinutes = startTimeObj.hours * 60 + startTimeObj.minutes;
        const endMinutes = endTimeObj.hours * 60 + endTimeObj.minutes;

        if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: `Outside game hours (${gameStartTime} - ${gameEndTime})`
            };
        }

        // Round current time to next 5-minute interval
        const roundedMinutes = Math.ceil(currentMinute / 5) * 5;
        let gameStartIST = new Date(istNow);
        gameStartIST.setMinutes(roundedMinutes, 0, 0);
        
        // If rounded time is in the next hour, adjust
        if (roundedMinutes >= 60) {
            gameStartIST.setHours(gameStartIST.getHours() + 1);
            gameStartIST.setMinutes(0, 0, 0);
        }

        // Check if game start is still within game hours
        const gameStartMinutes = gameStartIST.getHours() * 60 + gameStartIST.getMinutes();
        if (gameStartMinutes >= endMinutes) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Next game start time would be outside game hours'
            };
        }

        // Create game end time (5 minutes after start)
        const gameEndIST = new Date(gameStartIST);
        gameEndIST.setMinutes(gameEndIST.getMinutes() + 5);

        // Generate game_id in format YYYYMMDDHHMM
        const gameId = formatIST(gameStartIST, 'yyyyMMddHHmm');

        // Convert times to UTC for storage
        const startTimeUTC = toUTC(gameStartIST);
        const endTimeUTC = toUTC(gameEndIST);

        // Check if game already exists
        const gameRepo = queryRunner.manager.getRepository(GameEntity);
        const existingGame = await gameRepo.findOne({ where: { game_id: gameId } });
        
        if (existingGame) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                game_id: gameId,
                status: existingGame.status,
                message: 'Game already exists'
            };
        }

        // Determine if game should start immediately or be pending
        // If start time is within 1 minute of now, activate immediately
        const timeUntilStart = gameStartIST.getTime() - istNow.getTime();
        const shouldActivateNow = timeUntilStart <= 60000; // 1 minute threshold

        // Create game
        const game = gameRepo.create({
            game_id: gameId,
            start_time: startTimeUTC,
            end_time: endTimeUTC,
            status: shouldActivateNow ? 'active' : 'pending',
            payout_multiplier: payoutMultiplier,
            settlement_status: 'not_settled',
            created_at: new Date(),
            updated_at: new Date()
        });

        await gameRepo.save(game);
        await queryRunner.commitTransaction();

        console.log(`✅ Created game ${gameId} (Status: ${game.status}, Start: ${formatIST(gameStartIST, 'HH:mm')}, End: ${formatIST(gameEndIST, 'HH:mm')})`);

        return {
            success: true,
            game_id: gameId,
            status: game.status,
            start_time: formatIST(gameStartIST, 'yyyy-MM-dd HH:mm:ss'),
            end_time: formatIST(gameEndIST, 'yyyy-MM-dd HH:mm:ss'),
            message: `Game ${gameId} created successfully (${game.status})`
        };

    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('❌ Error creating next game:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Complete active games when end_time passes
 * Called by: Cron job every minute
 * 
 * @returns {Promise<{completed: number, gameIds: string[]}>}
 */
export async function completeActiveGames() {
    try {
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const now = new Date();

        // Find games that should be completed
        const gamesToComplete = await gameRepo
            .createQueryBuilder('game')
            .where('game.status = :status', { status: 'active' })
            .andWhere('game.end_time <= :now', { now })
            .getMany();

        if (gamesToComplete.length === 0) {
            return { completed: 0, gameIds: [] };
        }

        // Update status to completed
        const gameIds = gamesToComplete.map(g => g.game_id);
        await gameRepo
            .createQueryBuilder()
            .update(GameEntity)
            .set({ status: 'completed' })
            .where('game_id IN (:...gameIds)', { gameIds })
            .execute();

        console.log(`✅ Completed ${gamesToComplete.length} games: ${gameIds.join(', ')}`);

        return {
            completed: gamesToComplete.length,
            gameIds
        };

    } catch (error) {
        console.error('❌ Error completing games:', error);
        throw error;
    }
}

/**
 * Get currently active game
 * Called by: Public API endpoint
 * 
 * @returns {Promise<Object|null>} Active game or null
 */
export async function getCurrentGame() {
    try {
        const gameRepo = AppDataSource.getRepository(GameEntity);
        const now = new Date();

        // Find active game where current time is between start and end
        const game = await gameRepo
            .createQueryBuilder('game')
            .where('game.status = :status', { status: 'active' })
            .andWhere('game.start_time <= :now', { now })
            .andWhere('game.end_time > :now', { now })
            .orderBy('game.start_time', 'DESC')
            .getOne();

        if (!game) {
            return null;
        }

        // Get card totals for this game
        const cardTotalRepo = AppDataSource.getRepository(GameCardTotalEntity);
        const cardTotals = await cardTotalRepo.find({
            where: { game_id: game.game_id },
            order: { card_number: 'ASC' }
        });

        // Format response
        return {
            game_id: game.game_id,
            start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
            end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
            payout_multiplier: parseFloat(game.payout_multiplier),
            status: game.status,
            card_totals: cardTotals.map(ct => ({
                card_number: ct.card_number,
                total_bet_amount: parseFloat(ct.total_bet_amount || 0)
            })),
            server_time: formatIST(new Date(), 'yyyy-MM-dd HH:mm:ss')
        };

    } catch (error) {
        console.error('❌ Error getting current game:', error);
        throw error;
    }
}

/**
 * Get game by ID
 * Called by: Public API, admin panel
 * 
 * @param {string} gameId - Game ID in format YYYYMMDDHHMM
 * @returns {Promise<Object|null>} Game object or null
 */
export async function getGameById(gameId) {
    try {
        if (!gameId || typeof gameId !== 'string') {
            throw new Error('Game ID is required');
        }

        const gameRepo = AppDataSource.getRepository(GameEntity);
        const game = await gameRepo.findOne({
            where: { game_id: gameId }
        });

        if (!game) {
            return null;
        }

        // Get card totals
        const cardTotalRepo = AppDataSource.getRepository(GameCardTotalEntity);
        const cardTotals = await cardTotalRepo.find({
            where: { game_id: game.game_id },
            order: { card_number: 'ASC' }
        });

        // Format response
        return {
            id: game.id,
            game_id: game.game_id,
            start_time: formatIST(game.start_time, 'yyyy-MM-dd HH:mm:ss'),
            end_time: formatIST(game.end_time, 'yyyy-MM-dd HH:mm:ss'),
            status: game.status,
            winning_card: game.winning_card,
            payout_multiplier: parseFloat(game.payout_multiplier),
            settlement_status: game.settlement_status,
            settlement_started_at: game.settlement_started_at ? formatIST(game.settlement_started_at, 'yyyy-MM-dd HH:mm:ss') : null,
            settlement_completed_at: game.settlement_completed_at ? formatIST(game.settlement_completed_at, 'yyyy-MM-dd HH:mm:ss') : null,
            settlement_error: game.settlement_error,
            created_at: formatIST(game.created_at, 'yyyy-MM-dd HH:mm:ss'),
            updated_at: formatIST(game.updated_at, 'yyyy-MM-dd HH:mm:ss'),
            card_totals: cardTotals.map(ct => ({
                card_number: ct.card_number,
                total_bet_amount: parseFloat(ct.total_bet_amount || 0)
            }))
        };

    } catch (error) {
        console.error(`❌ Error getting game ${gameId}:`, error);
        throw error;
    }
}

