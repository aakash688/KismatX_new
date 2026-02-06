// Migration: Add Foreign Key Constraint for bet_details.slip_id → bet_slips.id
// Created: 2024-12-01
// This migration ensures that bet_details.slip_id has a proper foreign key
// relationship with bet_slips.id, enforcing referential integrity.

export default class AddBetDetailsForeignKey20241201160000 {
    name = 'AddBetDetailsForeignKey20241201160000'

    async up(queryRunner) {
        // Check if foreign key already exists
        const constraints = await queryRunner.query(`
            SELECT CONSTRAINT_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'bet_details'
            AND COLUMN_NAME = 'slip_id'
            AND REFERENCED_TABLE_NAME = 'bet_slips'
        `);

        if (constraints && constraints.length > 0) {
            console.log('✅ Foreign key FK_bet_details_betSlip already exists');
            return;
        }

        // Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE \`bet_details\`
            ADD CONSTRAINT \`FK_bet_details_betSlip\`
            FOREIGN KEY (\`slip_id\`)
            REFERENCES \`bet_slips\` (\`id\`)
            ON DELETE CASCADE
            ON UPDATE CASCADE
        `);

        console.log('✅ Added foreign key constraint FK_bet_details_betSlip');
    }

    async down(queryRunner) {
        // Check if foreign key exists before dropping
        const constraints = await queryRunner.query(`
            SELECT CONSTRAINT_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'bet_details'
            AND CONSTRAINT_NAME = 'FK_bet_details_betSlip'
        `);

        if (constraints && constraints.length > 0) {
            await queryRunner.query(`
                ALTER TABLE \`bet_details\`
                DROP FOREIGN KEY \`FK_bet_details_betSlip\`
            `);
            console.log('✅ Dropped foreign key constraint FK_bet_details_betSlip');
        } else {
            console.log('ℹ️  Foreign key FK_bet_details_betSlip does not exist');
        }
    }
}




