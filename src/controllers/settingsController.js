// Settings Controller
// Handles game settings management (multiplier, limits, times, result type)

import { AppDataSource } from "../config/typeorm.config.js";
import { auditLog } from "../utils/auditLogger.js";
import { clearSettingsCache } from "../utils/settings.js";

const SettingsEntity = "Settings";
const SettingsLogEntity = "SettingsLog";
const UserEntity = "User";

/**
 * Get all settings
 * GET /api/admin/settings
 */
export const getSettings = async (req, res, next) => {
    try {
        console.log('⚙️ Fetching settings...');
        const settingsRepo = AppDataSource.getRepository(SettingsEntity);
        
        const allSettings = await settingsRepo.find({
            order: { key: "ASC" }
        });

        // Convert array to object for easier frontend access
        const settingsObject = {};
        allSettings.forEach(setting => {
            settingsObject[setting.key] = setting.value;
        });

        // Set defaults if settings don't exist
        const defaultSettings = {
            game_multiplier: settingsObject.game_multiplier || "10",
            maximum_limit: settingsObject.maximum_limit || "5000",
            game_start_time: settingsObject.game_start_time || "08:00",
            game_end_time: settingsObject.game_end_time || "22:00",
            game_result_type: settingsObject.game_result_type || "manual"
        };

        res.json({
            settings: defaultSettings,
            raw: settingsObject
        });

    } catch (err) {
        console.error('❌ Get settings error:', err);
        next(err);
    }
};

/**
 * Update settings
 * PUT /api/admin/settings
 */
export const updateSettings = async (req, res, next) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const {
            game_multiplier,
            maximum_limit,
            game_start_time,
            game_end_time,
            game_result_type
        } = req.body;

        console.log('⚙️ Updating settings:', {
            game_multiplier,
            maximum_limit,
            game_start_time,
            game_end_time,
            game_result_type
        });

        const settingsRepo = queryRunner.manager.getRepository(SettingsEntity);

        // Validate inputs
        if (game_multiplier !== undefined) {
            const multiplier = parseFloat(game_multiplier);
            if (isNaN(multiplier) || multiplier <= 0) {
                await queryRunner.rollbackTransaction();
                return res.status(400).json({
                    message: "Game multiplier must be a positive number"
                });
            }
        }

        if (maximum_limit !== undefined) {
            const limit = parseFloat(maximum_limit);
            if (isNaN(limit) || limit <= 0) {
                await queryRunner.rollbackTransaction();
                return res.status(400).json({
                    message: "Maximum limit must be a positive number"
                });
            }
        }

        if (game_start_time !== undefined && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(game_start_time)) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({
                message: "Game start time must be in HH:MM format (e.g., 09:00)"
            });
        }

        if (game_end_time !== undefined && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(game_end_time)) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({
                message: "Game end time must be in HH:MM format (e.g., 23:00)"
            });
        }

        if (game_result_type !== undefined && !["auto", "manual"].includes(game_result_type)) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({
                message: "Game result type must be 'auto' or 'manual'"
            });
        }

        // Get admin user info for logging
        const userRepo = queryRunner.manager.getRepository(UserEntity);
        const adminUser = await userRepo.findOne({ where: { id: req.user?.id } });

        // Update or create each setting and log changes
        const settingsToUpdate = [
            { key: 'game_multiplier', value: game_multiplier, description: 'Multiplier for winnings or scoring' },
            { key: 'maximum_limit', value: maximum_limit, description: 'Maximum bet, stake, or points allowed per game' },
            { key: 'game_start_time', value: game_start_time, description: 'When the game opens (HH:MM format)' },
            { key: 'game_end_time', value: game_end_time, description: 'When the game closes (HH:MM format)' },
            { key: 'game_result_type', value: game_result_type, description: 'Auto-generated or manually set game results' }
        ];

        const settingsLogRepo = queryRunner.manager.getRepository(SettingsLogEntity);
        const updatedSettings = {};

        for (const setting of settingsToUpdate) {
            if (setting.value !== undefined) {
                const existing = await settingsRepo.findOne({ where: { key: setting.key } });
                const previousValue = existing ? existing.value : null;
                const newValue = String(setting.value);
                
                // Only log if value actually changed
                if (previousValue !== newValue) {
                    // Update or create setting
                    if (existing) {
                        existing.value = newValue;
                        existing.description = setting.description;
                        await settingsRepo.save(existing);
                    } else {
                        const newSetting = settingsRepo.create({
                            key: setting.key,
                            value: newValue,
                            description: setting.description
                        });
                        await settingsRepo.save(newSetting);
                    }
                    
                    // Log the change
                    const settingLog = settingsLogRepo.create({
                        setting_key: setting.key,
                        previous_value: previousValue,
                        new_value: newValue,
                        admin_id: req.user?.id,
                        admin_user_id: adminUser?.user_id || null,
                        ip_address: req.ip || null,
                        user_agent: req.get('User-Agent') || null
                    });
                    await settingsLogRepo.save(settingLog);
                    
                    updatedSettings[setting.key] = newValue;
                }
            }
        }

        // Log admin action to general audit log as well
        if (Object.keys(updatedSettings).length > 0) {
            await auditLog({
                admin_id: req.user?.id,
                action: "settings_updated",
                target_type: "settings",
                target_id: null,
                details: `Updated settings: ${JSON.stringify(updatedSettings)}`,
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });
            
            // Clear settings cache after update
            clearSettingsCache();
        }

        // Commit transaction
        await queryRunner.commitTransaction();

        console.log('✅ Settings updated successfully');

        res.json({
            message: "Settings updated successfully",
            settings: {
                game_multiplier: updatedSettings.game_multiplier || undefined,
                maximum_limit: updatedSettings.maximum_limit || undefined,
                game_start_time: updatedSettings.game_start_time || undefined,
                game_end_time: updatedSettings.game_end_time || undefined,
                game_result_type: updatedSettings.game_result_type || undefined
            }
        });

    } catch (err) {
        await queryRunner.rollbackTransaction();
        console.error('❌ Update settings error:', err);
        next(err);
    } finally {
        await queryRunner.release();
    }
};

