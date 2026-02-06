// Migration: Add indexes and foreign key to bet_details table
// Created: 2024-12-01

export default class AddIndexesToBetDetails20241201140000 {
    name = 'AddIndexesToBetDetails20241201140000'

    async up(queryRunner) {
        // Check if game_id and user_id columns exist, if not add them
        const table = await queryRunner.getTable("bet_details");
        const gameIdColumn = table?.findColumnByName("game_id");
        const userIdColumn = table?.findColumnByName("user_id");

        if (!gameIdColumn) {
            await queryRunner.query(`
                ALTER TABLE \`bet_details\`
                ADD COLUMN \`game_id\` VARCHAR(50) NOT NULL
                AFTER \`updated_at\`
            `);
        }

        if (!userIdColumn) {
            await queryRunner.query(`
                ALTER TABLE \`bet_details\`
                ADD COLUMN \`user_id\` BIGINT NOT NULL
                AFTER \`game_id\`
            `);
        }

        // Add indexes
        await queryRunner.query(`
            CREATE INDEX \`idx_game_card\` ON \`bet_details\` (\`game_id\`, \`card_number\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_game_winner\` ON \`bet_details\` (\`game_id\`, \`is_winner\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_slip\` ON \`bet_details\` (\`slip_id\`)
        `);

        // Add foreign key with CASCADE delete if it doesn't exist
        const foreignKeys = table?.foreignKeys || [];
        const hasSlipIdForeignKey = foreignKeys.some(fk => fk.columnNames.includes("slip_id"));
        
        if (!hasSlipIdForeignKey) {
            await queryRunner.query(`
                ALTER TABLE \`bet_details\`
                ADD CONSTRAINT \`fk_bet_details_slip_id\`
                FOREIGN KEY (\`slip_id\`) REFERENCES \`bet_slips\`(\`id\`)
                ON DELETE CASCADE
            `);
        }
    }

    async down(queryRunner) {
        // Drop foreign key
        await queryRunner.query(`
            ALTER TABLE \`bet_details\`
            DROP FOREIGN KEY \`fk_bet_details_slip_id\`
        `).catch(() => {
            // Ignore if foreign key doesn't exist
        });

        // Drop indexes
        await queryRunner.query(`DROP INDEX \`idx_slip\` ON \`bet_details\``);
        await queryRunner.query(`DROP INDEX \`idx_game_winner\` ON \`bet_details\``);
        await queryRunner.query(`DROP INDEX \`idx_game_card\` ON \`bet_details\``);

        // Note: We keep game_id and user_id columns even on rollback
        // as they may contain data. Uncomment to remove them:
        // await queryRunner.query(`ALTER TABLE \`bet_details\` DROP COLUMN \`user_id\``);
        // await queryRunner.query(`ALTER TABLE \`bet_details\` DROP COLUMN \`game_id\``);
    }
}
