#!/usr/bin/env node
/**
 * Analytics worker: consumes the BullMQ "analytics" queue and writes click
 * events into PostgreSQL (url_clicks). Runs as its own process/container so
 * the web app never waits on analytics DB writes.
 *
 * Reliability: 3 attempts, exponential backoff, failed jobs kept for inspection.
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const { Redis } = require('ioredis');
const env = require('../src/config/env');
const logger = require('../src/lib/logger');
const { QUEUE_NAME } = require('../src/lib/queue');
const analyticsRepository = require('../src/repositories/analytics.repository');

const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const e = job.data;
    await analyticsRepository.recordClick({
      urlId: e.urlId,
      clickedAt: e.clickedAt ? new Date(e.clickedAt) : new Date(),
      referrer: e.referrer ?? null,
      browser: e.browser ?? null,
      operatingSystem: e.operatingSystem ?? null,
      deviceType: e.deviceType ?? null,
      country: e.country ?? null,
      visitorHash: e.visitorHash ?? null,
    });
    logger.debug({ jobId: job.id, urlId: e.urlId }, 'Click recorded');
  },
  {
    connection,
    concurrency: 10,
    // attempts/backoff are set as job defaults on enqueue; repeated here as a safety net
    limiter: { max: 500, duration: 1000 },
  }
);

worker.on('completed', (job) => logger.debug({ jobId: job.id }, 'Analytics job completed'));
worker.on('failed', (job, err) =>
  logger.error({ jobId: job?.id, err: err.message }, 'Analytics job failed')
);
worker.on('error', (err) => logger.error({ err: err.message }, 'Worker error'));

logger.info('Analytics worker started, waiting for jobs...');

function shutdown(signal) {
  logger.info({ signal }, 'Worker shutting down...');
  worker
    .close()
    .then(() => connection.disconnect())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
