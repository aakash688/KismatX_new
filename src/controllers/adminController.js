// Admin Controller
// Handles all admin-only operations with comprehensive audit logging

import { AppDataSource } from "../config/typeorm.config.js";
import bcrypt from "bcrypt";
import { auditLog, logAdminAction } from "../utils/auditLogger.js";
import { In } from "typeorm";

const UserEntity = "User";
const RoleEntity = "Roles";
const PermissionEntity = "Permission";
const AuditLogEntity = "AuditLog";
const LoginHistoryEntity = "LoginHistory";
const RefreshTokenEntity = "RefreshToken";

/**
 * Admin Dashboard Summary
 * GET /api/admin/dashboard
 */
export const getDashboard = async (req, res, next) => {
    try {
        console.log('📊 Dashboard request received');
        const userRepo = AppDataSource.getRepository(UserEntity);
        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const auditRepo = AppDataSource.getRepository(AuditLogEntity);

        // Get current date and first day of current month
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Get basic counts
        const totalUsers = await userRepo.count();
        const activeUsers = await userRepo.count({ where: { status: "active" } });
        const bannedUsers = await userRepo.count({ where: { status: "banned" } });
        
        // Get total deposits
        const depositResult = await userRepo
            .createQueryBuilder("user")
            .select("SUM(user.deposit_amount)", "total")
            .getRawOne();
        const totalDeposits = parseFloat(depositResult?.total) || 0;
        
        // Get recent activity counts
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentLogins = await AppDataSource.getRepository(LoginHistoryEntity)
            .createQueryBuilder("login")
            .where("login.login_time >= :yesterday", { yesterday })
            .getCount();
            
        const adminActions = await auditRepo
            .createQueryBuilder("audit")
            .where("audit.created_at >= :yesterday", { yesterday })
            .getCount();

        const dashboardData = {
            totalUsers,
            activeUsers,
            bannedUsers,
            totalDeposits,
            recentLogins,
            adminActions
        };
        
        console.log('📊 Dashboard data:', dashboardData);
        res.json(dashboardData);

    } catch (err) {
        console.error('❌ Dashboard error:', err);
        next(err);
    }
};

/**
 * Create User (Admin)
 * POST /api/admin/users
 */
