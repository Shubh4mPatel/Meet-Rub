const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database credentials
const pool = new Pool({
    host: '147.93.108.64',
    port: 5432,
    database: 'MeetRub-Staging',
    user: 'postgres',
    password: 'webzgrowth#admin@123'
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('🔄 Running payouts table migration...\n');

        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations', 'fix_payouts_pooled_earnings.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        // Execute migration
        await client.query(migrationSQL);

        console.log('✅ Migration completed successfully!\n');

        // Verify changes
        const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'payouts' 
      AND column_name IN ('transaction_id', 'freelancer_account_id', 'requested_at', 'approved_at')
      ORDER BY ordinal_position
    `);

        console.log('📋 Updated columns:');
        console.table(result.rows);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
