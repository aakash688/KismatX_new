// Migration: Add settlement tracking fields to games table
// Created: 2024-12-01

export default class AddSettlementToGames20241201120000 {
    name = 'AddSettlementToGames20241201120000'

    async up(queryRunner) {
        // Add settlement_status column
        await queryRunner.query(`
            ALTER TABLE \`games\`
            ADD COLUMN \`settlement_status\` ENUM('not_settled', 'settling', 'settled', 'failed') DEFAULT 'not_settled' NOT NULL
            AFTER \`payout_multiplier\`
        `);

        // Add settlement_started_at column
        await queryRunner.query(`
            ALTER TABLE \`games\`
            ADD COLUMN \`settlement_started_at\` DATETIME NULL
            AFTER \`settlement_status\`
        `);

        // Add settlement_completed_at column
        await queryRunner.query(`
            ALTER TABLE \`games\`
            ADD COLUMN \`settlement_completed_at\` DATETIME NULL
            AFTER \`settlement_started_at\`
        `);

        // Add settlement_error column
        await queryRunner.query(`
            ALTER TABLE \`games\`
            ADD COLUMN \`settlement_error\` TEXT NULL
            AFTER \`settlement_completed_at\`
        `);

        // Add indexes
        await queryRunner.query(`
            CREATE INDEX \`idx_settlement\` ON \`games\` (\`settlement_status\`, \`game_id\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_status\` ON \`games\` (\`status\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_time_range\` ON \`games\` (\`start_time\`, \`end_time\`)
        `);
    }

    async down(queryRunner) {
        // Drop indexes
        await queryRunner.query(`DROP INDEX \`idx_time_range\` ON \`games\``);
        await queryRunner.query(`DROP INDEX \`idx_status\` ON \`games\``);
        await queryRunner.query(`DROP INDEX \`idx_settlement\` ON \`games\``);

        // Drop columns
        await queryRunner.query(`ALTER TABLE \`games\` DROP COLUMN \`settlement_error\``);
        await queryRunner.query(`ALTER TABLE \`games\` DROP COLUMN \`settlement_completed_at\``);
        await queryRunner.query(`ALTER TABLE \`games\` DROP COLUMN \`settlement_started_at\``);
        await queryRunner.query(`ALTER TABLE \`games\` DROP COLUMN \`settlement_status\``);
    }
}
