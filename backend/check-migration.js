const { Pool } = require('pg');

const pool = new Pool({
    host: '147.93.108.64',
    port: 5432,
    database: 'MeetRub-Staging',
    user: 'postgres',
    password: 'webzgrowth#admin@123'
});

async function checkMigration() {
    const client = await pool.connect();
    try {
        console.log('Checking migration status...\n');

        // Check earnings_balance column
        const earningsCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'freelancer' AND column_name = 'earnings_balance'
    `);

        console.log('✓ earnings_balance column exists:', earningsCheck.rows.length > 0);

        // Check payouts columns
        const payoutsCheck = await client.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'payouts' 
      AND column_name IN ('transaction_id', 'freelancer_account_id', 'requested_at', 'approved_at', 'approved_by')
      ORDER BY column_name
    `);

        console.log('\nPayouts table columns:');
        console.table(payoutsCheck.rows);

        // Check status constraint
        const constraintCheck = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'payouts_status_check'
    `);

        console.log('\nStatus constraint:');
        if (constraintCheck.rows.length > 0) {
            const def = constraintCheck.rows[0].definition;
            console.log('Includes REQUESTED:', def.includes('REQUESTED'));
            console.log(def.substring(0, 200) + '...');
        } else {
            console.log('NOT FOUND');
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkMigration();
