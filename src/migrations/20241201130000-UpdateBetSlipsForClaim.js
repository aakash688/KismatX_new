// Migration: Update bet_slips table - UUID slip_id, claimed fields, idempotency
// Created: 2024-12-01

export default class UpdateBetSlipsForClaim20241201130000 {
    name = 'UpdateBetSlipsForClaim20241201130000'

    async up(queryRunner) {
        // Update slip_id to UUID format (varchar 36)
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            MODIFY COLUMN \`slip_id\` VARCHAR(36) UNIQUE NOT NULL COMMENT 'UUID v4'
        `);

        // Add claimed column
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            ADD COLUMN \`claimed\` BOOLEAN DEFAULT FALSE NOT NULL
            AFTER \`status\`
        `);

        // Add claimed_at column
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            ADD COLUMN \`claimed_at\` DATETIME NULL
            AFTER \`claimed\`
        `);

        // Add idempotency_key column
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            ADD COLUMN \`idempotency_key\` VARCHAR(255) UNIQUE NULL
            AFTER \`claimed_at\`
        `);

        // Update status enum to include 'won'
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            MODIFY COLUMN \`status\` ENUM('pending', 'won', 'lost', 'settled') DEFAULT 'pending'
        `);

        // Rename total_payout to payout_amount if it exists
        const table = await queryRunner.getTable("bet_slips");
        if (table) {
            const hasTotalPayout = table.findColumnByName("total_payout");
            const hasPayoutAmount = table.findColumnByName("payout_amount");
            
            if (hasTotalPayout && !hasPayoutAmount) {
                await queryRunner.query(`
                    ALTER TABLE \`bet_slips\`
                    CHANGE COLUMN \`total_payout\` \`payout_amount\` DECIMAL(18,2) DEFAULT 0.00
                `);
            }
        }

        // Add indexes
        await queryRunner.query(`
            CREATE INDEX \`idx_user_game\` ON \`bet_slips\` (\`user_id\`, \`game_id\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_claim\` ON \`bet_slips\` (\`game_id\`, \`claimed\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_idempotency\` ON \`bet_slips\` (\`idempotency_key\`)
        `);
    }

    async down(queryRunner) {
        // Drop indexes
        await queryRunner.query(`DROP INDEX \`idx_idempotency\` ON \`bet_slips\``);
        await queryRunner.query(`DROP INDEX \`idx_claim\` ON \`bet_slips\``);
        await queryRunner.query(`DROP INDEX \`idx_user_game\` ON \`bet_slips\``);

        // Revert payout_amount to total_payout if needed
        const table = await queryRunner.getTable("bet_slips");
        if (table) {
            const hasPayoutAmount = table.findColumnByName("payout_amount");
            if (hasPayoutAmount) {
                await queryRunner.query(`
                    ALTER TABLE \`bet_slips\`
                    CHANGE COLUMN \`payout_amount\` \`total_payout\` DECIMAL(18,2) DEFAULT 0.00
                `);
            }
        }

        // Revert status enum
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            MODIFY COLUMN \`status\` ENUM('pending', 'settled', 'lost') DEFAULT 'pending'
        `);

        // Drop columns
        await queryRunner.query(`ALTER TABLE \`bet_slips\` DROP COLUMN \`idempotency_key\``);
        await queryRunner.query(`ALTER TABLE \`bet_slips\` DROP COLUMN \`claimed_at\``);
        await queryRunner.query(`ALTER TABLE \`bet_slips\` DROP COLUMN \`claimed\``);

        // Revert slip_id
        await queryRunner.query(`
            ALTER TABLE \`bet_slips\`
            MODIFY COLUMN \`slip_id\` VARCHAR(50) UNIQUE NOT NULL
        `);
    }
}
