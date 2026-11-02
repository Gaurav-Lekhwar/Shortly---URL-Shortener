const { query } = require('../config/database');

/**
 * Insert one analytics event. Called by the BullMQ worker, never on the
 * request path (redirect enqueues and returns immediately).
 */
async function recordClick({
  urlId,
  clickedAt = new Date(),
  referrer = null,
  browser = null,
  operatingSystem = null,
  deviceType = null,
  country = null,
  visitorHash = null,
}) {
  const { rows } = await query(
    `INSERT INTO url_clicks (url_id, clicked_at, referrer, browser, operating_system, device_type, country, visitor_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [urlId, clickedAt, referrer, browser, operatingSystem, deviceType, country, visitorHash]
  );
  return rows[0].id;
}

/**
 * Aggregated analytics for one URL (last N days + totals + breakdowns).
 * days=0 means all time.
 */
async function getAnalytics(urlId, days = 30) {
  const timeFilter = days > 0 ? `AND clicked_at >= NOW() - INTERVAL '1 day' * ${Number(days)}` : '';

  const totalRes = await query(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT visitor_hash) AS uniques
     FROM url_clicks WHERE url_id = $1 ${timeFilter}`,
    [urlId]
  );

  const overTimeRes = await query(
    `SELECT DATE(clicked_at) AS day, COUNT(*) AS clicks
     FROM url_clicks
     WHERE url_id = $1 ${timeFilter}
     GROUP BY day ORDER BY day ASC`,
    [urlId]
  );

  const breakdown = async (column) => {
    const { rows } = await query(
      `SELECT COALESCE(${column}, 'Unknown') AS label, COUNT(*) AS clicks
       FROM url_clicks WHERE url_id = $1 ${timeFilter}
       GROUP BY label ORDER BY clicks DESC LIMIT 10`,
      [urlId]
    );
    return rows.map((r) => ({ label: r.label, clicks: Number(r.clicks) }));
  };

  return {
    totalClicks: Number(totalRes.rows[0].total),
    uniqueVisitors: Number(totalRes.rows[0].uniques),
    clicksOverTime: overTimeRes.rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      clicks: Number(r.clicks),
    })),
    byBrowser: await breakdown('browser'),
    byOs: await breakdown('operating_system'),
    byDevice: await breakdown('device_type'),
  };
}

module.exports = { recordClick, getAnalytics };
