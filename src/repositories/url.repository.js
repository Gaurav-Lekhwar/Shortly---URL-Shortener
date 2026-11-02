const { query } = require('../config/database');

function toUrl(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    shortCode: row.short_code,
    originalUrl: row.original_url,
    customAlias: row.custom_alias,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clickCount: row.click_count !== undefined ? Number(row.click_count) : undefined,
  };
}

async function create({ userId, shortCode, originalUrl, customAlias = null, expiresAt = null }) {
  const { rows } = await query(
    `INSERT INTO urls (user_id, short_code, original_url, custom_alias, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, shortCode, originalUrl, customAlias, expiresAt]
  );
  return toUrl(rows[0]);
}

async function findByShortCode(shortCode) {
  const { rows } = await query('SELECT * FROM urls WHERE short_code = $1', [shortCode]);
  return toUrl(rows[0]);
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM urls WHERE id = $1', [id]);
  return toUrl(rows[0]);
}

async function findByAlias(alias) {
  const { rows } = await query('SELECT * FROM urls WHERE custom_alias = $1', [alias]);
  return toUrl(rows[0]);
}

/**
 * Paginated, searchable, filterable listing for one user.
 * status: 'active' | 'expired' | 'disabled' | 'all'
 * sort: 'newest' | 'oldest' | 'clicks'
 */
async function listByUser(userId, { page = 1, limit = 10, search = '', status = 'all', sort = 'newest' }) {
  const offset = (page - 1) * limit;
  const params = [userId];
  let where = 'WHERE u.user_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (u.original_url ILIKE $${params.length} OR u.short_code ILIKE $${params.length} OR u.custom_alias ILIKE $${params.length})`;
  }
  if (status === 'active') {
    where += ` AND u.is_active = TRUE AND (u.expires_at IS NULL OR u.expires_at > NOW())`;
  } else if (status === 'expired') {
    where += ` AND u.expires_at IS NOT NULL AND u.expires_at <= NOW()`;
  } else if (status === 'disabled') {
    where += ` AND u.is_active = FALSE`;
  }

  const orderBy =
    sort === 'oldest'
      ? 'u.created_at ASC'
      : sort === 'clicks'
        ? 'click_count DESC'
        : 'u.created_at DESC';

  const countRes = await query(`SELECT COUNT(*) AS total FROM urls u ${where}`, params);
  const total = Number(countRes.rows[0].total);

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.*, COUNT(c.id) AS click_count
     FROM urls u
     LEFT JOIN url_clicks c ON c.url_id = u.id
     ${where}
     GROUP BY u.id
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.map(toUrl), total, page, limit };
}

/**
 * Update allowed fields. Returns updated row or null when not found/owned.
 */
async function update(id, userId, fields) {
  const sets = [];
  const params = [];
  const push = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (fields.originalUrl !== undefined) push('original_url', fields.originalUrl);
  if (fields.customAlias !== undefined) push('custom_alias', fields.customAlias);
  if (fields.isActive !== undefined) push('is_active', fields.isActive);
  if (fields.expiresAt !== undefined) push('expires_at', fields.expiresAt);
  push('updated_at', new Date());

  if (sets.length === 1) return findById(id); // only updated_at

  params.push(id, userId);
  const { rows } = await query(
    `UPDATE urls SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  return toUrl(rows[0]);
}

async function remove(id, userId) {
  const { rowCount } = await query('DELETE FROM urls WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

async function dashboardStats(userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())) AS active,
       COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) AS expired,
       COUNT(*) FILTER (WHERE is_active = FALSE) AS disabled,
       COALESCE(SUM(c.cnt), 0) AS total_clicks
     FROM urls u
     LEFT JOIN (SELECT url_id, COUNT(*) AS cnt FROM url_clicks GROUP BY url_id) c ON c.url_id = u.id
     WHERE u.user_id = $1`,
    [userId]
  );
  const r = rows[0];
  return {
    total: Number(r.total),
    active: Number(r.active),
    expired: Number(r.expired),
    disabled: Number(r.disabled),
    totalClicks: Number(r.total_clicks),
  };
}

module.exports = {
  create,
  findByShortCode,
  findById,
  findByAlias,
  listByUser,
  update,
  remove,
  dashboardStats,
};
