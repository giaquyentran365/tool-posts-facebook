const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fb_tool',
    max: 10,
    idleTimeoutMillis: 30000,
});

const query = (text, params) => pool.query(text, params);

module.exports = {
    pool,
    query
};