/**
 * Get public settings (no authentication required)
 * GET /api/settings/public
 * Returns: game_multiplier, maximum_limit, game_start_time, game_end_time
 * Note: Does not include game_result_type (admin-only)
 */
export const getPublicSettings = async (req, res, next) => {
    try {
        console.log('⚙️ Fetching public settings...');
        const settingsRepo = AppDataSource.getRepository(SettingsEntity);
        
        const allSettings = await settingsRepo.find({
            order: { key: "ASC" }
        });

        // Convert array to object for easier access
        const settingsObject = {};
        allSettings.forEach(setting => {
            settingsObject[setting.key] = setting.value;
        });

        // Return only public settings (exclude game_result_type which is admin-only)
        const publicSettings = {
            game_multiplier: settingsObject.game_multiplier || "10",
            maximum_limit: settingsObject.maximum_limit || "5000",
            game_start_time: settingsObject.game_start_time || "08:00",
            game_end_time: settingsObject.game_end_time || "22:00"
        };

        res.json({
            success: true,
            data: publicSettings
        });

    } catch (err) {
        console.error('❌ Get public settings error:', err);
        next(err);
    }
};

/**
 * Get settings change history/logs
 * GET /api/admin/settings/logs
 */
export const getSettingsLogs = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            setting_key,
            admin_id,
            date_from,
            date_to,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        console.log('📋 Fetching settings logs...');

        const settingsLogRepo = AppDataSource.getRepository(SettingsLogEntity);
        const queryBuilder = settingsLogRepo.createQueryBuilder("settings_log")
            .leftJoinAndSelect("settings_log.admin", "admin")
            .select([
                "settings_log.id",
                "settings_log.setting_key",
                "settings_log.previous_value",
                "settings_log.new_value",
                "settings_log.admin_id",
                "settings_log.admin_user_id",
                "settings_log.ip_address",
                "settings_log.user_agent",
                "settings_log.created_at",
                "admin.user_id",
                "admin.first_name",
                "admin.last_name"
            ]);

        // Validate and apply sorting
        const validSortFields = ['created_at', 'setting_key', 'admin_id'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        queryBuilder.orderBy(`settings_log.${sortField}`, sortDirection);

        // Apply filters
        if (setting_key) {
            queryBuilder.andWhere("settings_log.setting_key = :setting_key", { setting_key });
        }

        if (admin_id) {
            queryBuilder.andWhere("settings_log.admin_id = :admin_id", { admin_id });
        }

        if (date_from) {
            queryBuilder.andWhere("settings_log.created_at >= :date_from", { date_from });
        }

        if (date_to) {
            queryBuilder.andWhere("settings_log.created_at <= :date_to", { date_to });
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        queryBuilder.skip(offset).take(parseInt(limit));

        const [logs, total] = await queryBuilder.getManyAndCount();

        res.json({
            logs: logs.map(log => ({
                id: log.id,
                setting_key: log.setting_key,
                previous_value: log.previous_value,
                new_value: log.new_value,
                admin_id: log.admin_id,
                admin_name: log.admin ? `${log.admin.first_name} ${log.admin.last_name}` : null,
                admin_user_id: log.admin_user_id,
                ip_address: log.ip_address,
                user_agent: log.user_agent,
                created_at: log.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (err) {
        console.error('❌ Get settings logs error:', err);
        next(err);
    }
};

