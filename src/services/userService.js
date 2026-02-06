// User Service
// Handles user-related business logic and operations

import { AppDataSource } from '../config/typeorm.config.js';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';

export class UserService {
  constructor() {
    this.userRepo = AppDataSource.getRepository("User");
    this.roleRepo = AppDataSource.getRepository("Roles");
    this.departmentRepo = AppDataSource.getRepository("Department");
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Object} Created user
   */
  async createUser(userData) {
    try {
      const { fname, lname, email, userid, password, roleNames, department, ...otherData } = userData;

      // Check if user already exists
      if (await this.userExists(userid)) {
        throw new Error('User ID already exists');
      }

      // Validate roles
      const roles = await this.validateRoles(roleNames);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = this.userRepo.create({
        fname,
        lname,
        email,
        userid,
        password: hashedPassword,
        roles,
        department,
        isApproved: false,
        isActive: false,
        ...otherData
      });

      return await this.userRepo.save(user);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Object} User data
   */
  async getUserById(id) {
    try {
      const user = await this.userRepo.findOne({
        where: { id },
        relations: ["roles", "department"]
      });

      if (!user) {
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all users with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} List of users
   */
  async getAllUsers(filters = {}) {
    try {
      const queryOptions = {
        relations: ["roles", "department"],
        where: filters
      };

      return await this.userRepo.find(queryOptions);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update user information
   * @param {number} id - User ID
   * @param {Object} updateData - Update data
   * @returns {Object} Updated user
   */
  async updateUser(id, updateData) {
    try {
      const user = await this.getUserById(id);
      
      // Update fields
      Object.assign(user, updateData);
      
      // Handle roles update
      if (updateData.roleNames) {
        user.roles = await this.validateRoles(updateData.roleNames);
      }

      return await this.userRepo.save(user);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete user
   * @param {number} id - User ID
   * @returns {boolean} Success status
   */
  async deleteUser(id) {
    try {
      const user = await this.getUserById(id);
      await this.userRepo.remove(user);
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if user exists
   * @param {string} userid - User ID
   * @returns {boolean} Exists status
   */
  async userExists(userid) {
    try {
      const user = await this.userRepo.findOne({ where: { userid } });
      return !!user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validate and get roles
   * @param {Array} roleNames - Role names
   * @returns {Array} Role entities
   */
  async validateRoles(roleNames) {
    try {
      const roles = await this.roleRepo.find({
        where: { id: In(roleNames) }
      });

      if (roles.length !== roleNames.length) {
        throw new Error('Invalid roles provided');
      }

      return roles;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user statistics
   * @returns {Object} User statistics
   */
  async getUserStats() {
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const [total, active, newUsers] = await Promise.all([
        this.userRepo.count(),
        this.userRepo.count({ where: { isActive: true } }),
        this.userRepo.count({
          where: {
            createdAt: Between(firstDayOfMonth, now)
          }
        })
      ]);

      return {
        total,
        active,
        new: newUsers,
        inactive: total - active
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process profile photo upload
   * @param {Object} file - Uploaded file
   * @param {number} userId - User ID
   * @returns {string} File path
   */
  async processProfilePhoto(file, userId) {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', 'profilePhoto');
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Generate filename
      const ext = path.extname(file.name);
      const filename = `${userId}-${Date.now()}${ext}`;
      const uploadPath = path.join(uploadDir, filename);

      // Save file
      await file.mv(uploadPath);
      
      return filename;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete old profile photo
   * @param {string} filename - Photo filename
   */
  async deleteProfilePhoto(filename) {
    try {
      if (filename) {
        const photoPath = path.join(process.cwd(), 'uploads', 'profilePhoto', filename);
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
        }
      }
    } catch (error) {
      console.error('Error deleting profile photo:', error);
    }
  }
}
