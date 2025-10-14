import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

// Singleton instances
let redisConnection = null;
let emailQueue = null;

/**
 * Get or create Redis connection (singleton)
 */
export const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = new IORedis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || null,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Optional: Add connection event listeners
    redisConnection.on('connect', () => {
      console.log('Redis connected successfully');
    });

    redisConnection.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  return redisConnection;
};

/**
 * Get or create email queue (singleton)
 */
export const getEmailQueue = () => {
  if (!emailQueue) {
    emailQueue = new Queue('emailQueue', {
      connection: getRedisConnection(),
    });
  }

  return emailQueue;
};

/**
 * Add job to email queue
 */
export async function addEmailJob(data) {
  try {
    const queue = getEmailQueue();
    const job = await queue.add('sendEmail', data, {
      // Optional: Add job options
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    console.log('Job added to email queue:', { jobId: job.id, data });
    return job;
  } catch (error) {
    console.error('Error adding job to email queue:', error);
    throw error;
  }
}

/**
 * Graceful shutdown - close connections
 */
export async function closeConnections() {
  try {
    if (emailQueue) {
      await emailQueue.close();
      emailQueue = null;
    }

    if (redisConnection) {
      await redisConnection.quit();
      redisConnection = null;
    }

    console.log('All connections closed gracefully');
  } catch (error) {
    console.error('Error closing connections:', error);
  }
}
