import "reflect-metadata";
import { AppDataSource } from "../src/config/typeorm.config.js";

async function assignAdminRole() {
    try {
        console.log("🚀 Assigning admin role to user 4...");

        // Initialize database connection
        await AppDataSource.initialize();
        console.log("✅ Database connected successfully");

        const userRepo = AppDataSource.getRepository("User");
        const roleRepo = AppDataSource.getRepository("Roles");

        // Get the user
        const user = await userRepo.findOne({ 
            where: { id: 4 },
            relations: ["roles"]
        });
        
        if (!user) {
            console.log("❌ User not found");
            return;
        }
        
        console.log(`👤 Found user: ${user.email}`);
        console.log(`📊 User has ${user.roles.length} roles`);
        
        // Get the Super Admin role
        const superAdminRole = await roleRepo.findOne({ where: { name: "Super Admin" } });
        if (!superAdminRole) {
            console.log("❌ Super Admin role not found");
            return;
        }
        
        // Assign role to user
        user.roles = [superAdminRole];
        await userRepo.save(user);
        console.log("✅ Assigned Super Admin role to user");

    } catch (error) {
        console.error("❌ Assign admin role failed:", error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

assignAdminRole();

