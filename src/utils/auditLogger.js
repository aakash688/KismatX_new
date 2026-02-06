// Audit Logger Utility
// Centralized logging for all user and admin actions

import { AppDataSource } from "../config/typeorm.config.js";

/**
 * Log an audit event
 * @param {Object} options - Audit log options
 * @param {number} options.user_id - ID of user performing action (optional)
 * @param {number} options.admin_id - ID of admin performing action (optional)
 * @param {string} options.action - Action being performed
 * @param {string} options.target_type - Type of target (user, role, etc.)
 * @param {number} options.target_id - ID of target entity
 * @param {string} options.details - Additional details
 * @param {string} options.ip_address - IP address of requester
 * @param {string} options.user_agent - User agent string
 */
export const auditLog = async (options) => {
    try {
        const auditLogRepo = AppDataSource.getRepository("AuditLog");
        
        await auditLogRepo.save({
            user_id: options.user_id || null,
            admin_id: options.admin_id || null,
            action: options.action,
            target_type: options.target_type || null,
            target_id: options.target_id || null,
            details: options.details || null,
            ip_address: options.ip_address || null,
            user_agent: options.user_agent || null
        });
    } catch (error) {
        console.error("Failed to log audit event:", error);
        // Don't throw error to avoid breaking the main flow
    }
};

/**
 * Log admin action
 * @param {Object} options - Admin action options
 */
export const logAdminAction = async (options) => {
    await auditLog({
        ...options,
        admin_id: options.admin_id,
        action: `admin_${options.action}`
    });
};

/**
 * Log user action
 * @param {Object} options - User action options
 */
export const logUserAction = async (options) => {
    await auditLog({
        ...options,
        user_id: options.user_id,
        action: `user_${options.action}`
    });
};

