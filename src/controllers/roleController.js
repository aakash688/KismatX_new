// Role Management Controller
// Handles role and permission management with audit logging

import { AppDataSource } from "../config/typeorm.config.js";
import { auditLog, logAdminAction } from "../utils/auditLogger.js";
import { In } from "typeorm";

const RoleEntity = "Roles";
const PermissionEntity = "Permission";
const UserEntity = "User";

/**
 * Create Role (Admin)
 * POST /api/admin/roles
 */
export const createRole = async (req, res, next) => {
    try {
        const { name, description, permissions = [] } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Role name is required" });
        }

        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const permissionRepo = AppDataSource.getRepository(PermissionEntity);

        // Check if role already exists
        const existingRole = await roleRepo.findOne({ where: { name } });
        if (existingRole) {
            return res.status(400).json({ message: "Role already exists" });
        }

        // Get permissions if provided
        let rolePermissions = [];
        if (permissions.length > 0) {
            rolePermissions = await permissionRepo.find({
                where: { id: In(permissions) }
            });
        }

        // Create role
        const newRole = roleRepo.create({
            name,
            description,
            permissions: rolePermissions
        });

        const savedRole = await roleRepo.save(newRole);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "role_created",
            target_type: "role",
            target_id: savedRole.id,
            details: `Admin created role: ${savedRole.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(201).json({
            message: "Role created successfully",
            role: {
                id: savedRole.id,
                name: savedRole.name,
                description: savedRole.description,
                permissions: savedRole.permissions?.map(p => ({
                    id: p.id,
                    name: p.name
                })) || []
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get All Roles (Admin)
 * GET /api/admin/roles
 */
export const getAllRoles = async (req, res, next) => {
    try {
        const roleRepo = AppDataSource.getRepository(RoleEntity);

        const roles = await roleRepo.find({
            relations: ["permissions"],
            order: { name: "ASC" }
        });

        res.json({
            roles: roles.map(role => ({
                id: role.id,
                name: role.name,
                description: role.description,
                isActive: role.isActive,
                createdAt: role.createdAt,
                permissions: role.permissions?.map(p => ({
                    id: p.id,
                    name: p.name,
                    resource: p.resource,
                    action: p.action
                })) || []
            }))
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Update Role (Admin)
 * PUT /api/admin/roles/:id
 */
export const updateRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;

        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const role = await roleRepo.findOne({ where: { id } });

        if (!role) {
            return res.status(404).json({ message: "Role not found" });
        }

        // Update role fields
        if (name !== undefined) role.name = name;
        if (description !== undefined) role.description = description;
        if (isActive !== undefined) role.isActive = isActive;

        const updatedRole = await roleRepo.save(role);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "role_updated",
            target_type: "role",
            target_id: role.id,
            details: `Admin updated role: ${role.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Role updated successfully",
            role: {
                id: updatedRole.id,
                name: updatedRole.name,
                description: updatedRole.description,
                isActive: updatedRole.isActive
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Delete Role (Admin)
 * DELETE /api/admin/roles/:id
 */
export const deleteRole = async (req, res, next) => {
    try {
        const { id } = req.params;

        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const role = await roleRepo.findOne({ where: { id } });

        if (!role) {
            return res.status(404).json({ message: "Role not found" });
        }

        // Check if role is assigned to any users
        const userRepo = AppDataSource.getRepository(UserEntity);
        const usersWithRole = await userRepo.count({
            where: {
                roles: { id: id }
            }
        });

        if (usersWithRole > 0) {
            return res.status(400).json({ 
                message: "Cannot delete role. It is assigned to users. Please reassign users first." 
            });
        }

        await roleRepo.delete(id);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "role_deleted",
            target_type: "role",
            target_id: role.id,
            details: `Admin deleted role: ${role.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Role deleted successfully"
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Assign Permissions to Role (Admin)
 * POST /api/admin/roles/:id/permissions
 */
export const assignPermissionsToRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permission_ids } = req.body;

        if (!permission_ids || !Array.isArray(permission_ids)) {
            return res.status(400).json({ message: "Permission IDs array is required" });
        }

        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const permissionRepo = AppDataSource.getRepository(PermissionEntity);

        const role = await roleRepo.findOne({ 
            where: { id },
            relations: ["permissions"]
        });

        if (!role) {
            return res.status(404).json({ message: "Role not found" });
        }

        // Get permissions
        const permissions = await permissionRepo.find({
            where: { id: In(permission_ids) }
        });

        if (permissions.length !== permission_ids.length) {
            return res.status(400).json({ message: "Some permissions not found" });
        }

        // Assign permissions to role
        role.permissions = permissions;
        await roleRepo.save(role);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "role_permissions_assigned",
            target_type: "role",
            target_id: role.id,
            details: `Admin assigned ${permissions.length} permissions to role: ${role.name}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Permissions assigned to role successfully",
            role: {
                id: role.id,
                name: role.name,
                permissions: permissions.map(p => ({
                    id: p.id,
                    name: p.name,
                    resource: p.resource,
                    action: p.action
                }))
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get Role Permissions (Admin)
 * GET /api/admin/roles/:id/permissions
 */
export const getRolePermissions = async (req, res, next) => {
    try {
        const { id } = req.params;

        const roleRepo = AppDataSource.getRepository(RoleEntity);
        const role = await roleRepo.findOne({
            where: { id },
            relations: ["permissions"]
        });

        if (!role) {
            return res.status(404).json({ message: "Role not found" });
        }

        res.json({
            role: {
                id: role.id,
                name: role.name,
                permissions: role.permissions?.map(p => ({
                    id: p.id,
                    name: p.name,
                    resource: p.resource,
                    action: p.action,
                    description: p.description
                })) || []
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Assign Roles to User (Admin)
 * POST /api/admin/users/:id/roles
 */
export const assignRolesToUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role_ids } = req.body;

        if (!role_ids || !Array.isArray(role_ids)) {
            return res.status(400).json({ message: "Role IDs array is required" });
        }

        const userRepo = AppDataSource.getRepository(UserEntity);
        const roleRepo = AppDataSource.getRepository(RoleEntity);

        const user = await userRepo.findOne({
            where: { id },
            relations: ["roles"]
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Get roles
        const roles = await roleRepo.find({
            where: { id: In(role_ids) }
        });

        if (roles.length !== role_ids.length) {
            return res.status(400).json({ message: "Some roles not found" });
        }

        // Assign roles to user
        user.roles = roles;
        await userRepo.save(user);

        // Log admin action
        await logAdminAction({
            admin_id: req.user.id,
            action: "user_roles_assigned",
            target_type: "user",
            target_id: user.id,
            details: `Admin assigned ${roles.length} roles to user: ${user.user_id}`,
            ip_address: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.json({
            message: "Roles assigned to user successfully",
            user: {
                id: user.id,
                user_id: user.user_id,
                roles: roles.map(r => ({
                    id: r.id,
                    name: r.name
                }))
            }
        });

    } catch (err) {
        next(err);
    }
};

/**
 * Get User Roles (Admin)
 * GET /api/admin/users/:id/roles
 */
export const getUserRoles = async (req, res, next) => {
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
                roles: user.roles?.map(r => ({
                    id: r.id,
                    name: r.name,
                    description: r.description
                })) || []
            }
        });

    } catch (err) {
        next(err);
    }
};

