/**
 * Integration test helpers.
 * Uses a real PostgreSQL database (DATABASE_URL). If DATABASE_URL is not set,
 * integration suites skip themselves gracefully.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const dbAvailable = Boolean(DATABASE_URL);

async function applyMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const version = file.replace('.sql', '');
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (rowCount === 0) {
        await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
      }
    }
  } finally {
    await client.end();
  }
}

async function truncateAll() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('TRUNCATE users, session RESTART IDENTITY CASCADE');
  } finally {
    await client.end();
  }
}

/** Clean shutdown of shared connections so Jest can exit. */
async function closeConnections() {
  const { pool } = require('../src/config/database');
  const { redis } = require('../src/lib/redis');
  const { closeQueue } = require('../src/lib/queue');
  await closeQueue().catch(() => {});
  try { redis.disconnect(); } catch { /* ignore */ }
  await pool.end().catch(() => {});
}

module.exports = { dbAvailable, applyMigrations, truncateAll, closeConnections };
