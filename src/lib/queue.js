const { Queue } = require('bullmq');
const { Redis } = require('ioredis');
const logger = require('./logger');
const env = require('../config/env');

const QUEUE_NAME = 'analytics';

let queue = null;

/**
 * BullMQ needs its own dedicated Redis connection (it uses blocking commands).
 * maxRetriesPerRequest must be null for BullMQ workers/queues.
 */
function createQueueConnection() {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

function getQueue() {
  if (queue) return queue;
  try {
    queue = new Queue(QUEUE_NAME, {
      connection: createQueueConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queue.on('error', (err) => logger.warn({ err: err.message }, 'Analytics queue error'));
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not create analytics queue');
    queue = null;
  }
  return queue;
}

/**
 * Enqueue a click event for async analytics processing.
 * Never throws and never blocks the caller for long: if Redis/the queue is
 * unavailable or slow, the add is abandoned after a short timeout and the
 * event is dropped (analytics must never break or slow the redirect path).
 */
async function enqueueClick(event) {
  const q = getQueue();
  if (!q) return;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('analytics queue add timed out')), 1500)
  );
  try {
    await Promise.race([q.add('click', event), timeout]);
  } catch (err) {
    logger.warn({ err: err.message, urlId: event.urlId }, 'Failed to enqueue analytics event');
  }
}

/**
 * Fire-and-forget wrapper used by the redirect path — does not await the enqueue.
 */
function enqueueClickAsync(event) {
  enqueueClick(event).catch((err) =>
    logger.warn({ err: err.message }, 'Async analytics enqueue failed')
  );
}

/** Close the queue connection (used in tests / shutdown). */
async function closeQueue() {
  if (queue) {
    try {
      await queue.close();
    } catch {
      /* ignore */
    }
    queue = null;
  }
}

module.exports = { QUEUE_NAME, getQueue, enqueueClick, enqueueClickAsync, closeQueue };
