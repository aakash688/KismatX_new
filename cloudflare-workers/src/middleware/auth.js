/**
 * Authentication Middleware
 * Verifies JWT tokens and adds user to context
 */

import jwt from 'jsonwebtoken';
import { getSupabaseClient, executeQuery } from '../config/supabase.js';

/**
 * Verify JWT token and add user to context
 */
export async function authenticate(c, next) {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({
        success: false,
        message: 'No authorization token provided'
      }, 401);
    }

    const token = authHeader.substring(7);
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, c.env.JWT_SECRET);
    } catch (err) {
      return c.json({
        success: false,
        message: 'Invalid or expired token'
      }, 401);
    }

    // Validate token type
    if (decoded.type !== 'access') {
      return c.json({
        success: false,
        message: 'Invalid token type'
      }, 401);
    }

    const supabase = getSupabaseClient(c.env);

    // Get user from database
    const user = await executeQuery(() =>
      supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .eq('status', 'active')
        .single()
    );

    if (!user) {
      return c.json({
        success: false,
        message: 'User not found or inactive'
      }, 401);
    }

    // Remove sensitive data
    delete user.password_hash;
    delete user.password_salt;

    // Add user to context
    c.set('user', user);
    c.set('userId', user.id);

    await next();

  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    }, 401);
  }
}

/**
 * Check if user has required role
 */
export function authorize(...allowedRoles) {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({
        success: false,
        message: 'User not authenticated'
      }, 401);
    }

    // Check user_type first (direct field check)
    // Convert Admin to admin for comparison
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
    if (user.user_type && normalizedAllowedRoles.includes(user.user_type.toLowerCase())) {
      await next();
      return;
    }

    // Fallback: Check user_roles table
    try {
      const supabase = getSupabaseClient(c.env);

      const userRoles = await executeQuery(() =>
        supabase
          .from('user_roles')
          .select(`
            role_id,
            roles!inner(name)
          `)
          .eq('user_id', user.id)
      );

      const roleNames = userRoles?.map(ur => ur.roles.name) || [];

      // Check if user has any of the allowed roles
      const hasPermission = allowedRoles.some(role => 
        roleNames.some(rn => rn.toLowerCase() === role.toLowerCase())
      );

      if (!hasPermission) {
        return c.json({
          success: false,
          message: 'Insufficient permissions'
        }, 403);
      }

      await next();
    } catch (error) {
      console.error('Authorization error:', error);
      return c.json({
        success: false,
        message: 'Authorization failed'
      }, 403);
    }
  };
}