export const createUser = async (req, res, next) => {
    try {
        const {
            user_id,
            first_name,
            last_name,
            email,
            mobile,
            password,
            user_type = "player",
            status = "active",
            roles = [],
            alternate_mobile,
            deposit_amount,
            address,
            city,
            state,
            pin_code,
            region
        } = req.body;

        console.log('🆕 Backend createUser - Received data:', req.body);

        if (!user_id || !first_name || !last_name || !email || !mobile || !password) {
            return res.status(400).json({ 
                message: "Missing required fields: user_id, first_name, last_name, email, mobile, password" 
            });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const roleRepo = AppDataSource.getRepository(RoleEntity);

        // Check if user already exists
        const existingUser = await userRepo.findOne({
            where: [
                { email: email },
                { mobile: mobile },
                { user_id: user_id }
            ]
        });

        if (existingUser) {
            return res.status(400).json({ 
                message: "User already exists with this email, mobile, or user_id" 
            });
        }

        // Hash password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);
        const password_salt = await bcrypt.genSalt(saltRounds);

        // Get roles if provided
        let userRoles = [];
        if (roles.length > 0) {
            userRoles = await roleRepo.find({
                where: { id: In(roles) }
            });
        }

        // Prepare optional fields - convert empty strings to null
        const nullableFields = ['alternate_mobile', 'address', 'city', 'state', 'pin_code', 'region'];
        const optionalData = {
            alternate_mobile: (alternate_mobile && alternate_mobile.trim()) ? alternate_mobile.trim() : null,
            address: (address && address.trim()) ? address.trim() : null,
            city: (city && city.trim()) ? city.trim() : null,
            state: (state && state.trim()) ? state.trim() : null,
            pin_code: (pin_code && pin_code.trim()) ? pin_code.trim() : null,
            region: (region && region.trim()) ? region.trim() : null,
            deposit_amount: deposit_amount !== undefined && deposit_amount !== null ? parseFloat(deposit_amount) || 0 : 0
        };

        console.log('📝 Optional fields processed:', optionalData);

        // Create user
        const newUser = userRepo.create({
            user_id,
            first_name,
            last_name,
            mobile,
            email,
            password_hash,
            password_salt,
            user_type,
            status,
            roles: userRoles,
            ...optionalData
        });

        const savedUser = await userRepo.save(newUser);

        console.log('✅ User created successfully:', {
            id: savedUser.id,
            user_id: savedUser.user_id,
            alternate_mobile: savedUser.alternate_mobile,
            deposit_amount: savedUser.deposit_amount,
            address: savedUser.address,
            city: savedUser.city,
            state: savedUser.state,
            pin_code: savedUser.pin_code,
            region: savedUser.region
        });

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_created",
            target_type: "user",
            target_id: savedUser.id,
            details: `Admin created user: ${savedUser.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json({
            message: "User created successfully",
            user: {
                id: savedUser.id,
                user_id: savedUser.user_id,
                first_name: savedUser.first_name,
                last_name: savedUser.last_name,
                email: savedUser.email,
                mobile: savedUser.mobile,
                alternate_mobile: savedUser.alternate_mobile,
                address: savedUser.address,
                city: savedUser.city,
                state: savedUser.state,
                pin_code: savedUser.pin_code,
                region: savedUser.region,
                deposit_amount: savedUser.deposit_amount,
                user_type: savedUser.user_type,
                status: savedUser.status
            }
        });

    } catch (err) {
        console.error('❌ Create user error:', err);
        next(err);
    }
};

/**
 * Get All Users (Admin)
 * GET /api/admin/users
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status, user_type, search } = req.query;
        const userRepo = AppDataSource.getRepository(UserEntity);

        const queryBuilder = userRepo.createQueryBuilder("user")
            .leftJoinAndSelect("user.roles", "roles")
            .select([
                "user.id",
                "user.user_id",
                "user.first_name",
                "user.last_name",
                "user.email",
                "user.mobile",
                "user.alternate_mobile",
                "user.address",
                "user.city",
                "user.state",
                "user.pin_code",
                "user.region",
                "user.deposit_amount",
                "user.user_type",
                "user.status",
                "user.created_at",
                "user.last_login",
                "user.email_verified",
                "user.mobile_verified",
                "user.is_email_verified_by_admin",
                "user.is_mobile_verified_by_admin",
                "roles.name"
            ]);

        // Apply filters
        if (status) {
            queryBuilder.andWhere("user.status = :status", { status });
        }
        if (user_type) {
            queryBuilder.andWhere("user.user_type = :user_type", { user_type });
        }
        if (search) {
            queryBuilder.andWhere(
                "(user.first_name LIKE :search OR user.last_name LIKE :search OR user.email LIKE :search OR user.mobile LIKE :search)",
                { search: `%${search}%` }
            );
        }

        // Pagination
        const offset = (page - 1) * limit;
        queryBuilder.skip(offset).take(limit);
        queryBuilder.orderBy("user.created_at", "DESC");

        const [users, total] = await queryBuilder.getManyAndCount();

        res.json({
            users: users.map(user => ({
                ...user,
                roles: user.roles?.map(role => role.name) || []
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get Single User (Admin)
 * GET /api/admin/users/:id
 */
export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userRepo = AppDataSource.getRepository(UserEntity);

        const user = await userRepo.findOne({
            where: { id },
            relations: ["roles"]
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            user: {
                id: user.id,
                user_id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                mobile: user.mobile,
                alternate_mobile: user.alternate_mobile,
                address: user.address,
                city: user.city,
                state: user.state,
                pin_code: user.pin_code,
                region: user.region,
                user_type: user.user_type,
                status: user.status,
                deposit_amount: user.deposit_amount,
                email_verified: user.email_verified,
                mobile_verified: user.mobile_verified,
                is_email_verified_by_admin: user.is_email_verified_by_admin,
                is_mobile_verified_by_admin: user.is_mobile_verified_by_admin,
                created_at: user.created_at,
                last_login: user.last_login,
                roles: user.roles?.map(role => ({
                    id: role.id,
                    name: role.name
                })) || []
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Update User (Admin)
 * PUT /api/admin/users/:id
 */
export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        console.log('🔄 Backend updateUser - ID:', id, 'Data:', updateData);

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        console.log('👤 User before update:', {
            id: user.id,
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            mobile: user.mobile,
            alternate_mobile: user.alternate_mobile,
            address: user.address,
            city: user.city,
            state: user.state,
            pin_code: user.pin_code,
            region: user.region,
            deposit_amount: user.deposit_amount
        });

        // Fields that are nullable and should convert empty strings to null
        const nullableFields = ['alternate_mobile', 'address', 'city', 'state', 'pin_code', 'region'];
        
        // Update user fields - convert empty strings to null for nullable fields
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && key !== 'id') {
                let value = updateData[key];
                
                // Convert empty strings to null for nullable fields
                if (nullableFields.includes(key) && value === '') {
                    value = null;
                    console.log(`🔄 Converting empty string to null for field: ${key}`);
                }
                
                // Ensure deposit_amount is a number or null
                if (key === 'deposit_amount') {
                    value = value === '' || value === null || value === undefined ? 0 : parseFloat(value);
                    console.log(`💰 Converting deposit_amount: ${updateData[key]} -> ${value}`);
                }
                
                console.log(`📝 Updating field ${key}: ${user[key]} -> ${value}`);
                user[key] = value;
            }
        });

        const updatedUser = await userRepo.save(user);

        console.log('✅ User after update:', {
            id: updatedUser.id,
            user_id: updatedUser.user_id,
            first_name: updatedUser.first_name,
            last_name: updatedUser.last_name,
            email: updatedUser.email,
            mobile: updatedUser.mobile,
            alternate_mobile: updatedUser.alternate_mobile,
            address: updatedUser.address,
            city: updatedUser.city,
            state: updatedUser.state,
            pin_code: updatedUser.pin_code,
            region: updatedUser.region,
            deposit_amount: updatedUser.deposit_amount
        });

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_updated",
            target_type: "user",
            target_id: user.id,
            details: `Admin updated user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "User updated successfully",
            user: {
                id: updatedUser.id,
                user_id: updatedUser.user_id,
                first_name: updatedUser.first_name,
                last_name: updatedUser.last_name,
                email: updatedUser.email,
                mobile: updatedUser.mobile,
                alternate_mobile: updatedUser.alternate_mobile,
                address: updatedUser.address,
                city: updatedUser.city,
                state: updatedUser.state,
                pin_code: updatedUser.pin_code,
                region: updatedUser.region,
                deposit_amount: updatedUser.deposit_amount,
                user_type: updatedUser.user_type,
                status: updatedUser.status
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Delete/Ban User (Admin)
 * DELETE /api/admin/users/:id
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action = "ban" } = req.body; // "ban" or "delete"

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (action === "delete") {
            await userRepo.delete(id);
        } else {
            user.status = "banned";
            await userRepo.save(user);
        }

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: action === "delete" ? "user_deleted" : "user_banned",
            target_type: "user",
            target_id: user.id,
            details: `Admin ${action}ed user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: `User ${action}ed successfully`
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Change User Status (Admin)
 * PUT /api/admin/users/:id/status
 */
export const changeUserStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "inactive", "banned"].includes(status)) {
            return res.status(400).json({ 
                message: "Invalid status. Must be: active, inactive, or banned" 
            });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const oldStatus = user.status;
        user.status = status;
        await userRepo.save(user);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_status_changed",
            target_type: "user",
            target_id: user.id,
            details: `Admin changed user status from ${oldStatus} to ${status}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: `User status changed to ${status}`,
            user: {
                id: user.id,
                user_id: user.user_id,
                status: user.status
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Reset User Password (Admin)
 * POST /api/admin/users/:id/reset-password
 */
export const resetUserPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ message: "New password is required" });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Hash new password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(newPassword, saltRounds);
        const password_salt = await bcrypt.genSalt(saltRounds);

        user.password_hash = password_hash;
        user.password_salt = password_salt;
        await userRepo.save(user);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_password_reset",
            target_type: "user",
            target_id: user.id,
            details: `Admin reset password for user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "User password reset successfully"
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Verify User Email (Admin)
 * PUT /api/admin/users/:id/verify-email
 */
export const verifyUserEmail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.email_verified = true;
        user.is_email_verified_by_admin = true;
        await userRepo.save(user);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_email_verified",
            target_type: "user",
            target_id: user.id,
            details: `Admin verified email for user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "User email verified successfully"
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Verify User Mobile (Admin)
 * PUT /api/admin/users/:id/verify-mobile
 */
export const verifyUserMobile = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.mobile_verified = true;
        user.is_mobile_verified_by_admin = true;
        await userRepo.save(user);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_mobile_verified",
            target_type: "user",
            target_id: user.id,
            details: `Admin verified mobile for user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "User mobile verified successfully"
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get User Login History (Admin)
 * GET /api/admin/users/:id/logins
 */
export const getUserLoginHistory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const loginHistoryRepo = AppDataSource.getRepository(LoginHistoryEntity);
        const offset = (page - 1) * limit;

        const [logins, total] = await loginHistoryRepo.findAndCount({
            where: { user_id: id },
            order: { login_time: "DESC" },
            skip: offset,
            take: limit
        });

        res.json({
            logins,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get Audit Logs (Admin)
 * GET /api/admin/audit-logs
 */
export const getAuditLogs = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            user_id, 
            admin_id, 
            action, 
            date_from, 
            date_to 
        } = req.query;

        const auditRepo = AppDataSource.getRepository(AuditLogEntity);
        const queryBuilder = auditRepo.createQueryBuilder("audit")
            .leftJoinAndSelect("audit.user", "user")
            .leftJoinAndSelect("audit.admin", "admin")
            .select([
                "audit.id",
                "audit.action",
                "audit.target_type",
                "audit.target_id",
                "audit.details",
                "audit.ip_address",
                "audit.created_at",
                "user.user_id",
                "user.first_name",
                "user.last_name",
                "admin.user_id",
                "admin.first_name",
                "admin.last_name"
            ]);

        // Apply filters
        if (user_id) {
            queryBuilder.andWhere("audit.user_id = :user_id", { user_id });
        }
        if (admin_id) {
            queryBuilder.andWhere("audit.admin_id = :admin_id", { admin_id });
        }
        if (action) {
            queryBuilder.andWhere("audit.action LIKE :action", { action: `%${action}%` });
        }
        if (date_from) {
            queryBuilder.andWhere("audit.created_at >= :date_from", { date_from });
        }
        if (date_to) {
            queryBuilder.andWhere("audit.created_at <= :date_to", { date_to });
        }

        const offset = (page - 1) * limit;
        queryBuilder.skip(offset).take(limit);
        queryBuilder.orderBy("audit.created_at", "DESC");

        const [logs, total] = await queryBuilder.getManyAndCount();

        res.json({
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get active sessions count for a user
 * GET /api/admin/users/:user_id/sessions/active
 */
export const getUserActiveSessions = async (req, res, next) => {
    try {
        const userIdOrUserIdStr = req.params.user_id || req.params.id;
        if (!userIdOrUserIdStr) {
            return res.status(400).json({ message: "user_id is required" });
        }

        // Support canonical user_id (string) by looking up numeric primary key
        const userRepo = AppDataSource.getRepository(UserEntity);
        const userRec = await userRepo.findOne({ where: { user_id: userIdOrUserIdStr } });
        if (!userRec) {
            return res.status(404).json({ message: "User not found" });
        }
        const userId = userRec.id;

        const refreshTokenRepo = AppDataSource.getRepository(RefreshTokenEntity);

        const activeSessionsCount = await refreshTokenRepo
            .createQueryBuilder("rt")
            .where("rt.user_id = :userId", { userId })
            .andWhere("rt.revoked = :revoked", { revoked: false })
            .andWhere("rt.expiresAt > :now", { now: new Date() })
            .getCount();

        return res.json({
            user_id: userIdOrUserIdStr,
            userId: userId,
            activeSessions: activeSessionsCount
        });
    } catch (err) {
        next(err);
    }
};

/**
 * Kill all active sessions for a user (revoke refresh tokens AND invalidate access tokens)
 * POST /api/admin/users/:id/sessions/kill
 * 
 * This function:
 * 1. Revokes all refresh tokens (prevents new access tokens from being generated)
 * 2. Updates user's last_login timestamp (invalidates all existing access tokens via session version check)
 * 3. Ensures user cannot place bets or access the system until they log in again
 */
export const killUserSessions = async (req, res, next) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const userIdOrUserIdStr = req.params.user_id || req.params.id;
        if (!userIdOrUserIdStr) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({ message: "user_id is required" });
        }

        // Support canonical user_id (string) by looking up numeric primary key
        const userRepo = queryRunner.manager.getRepository(UserEntity);
        const userRec = await userRepo.findOne({ where: { user_id: userIdOrUserIdStr } });
        if (!userRec) {
            await queryRunner.rollbackTransaction();
            return res.status(404).json({ message: "User not found" });
        }
        const userId = userRec.id;

        const refreshTokenRepo = queryRunner.manager.getRepository(RefreshTokenEntity);

        // Step 1: Revoke all active refresh tokens (prevents new access tokens)
        const tokenRevokeResult = await refreshTokenRepo
            .createQueryBuilder()
            .update()
            .set({ revoked: true })
            .where("user_id = :userId", { userId })
            .andWhere("revoked = :revoked", { revoked: false })
            .andWhere("expiresAt > :now", { now: new Date() })
            .execute();

        // Step 2: Update user's last_login timestamp to invalidate ALL existing access tokens
        // The verifyToken middleware checks sessionVersion (which is based on last_login timestamp)
        // By updating last_login, all existing access tokens will fail the session version check
        const now = new Date();
        await userRepo
            .createQueryBuilder()
            .update(UserEntity)
            .set({ last_login: now })
            .where("id = :userId", { userId })
            .execute();

        // Commit transaction
        await queryRunner.commitTransaction();

        // Log the action
        await auditLog({
            admin_id: req.user?.id,
            user_id: userId,
            action: "kill_sessions",
            target_type: "User",
            target_id: userId,
            details: `Killed all sessions: revoked ${tokenRevokeResult.affected || 0} refresh tokens and invalidated all access tokens by updating last_login timestamp`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        console.log(`✅ Killed all sessions for user ${userIdOrUserIdStr} (ID: ${userId})`);
        console.log(`   - Revoked ${tokenRevokeResult.affected || 0} refresh tokens`);
        console.log(`   - Invalidated all access tokens by updating last_login`);

        return res.json({
            success: true,
            message: "All active sessions killed successfully. User must log in again from all devices.",
            revokedRefreshTokens: tokenRevokeResult.affected || 0,
            accessTokensInvalidated: true
        });
    } catch (err) {
        await queryRunner.rollbackTransaction();
        console.error('❌ Error killing user sessions:', err);
        next(err);
    } finally {
        await queryRunner.release();
    }
};

