import "reflect-metadata";
import { AppDataSource } from "../src/config/typeorm.config.js";
import bcrypt from "bcrypt";

async function initializeDatabase() {
  try {
    console.log("🚀 Starting database initialization...");
    
    // Initialize database connection
    await AppDataSource.initialize();
    console.log("✅ Database connected successfully");
    
    // Synchronize schema (handle existing tables gracefully)
    console.log("🔍 Synchronizing database schema...");
    try {
      await AppDataSource.synchronize();
      console.log("✅ Database schema synchronized");
    } catch (syncError) {
      if (syncError.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log("ℹ️ Tables already exist, continuing with data setup...");
      } else {
        throw syncError;
      }
    }
    
    // Check if we need to create initial data
    const userRepository = AppDataSource.getRepository("User");
    const roleRepository = AppDataSource.getRepository("Role");
    const permissionRepository = AppDataSource.getRepository("Permission");
    
    const userCount = await userRepository.count();
    const roleCount = await roleRepository.count();
    const permissionCount = await permissionRepository.count();
    
    console.log(`📊 Current database state:`);
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Roles: ${roleCount}`);
    console.log(`   - Permissions: ${permissionCount}`);
    
    if (userCount === 0 && roleCount === 0 && permissionCount === 0) {
      console.log("🌱 Creating initial data...");
      
      // Create permissions first
      const permissions = [
        {
          name: "user_management",
          description: "Manage users (create, read, update, delete)",
          resource: "user",
          action: "manage"
        },
        {
          name: "role_management", 
          description: "Manage roles and permissions",
          resource: "role",
          action: "manage"
        },
        {
          name: "game_management",
          description: "Manage game sessions and settings",
          resource: "game",
          action: "manage"
        },
        {
          name: "dashboard_access",
          description: "Access admin dashboard",
          resource: "dashboard",
          action: "read"
        },
        {
          name: "audit_logs",
          description: "View audit logs and system activity",
          resource: "audit",
          action: "read"
        },
        {
          name: "user_verification",
          description: "Verify user email and mobile",
          resource: "user",
          action: "verify"
        },
        {
          name: "deposit_management",
          description: "Manage user deposits and transactions",
          resource: "deposit",
          action: "manage"
        },
        {
          name: "game_play",
          description: "Play games and participate",
          resource: "game",
          action: "play"
        },
        {
          name: "profile_management",
          description: "Manage own profile",
          resource: "profile",
          action: "manage"
        },
        {
          name: "view_statistics",
          description: "View game statistics and reports",
          resource: "statistics",
          action: "read"
        }
      ];
      
      const createdPermissions = await permissionRepository.save(permissions);
      console.log(`✅ Created ${createdPermissions.length} permissions`);
      
      // Create roles
      const roles = [
        {
          name: "super_admin",
          description: "Super administrator with full system access",
          isActive: true
        },
        {
          name: "admin",
          description: "Administrator with user management access",
          isActive: true
        },
        {
          name: "moderator",
          description: "Game moderator with limited admin access",
          isActive: true
        },
        {
          name: "player",
          description: "Regular game player",
          isActive: true
        },
        {
          name: "vip_player",
          description: "VIP player with special privileges",
          isActive: true
        }
      ];
      
      const createdRoles = await roleRepository.save(roles);
      console.log(`✅ Created ${createdRoles.length} roles`);
      
      // Assign permissions to roles
      const superAdminRole = createdRoles.find(r => r.name === "super_admin");
      const adminRole = createdRoles.find(r => r.name === "admin");
      const moderatorRole = createdRoles.find(r => r.name === "moderator");
      const playerRole = createdRoles.find(r => r.name === "player");
      const vipPlayerRole = createdRoles.find(r => r.name === "vip_player");
      
      // Super admin gets all permissions
      superAdminRole.permissions = createdPermissions;
      await roleRepository.save(superAdminRole);
      
      // Admin gets most permissions except super admin ones
      adminRole.permissions = createdPermissions.filter(p => 
        !["user_management", "role_management"].includes(p.name)
      );
      await roleRepository.save(adminRole);
      
      // Moderator gets game and basic permissions
      moderatorRole.permissions = createdPermissions.filter(p => 
        ["game_management", "dashboard_access", "audit_logs", "profile_management", "view_statistics"].includes(p.name)
      );
      await roleRepository.save(moderatorRole);
      
      // Player gets basic permissions
      playerRole.permissions = createdPermissions.filter(p => 
        ["game_play", "profile_management"].includes(p.name)
      );
      await roleRepository.save(playerRole);
      
      // VIP player gets enhanced permissions
      vipPlayerRole.permissions = createdPermissions.filter(p => 
        ["game_play", "profile_management", "view_statistics"].includes(p.name)
      );
      await roleRepository.save(vipPlayerRole);
      
      console.log("✅ Assigned permissions to roles");
      
      // Create initial admin user
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash("admin123", saltRounds);
      const passwordSalt = await bcrypt.genSalt(saltRounds);
      
      const adminUser = {
        user_id: "admin001",
        first_name: "Admin",
        last_name: "User",
        email: "admin@kismatx.com",
        mobile: "9876543210",
        password_hash: hashedPassword,
        password_salt: passwordSalt,
        user_type: "admin",
        status: "active",
        email_verified: true,
        mobile_verified: true,
        is_email_verified_by_admin: true,
        is_mobile_verified_by_admin: true
      };
      
      const createdAdmin = await userRepository.save(adminUser);
      
      // Assign super admin role to admin user
      createdAdmin.roles = [superAdminRole];
      await userRepository.save(createdAdmin);
      
      console.log("✅ Created initial admin user");
      console.log("📧 Admin Email: admin@kismatx.com");
      console.log("🔑 Admin Password: admin123");
      
    } else {
      console.log("ℹ️ Database already has data, skipping initial setup");
    }
    
    console.log("🎉 Database initialization completed successfully!");
    console.log("🚀 You can now start the application with: npm run dev");
    
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run initialization
initializeDatabase();
