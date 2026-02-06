// Migration: Add reference tracking to wallet_logs table
// Created: 2024-12-01

export default class AddReferenceToWalletLogs20241201150000 {
    name = 'AddReferenceToWalletLogs20241201150000'

    async up(queryRunner) {
        // Add reference_type column
        await queryRunner.query(`
            ALTER TABLE \`wallet_logs\`
            ADD COLUMN \`reference_type\` VARCHAR(50) NULL COMMENT 'bet_placement, settlement, claim'
            AFTER \`comment\`
        `);

        // Add reference_id column
        await queryRunner.query(`
            ALTER TABLE \`wallet_logs\`
            ADD COLUMN \`reference_id\` VARCHAR(255) NULL COMMENT 'slip_id or game_id'
            AFTER \`reference_type\`
        `);

        // Add status column
        await queryRunner.query(`
            ALTER TABLE \`wallet_logs\`
            ADD COLUMN \`status\` ENUM('pending', 'completed', 'failed') DEFAULT 'completed' NOT NULL
            AFTER \`reference_id\`
        `);
    }

    async down(queryRunner) {
        // Drop columns
        await queryRunner.query(`ALTER TABLE \`wallet_logs\` DROP COLUMN \`status\``);
        await queryRunner.query(`ALTER TABLE \`wallet_logs\` DROP COLUMN \`reference_id\``);
        await queryRunner.query(`ALTER TABLE \`wallet_logs\` DROP COLUMN \`reference_type\``);
    }
}
