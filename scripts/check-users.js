import "reflect-metadata";
import { AppDataSource } from "../src/config/typeorm.config.js";

async function checkUsers() {
    try {
        console.log("🚀 Checking users...");

        // Initialize database connection
        await AppDataSource.initialize();
        console.log("✅ Database connected successfully");

        const userRepo = AppDataSource.getRepository("User");

        // Get all users
        const users = await userRepo.find({
            relations: ["roles"]
        });
        
        console.log(`📋 Found ${users.length} users in database:`);
        
        users.forEach(user => {
            console.log(`👤 User: ${user.email}`);
            console.log(`   ID: ${user.id}`);
            console.log(`   User ID: ${user.user_id}`);
            console.log(`   Name: ${user.first_name} ${user.last_name}`);
            console.log(`   Status: ${user.status}`);
            console.log(`   Roles: ${user.roles.map(role => role.name).join(', ')}`);
            console.log(`   Password Hash: ${user.password_hash.substring(0, 20)}...`);
            console.log('---');
        });

    } catch (error) {
        console.error("❌ Check users failed:", error);
    } finally {
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
        }
    }
}

checkUsers();

