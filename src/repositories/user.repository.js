const { query } = require('../config/database');

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicUser(row) {
  const u = toUser(row);
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

async function createUser(email, passwordHash) {
  const { rows } = await query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email.toLowerCase(), passwordHash]
  );
  return toUser(rows[0]);
}

async function findByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return toUser(rows[0]);
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return toUser(rows[0]);
}

module.exports = { createUser, findByEmail, findById, toPublicUser };
