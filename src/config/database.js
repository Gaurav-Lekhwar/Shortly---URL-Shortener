const { Pool } = require('pg');
const logger = require('../lib/logger');
const env = require('./env');

// Connection pool: reuse a small set of DB connections across requests
// instead of opening a new one per request (slow and expensive).
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected from pool');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Run a parameterized query (always use params — never interpolate values into SQL).
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (env.isDevelopment && duration > 100) {
    logger.warn({ text, duration, rows: result.rowCount }, 'Slow query detected');
  }

  return result;
}

/**
 * Run a function inside a transaction. The callback receives a client it
 * must use for all queries; we commit on success and roll back on error.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { pool, query, withTransaction, ping };
