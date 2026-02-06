// User Routes
// Handles user management endpoints

import express from 'express';
import { 
  userStats,
  getMe,
  ListUser,
  approveUser,
  changeUserStatus,
  CreateUser,
  EditUser,
  DeleteUser,
  getProfile,
  updateProfile,
  uploadProfilePhoto,
  updatePassword,
  getWalletInfo
} from '../controllers/userController.js';
import { verifyToken, isAdmin, isSuperAdmin } from '../middleware/auth.js';
import { validateRequest, validateParams } from '../middleware/validate.js';
import { commonSchemas } from '../middleware/validate.js';

const router = express.Router();

// Public routes (no authentication required)
// None for user management

// Protected routes (authentication required)
router.use(verifyToken);

// User profile routes
router.get('/me', getMe);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile/photo', uploadProfilePhoto);
router.put('/password', updatePassword);

// User wallet info
router.get('/wallet-info', getWalletInfo);

// User management routes (admin only)
router.get('/stats', isAdmin, userStats);
router.get('/', isAdmin, ListUser);
router.get('/:id', isAdmin, ListUser);
router.post('/', isAdmin, validateRequest(commonSchemas.user), CreateUser);
router.put('/:id', isAdmin, validateRequest(commonSchemas.user), EditUser);
router.delete('/:id', isAdmin, DeleteUser);
router.put('/:id/approve', isAdmin, approveUser);
router.put('/:id/status', isAdmin, changeUserStatus);

export default router;
