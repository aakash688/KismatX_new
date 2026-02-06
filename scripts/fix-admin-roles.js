import "reflect-metadata";
import { AppDataSource } from "../src/config/typeorm.config.js";

async function fixAdminRoles() {
    try {
        console.log("🚀 Starting admin role fix...");

        // Initialize database connection
        await AppDataSource.initialize();
        console.log("✅ Database connected successfully");

        const userRepo = AppDataSource.getRepository("User");
        const roleRepo = AppDataSource.getRepository("Roles");

        // Check if roles exist
        const roles = await roleRepo.find();
        console.log(`📋 Found ${roles.length} roles in database`);

        if (roles.length === 0) {
            console.log("🔧 Creating default roles...");
            
            // Create Super Admin role
            const superAdminRole = await roleRepo.save({
                name: "Super Admin",
                description: "Full system access",
                isActive: true
            });
            console.log("✅ Created Super Admin role:", superAdminRole.id);

            // Create Admin role
            const adminRole = await roleRepo.save({
                name: "Admin", 
                description: "Administrative access",
                isActive: true
            });
            console.log("✅ Created Admin role:", adminRole.id);

            // Create Player role
            const playerRole = await roleRepo.save({
                name: "Player",
                description: "Regular player access", 
                isActive: true
            });
            console.log("✅ Created Player role:", playerRole.id);
        }

        // Get the admin user
        const adminUser = await userRepo.findOne({ where: { id: 1 } });
        if (adminUser) {
            console.log("👤 Found admin user:", adminUser.email);
            
            // Check if user has roles
            const userWithRoles = await userRepo.findOne({
                where: { id: 1 },
                relations: ["roles"]
            });
            
            console.log(`📊 User has ${userWithRoles.roles.length} roles`);
            
            if (userWithRoles.roles.length === 0) {
                console.log("🔧 Assigning Super Admin role to user...");
                
                // Get the Super Admin role
                const superAdminRole = await roleRepo.findOne({ where: { name: "Super Admin" } });
                if (superAdminRole) {
                    // Assign role to user
                    adminUser.roles = [superAdminRole];
                    await userRepo.save(adminUser);
                    console.log("✅ Assigned Super Admin role to user");
                }
            }
        }

        console.log("🎉 Admin role fix completed successfully!");

    } catch (error) {
        console.error("❌ Admin role fix failed:", error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

fixAdminRoles();
