// Enhanced Authentication Controller
// Handles comprehensive auth with audit logging and security features

import { AppDataSource } from "../config/typeorm.config.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../utils/token.js";
import { sendResetPasswordEmail, sendWelcomeEmail } from "../utils/mailer.js";
import { auditLog } from "../utils/auditLogger.js";

const UserEntity = "User";
const RefreshTokenEntity = "RefreshToken";
const LoginHistoryEntity = "LoginHistory";

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
    try {
        const { 
            first_name, 
            last_name, 
            email, 
            mobile, 
            password, 
            user_id,
            user_type, // expected: admin | moderator | player
            deposit_amount, // required for player/moderator, ignored for admin
            profile_pic, // optional
            alternate_mobile,
            address,
            city,
            state,
            pin_code,
            region
        } = req.body;

        // Validation
        if (!first_name || !last_name || !email || !mobile || !password || !user_id) {
            return res.status(400).json({ 
                message: "Missing required fields: first_name, last_name, email, mobile, password, user_id" 
            });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const roleRepo = AppDataSource.getRepository("Roles");

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

        // Ensure baseline roles exist (Admin, Moderator, Player)
        const baselineRoles = ["Admin", "Moderator", "Player"];
        for (const name of baselineRoles) {
            const exists = await roleRepo.findOne({ where: { name } });
            if (!exists) {
                await roleRepo.save({ name, description: `${name} role`, isActive: true });
            }
        }

        // Determine effective role
        const requestedRole = (user_type || "player").toString().toLowerCase();
        const allowed = new Set(["admin", "moderator", "player"]);
        const effectiveRole = allowed.has(requestedRole) ? requestedRole : "player";
        const roleName = effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1);
        const roleEntity = await roleRepo.findOne({ where: { name: roleName } });

        // Validate deposit for player/moderator
        let normalizedDeposit = 0;
        if (effectiveRole === "player" || effectiveRole === "moderator") {
            if (typeof deposit_amount === 'undefined' || deposit_amount === null || deposit_amount === "") {
                return res.status(400).json({ message: "deposit_amount is required for player and moderator" });
            }
            const num = Number(deposit_amount);
            if (Number.isNaN(num) || num < 0) {
                return res.status(400).json({ message: "deposit_amount must be a non-negative number" });
            }
            normalizedDeposit = num;
        }

        // Create user
        const newUser = userRepo.create({
            user_id,
            first_name,
            last_name,
            mobile,
            alternate_mobile,
            email,
            address,
            city,
            state,
            pin_code,
            region,
            profile_pic: profile_pic || null,
            deposit_amount: normalizedDeposit,
            password_hash,
            password_salt,
            user_type: effectiveRole,
            status: "active"
        });

        if (roleEntity) {
            newUser.roles = [roleEntity];
        }

        const savedUser = await userRepo.save(newUser);

        // Log registration
        await auditLog({
            user_id: savedUser.id,
            action: "user_registered",
            details: `User registered with email: ${email}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Send welcome email (optional)
        try {
            await sendWelcomeEmail(savedUser);
        } catch (emailError) {
            console.log("Welcome email failed:", emailError.message);
        }

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: savedUser.id,
                user_id: savedUser.user_id,
                first_name: savedUser.first_name,
                last_name: savedUser.last_name,
                email: savedUser.email,
                mobile: savedUser.mobile,
                user_type: savedUser.user_type,
                deposit_amount: savedUser.deposit_amount,
                profile_pic: savedUser.profile_pic,
                status: savedUser.status
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
    try {
        const { user_id, password, force_logout = false } = req.body;

        if (!user_id || !password) {
            return res.status(400).json({ 
                message: "user_id and password are required" 
            });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const loginHistoryRepo = AppDataSource.getRepository(LoginHistoryEntity);

        // Find user strictly by user_id
        const user = await userRepo.findOne({
            where: { user_id },
            relations: ["roles"]
        });

        if (!user) {
            // Log failed login attempt
            await loginHistoryRepo.save({
                user_id: null,
                login_method: "user_id",
                is_successful: false,
                failure_reason: "User not found",
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });

            return res.status(401).json({ 
                message: "Invalid credentials" 
            });
        }

        // Check if user is active
        if (user.status !== "active") {
            await loginHistoryRepo.save({
                user_id: user.id,
                login_method: "user_id",
                is_successful: false,
                failure_reason: `Account ${user.status}`,
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });

            return res.status(401).json({ 
                message: `Account is ${user.status}` 
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            await loginHistoryRepo.save({
                user_id: user.id,
                login_method: "user_id",
                is_successful: false,
                failure_reason: "Invalid password",
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });

            return res.status(401).json({ 
                message: "Invalid credentials" 
            });
        }

        // STRICT SINGLE SESSION ENFORCEMENT
        // Principle: Only ONE active session per user at any time
        // Security: Only admins can bypass active session check using force_logout
        //
        // Behavior:
        // 1. Clean up expired tokens (database maintenance)
        // 2. Check for active sessions (non-revoked, non-expired refresh tokens)
        // 3. Check if user is admin
        // 4. If active session exists AND (force_logout=false OR user is not admin) -> BLOCK login
        // 5. If login is allowed -> ALWAYS revoke ALL existing tokens first, then create new token
        // 6. Result: Only ONE active session exists after successful login
        
        const refreshTokenRepo = AppDataSource.getRepository(RefreshTokenEntity);
        const now = new Date();

        // Check if user is admin (role ID 1 = SuperAdmin, role ID 2 = Admin, or role name contains 'Admin')
        const userRoles = user.roles || [];
        const isAdminUser = userRoles.some(role => 
            role.id === 1 || 
            role.id === 2 || 
            role.name?.toLowerCase() === 'admin' ||
            user.user_type?.toLowerCase() === 'admin'
        );

        // SECURITY: Only admins can use force_logout. Ignore force_logout for non-admins.
        let effectiveForceLogout = false;
        if (force_logout && isAdminUser) {
            effectiveForceLogout = true;
            console.log(`🔐 Admin user ${user.user_id} attempting force logout`);
        } else if (force_logout && !isAdminUser) {
            console.warn(`⚠️ Non-admin user ${user.user_id} attempted force_logout - ignoring (security feature)`);
            effectiveForceLogout = false;
        }

        // Step 1: Clean up expired refresh tokens (database maintenance)
        // Delete tokens that expired more than 7 days ago to prevent DB bloat
        try {
            await refreshTokenRepo
                .createQueryBuilder()
                .delete()
                .where('expiresAt < :sevenDaysAgo', { 
                    sevenDaysAgo: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) 
                })
                .execute();
        } catch (cleanupError) {
            console.warn('⚠️ Token cleanup warning:', cleanupError.message);
        }

        // Step 2: Check for active sessions (non-revoked, non-expired refresh tokens)
        const activeSessions = await refreshTokenRepo
            .createQueryBuilder('rt')
            .where('rt.user_id = :userId', { userId: user.id })
            .andWhere('rt.revoked = :revoked', { revoked: false })
            .andWhere('rt.expiresAt > :now', { now })
            .getMany();

        // Step 3: If active session exists, check if we should allow login
        if (activeSessions.length > 0 && !effectiveForceLogout) {
            // Active session exists and force_logout is not allowed -> BLOCK login
            await loginHistoryRepo.save({
                user_id: user.id,
                login_method: "user_id",
                is_successful: false,
                failure_reason: "Active session exists on another device",
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            });

            // Provide helpful message based on user type
            const errorMessage = isAdminUser
                ? "You are already logged in on another device. Please logout first, or use 'force_logout: true' to logout from all devices."
                : "You are already logged in on another device. This is a security feature to prevent unauthorized access. Please contact an administrator to revoke your active sessions, or logout from the other device first.";

            return res.status(403).json({
                success: false,
                message: errorMessage,
                code: "ACTIVE_SESSION_EXISTS",
                activeSessions: activeSessions.length,
                requiresAdmin: !isAdminUser
            });
        }

        // Step 4: Login is allowed - STRICT SINGLE SESSION: Revoke ALL existing tokens FIRST
        // This ensures only ONE active session exists after this login
        // We do this BEFORE creating the new token to prevent any race conditions
        if (activeSessions.length > 0) {
            if (effectiveForceLogout) {
                console.log(`🔐 Admin force logout - revoking ${activeSessions.length} active session(s) for user ${user.user_id}`);
            } else {
                console.log(`🔐 New login detected - revoking ${activeSessions.length} existing session(s) for user ${user.user_id} (single session enforcement)`);
            }
            
            // CRITICAL: If there are active sessions, we MUST revoke them to enforce single session
            // If revocation fails, we block login to prevent multiple active sessions
        try {
            const revokeResult = await refreshTokenRepo
                .createQueryBuilder()
                    .update()
                .set({ 
                        revoked: true
                })
                .where('user_id = :userId', { userId: user.id })
                .andWhere('revoked = :revoked', { revoked: false })
                .execute();

            if (revokeResult.affected > 0) {
                    console.log(`✅ Revoked ${revokeResult.affected} existing refresh token(s) for user ${user.user_id} - enforcing single session`);
                }
            } catch (revokeError) {
                // Critical: If we can't revoke active tokens, BLOCK login to prevent multiple sessions
                console.error('❌ CRITICAL: Failed to revoke existing tokens:', revokeError);
                console.error('❌ Error details:', {
                    message: revokeError.message,
                    stack: revokeError.stack,
                    userId: user.id,
                    activeSessions: activeSessions.length
                });
                await loginHistoryRepo.save({
                    user_id: user.id,
                    login_method: "user_id",
                    is_successful: false,
                    failure_reason: `Failed to revoke existing sessions: ${revokeError.message}`,
                    ip_address: req.ip,
                    user_agent: req.get('User-Agent')
                });
                return res.status(500).json({
                    success: false,
                    message: "Unable to ensure single session. Please try again or contact support.",
                    error: process.env.NODE_ENV === 'development' ? revokeError.message : undefined
                });
            }
        } else {
            // No active sessions found - proceed with login
            // This is the normal case when user logs in for the first time or after all sessions expired
            console.log(`✅ No active sessions found for user ${user.user_id} - proceeding with login`);
        }

        // CRITICAL: Update last_login BEFORE generating tokens
        // This ensures the new token has the new session version, and all old tokens become invalid
        // When last_login changes, all old access tokens become invalid immediately
        const newLastLogin = new Date();
        user.last_login = newLastLogin;
        await userRepo.save(user);
        
        // Reload user to ensure we have the updated last_login for token generation
        const updatedUser = await userRepo.findOne({
            where: { id: user.id },
            relations: ["roles"]
        });

        // Generate tokens with updated user (includes new last_login for session version)
        const accessToken = generateAccessToken(updatedUser);
        const refreshToken = generateRefreshToken(updatedUser);

        // Save refresh token
        try {
            const savedToken = await refreshTokenRepo.save({
                user: updatedUser, // Use the updated user object
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            });
            console.log("Refresh token saved successfully:", savedToken.id);
        } catch (error) {
            console.error("Error saving refresh token:", error);
            // Continue with login even if refresh token save fails
        }

        // Log successful login
        await loginHistoryRepo.save({
            user_id: updatedUser.id,
            login_method: "user_id",
            is_successful: true,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        // Log login action
        await auditLog({
            user_id: updatedUser.id,
            action: "user_login",
            details: `User logged in from ${req.ip}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            success: true,
            message: "Login successful",
            accessToken,
            refreshToken,
            user: {
                id: updatedUser.id,
                user_id: updatedUser.user_id,
                first_name: updatedUser.first_name,
                last_name: updatedUser.last_name,
                email: updatedUser.email,
                mobile: updatedUser.mobile,
                user_type: updatedUser.user_type,
                status: updatedUser.status,
                roles: updatedUser.roles?.map(role => role.name) || []
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            const refreshTokenRepo = AppDataSource.getRepository(RefreshTokenEntity);
            await refreshTokenRepo.delete({ token: refreshToken });
        }

        // Log logout action
        await auditLog({
            user_id: req.user?.id,
            action: "user_logout",
            details: "User logged out",
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({ message: "Logout successful" });

    } catch (err) {
        next(err);
    }
};

/**
 * Refresh access token
 * POST /api/auth/refresh-token
 */
export const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: "Refresh token is required" });
        }

        const refreshTokenRepo = AppDataSource.getRepository(RefreshTokenEntity);
        const userRepo = AppDataSource.getRepository(UserEntity);

        const tokenRecord = await refreshTokenRepo.findOne({
            where: { token: refreshToken },
            relations: ["user", "user.roles"]
        });

        console.log("Refresh token lookup result:", tokenRecord ? "Found" : "Not found");
        if (tokenRecord) {
            console.log("Token record user:", tokenRecord.user ? "User exists" : "User is null");
            console.log("Token expires at:", tokenRecord.expiresAt);
            console.log("Current time:", new Date());
        }

        if (!tokenRecord) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        // Check if token is revoked
        if (tokenRecord.revoked) {
            return res.status(401).json({ message: "Refresh token has been revoked" });
        }

        // Check if token is expired
        if (tokenRecord.expiresAt < new Date()) {
            return res.status(401).json({ message: "Refresh token has expired" });
        }

        // Check if user relationship exists
        if (!tokenRecord.user || !tokenRecord.user.id) {
            return res.status(401).json({ message: "Invalid refresh token - user not found" });
        }

        // Fetch user with roles for token generation
        const user = await userRepo.findOne({
            where: { id: tokenRecord.user.id },
            relations: ["roles"]
        });

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        // Generate new access token
        const accessToken = generateAccessToken(user);

        res.json({
            message: "Token refreshed successfully",
            accessToken
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
    try {
        const { email_or_mobile } = req.body;

        if (!email_or_mobile) {
            return res.status(400).json({ message: "Email or mobile is required" });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({
            where: [
                { email: email_or_mobile },
                { mobile: email_or_mobile }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Generate reset token (in real implementation, use crypto.randomBytes)
        const resetToken = jwt.sign(
            { userId: user.id, type: 'password_reset' },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '1h' }
        );

        // Save reset token to user (you might want a separate table for this)
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await userRepo.save(user);

        // Send reset email
        const resetLink = `${process.env.BASEURL}/reset-password?token=${resetToken}`;
        await sendResetPasswordEmail(user, resetLink);

        // Log password reset request
        await auditLog({
            user_id: user.id,
            action: "password_reset_requested",
            details: `Password reset requested for ${email_or_mobile}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({ message: "Password reset instructions sent to your email/mobile" });

    } catch (err) {
        next(err);
    }
};

/**
 * Reset password
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);

        // Verify token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        if (decoded.type !== 'password_reset') {
            return res.status(400).json({ message: "Invalid token type" });
        }

        const user = await userRepo.findOne({
            where: { 
                id: decoded.userId,
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: new Date() }
            }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        // Hash new password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(newPassword, saltRounds);
        const password_salt = await bcrypt.genSalt(saltRounds);

        // Update password
        user.password_hash = password_hash;
        user.password_salt = password_salt;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await userRepo.save(user);

        // Log password reset
        await auditLog({
            user_id: user.id,
            action: "password_reset_completed",
            details: "Password reset completed successfully",
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({ message: "Password reset successfully" });

    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(400).json({ message: "Invalid token" });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ message: "Token expired" });
        }
        next(err);
    }
};

/**
 * Change password (authenticated user)
 * POST /api/user/change-password
 */
export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Current password and new password are required" });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const user = await userRepo.findOne({ where: { id: req.user.id } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Hash new password
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(newPassword, saltRounds);
        const password_salt = await bcrypt.genSalt(saltRounds);

        // Update password
        user.password_hash = password_hash;
        user.password_salt = password_salt;
        await userRepo.save(user);

        // Log password change
        await auditLog({
            user_id: user.id,
            action: "password_changed",
            details: "User changed their password",
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({ message: "Password changed successfully" });

    } catch (err) {
        next(err);
    }
};