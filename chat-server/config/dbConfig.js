const { Pool, types  } = require('pg');
const { logger } = require('../utils/logger');


// Select database based on environment
const getDatabaseUrl = () => {
    const env = process.env.NODE_ENV;

    if (env === 'production') {
        return process.env.LIVE_DATABASE_URL;
    } else {
        types.setTypeParser(1114, val => new Date(val + 'Z'));
        return process.env.STAGING_DATABASE_URL;

    }
};

const pool = new Pool({
    connectionString: getDatabaseUrl(),
});

pool.connect((err, client, release) => {
    if (err) {
        return logger.error('Error acquiring client', err.stack);
    }
    client.query('SELECT NOW()', (err, result) => {
        release();
        if (err) {
            return logger.error('Error executing query', err.stack);
        }
        logger.info('Connected to PostgreSQL:', result.rows[0]);
    });
});

module.exports = pool;