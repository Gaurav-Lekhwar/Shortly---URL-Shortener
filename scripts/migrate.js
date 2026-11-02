#!/usr/bin/env node
/**
 * Minimal SQL migration runner. Applies files in migrations/*.sql in order,
 * tracking applied ones in the schema_migrations table.
 *
 * Usage:
 *   npm run migrate         # apply pending migrations
 *   node scripts/migrate.js down  # roll back the last migration (drops tables via down files if present)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();
}

async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.version));

    for (const file of migrationFiles()) {
      const version = file.replace('.sql', '');
      if (applied.has(version)) {
        console.log(`  already applied: ${version}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  applying: ${version}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`  applied: ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
    );
    if (rows.length === 0) {
      console.log('Nothing to roll back.');
      return;
    }
    const version = rows[0].version;
    const downFile = path.join(MIGRATIONS_DIR, `${version}.down.sql`);
    await client.query('BEGIN');
    try {
      if (fs.existsSync(downFile)) {
        await client.query(fs.readFileSync(downFile, 'utf8'));
        console.log(`  rolled back with ${version}.down.sql`);
      } else {
        console.log(`  no down file for ${version}; removing record only (schema unchanged)`);
      }
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end();
  }
}

const cmd = process.argv[2] || 'up';
if (cmd === 'down') down().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === 'create') console.log('Add a new NNN_description.sql file to migrations/ manually.');
else up().catch((e) => { console.error(e.message); process.exit(1); });
