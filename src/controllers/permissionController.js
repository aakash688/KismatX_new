// Permission Management Controller
// Handles permission management with audit logging

import { AppDataSource } from "../config/typeorm.config.js";
import { logAdminAction } from "../utils/auditLogger.js";

const PermissionEntity = "Permission";

/**
 * Create Permission (Admin)
 * POST /api/admin/permissions
 */
export const createPermission = async (req, res, next) => {
    try {
        const { name, description, resource, action } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Permission name is required" });
        }

        const permissionRepo = AppDataSource.getRepository(PermissionEntity);

        // Check if permission already exists
        const existingPermission = await permissionRepo.findOne({ where: { name } });
        if (existingPermission) {
            return res.status(400).json({ message: "Permission already exists" });
        }

        // Create permission
        const newPermission = permissionRepo.create({
            name,
            description,
            resource,
            action
        });

        const savedPermission = await permissionRepo.save(newPermission);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "permission_created",
            target_type: "permission",
            target_id: savedPermission.id,
            details: `Admin created permission: ${savedPermission.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json({
            message: "Permission created successfully",
            permission: {
                id: savedPermission.id,
                name: savedPermission.name,
                description: savedPermission.description,
                resource: savedPermission.resource,
                action: savedPermission.action
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get All Permissions (Admin)
 * GET /api/admin/permissions
 */
export const getAllPermissions = async (req, res, next) => {
    try {
        const { resource, action } = req.query;
        const permissionRepo = AppDataSource.getRepository(PermissionEntity);

        const queryBuilder = permissionRepo.createQueryBuilder("permission");

        // Apply filters
        if (resource) {
            queryBuilder.andWhere("permission.resource = :resource", { resource });
        }
        if (action) {
            queryBuilder.andWhere("permission.action = :action", { action });
        }

        queryBuilder.orderBy("permission.name", "ASC");

        const permissions = await queryBuilder.getMany();

        res.json({
            permissions: permissions.map(permission => ({
                id: permission.id,
                name: permission.name,
                description: permission.description,
                resource: permission.resource,
                action: permission.action,
                isActive: permission.isActive,
                createdAt: permission.createdAt
            }))
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Update Permission (Admin)
 * PUT /api/admin/permissions/:id
 */
export const updatePermission = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, resource, action, isActive } = req.body;

        const permissionRepo = AppDataSource.getRepository(PermissionEntity);
        const permission = await permissionRepo.findOne({ where: { id } });

        if (!permission) {
            return res.status(404).json({ message: "Permission not found" });
        }

        // Update permission fields
        if (name !== undefined) permission.name = name;
        if (description !== undefined) permission.description = description;
        if (resource !== undefined) permission.resource = resource;
        if (action !== undefined) permission.action = action;
        if (isActive !== undefined) permission.isActive = isActive;

        const updatedPermission = await permissionRepo.save(permission);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "permission_updated",
            target_type: "permission",
            target_id: permission.id,
            details: `Admin updated permission: ${permission.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Permission updated successfully",
            permission: {
                id: updatedPermission.id,
                name: updatedPermission.name,
                description: updatedPermission.description,
                resource: updatedPermission.resource,
                action: updatedPermission.action,
                isActive: updatedPermission.isActive
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Delete Permission (Admin)
 * DELETE /api/admin/permissions/:id
 */
export const deletePermission = async (req, res, next) => {
    try {
        const { id } = req.params;

        const permissionRepo = AppDataSource.getRepository(PermissionEntity);
        const permission = await permissionRepo.findOne({ where: { id } });

        if (!permission) {
            return res.status(404).json({ message: "Permission not found" });
        }

        await permissionRepo.delete(id);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "permission_deleted",
            target_type: "permission",
            target_id: permission.id,
            details: `Admin deleted permission: ${permission.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Permission deleted successfully"
        });

    } catch (err) {
        next(err);
    }
};

