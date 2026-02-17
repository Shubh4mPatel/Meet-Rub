
const redis = require('redis');

require('dotenv').config();
console.log("REDIS_HOST:", process.env.REDIS_HOST);
console.log("REDIS_PORT:", process.env.REDIS_PORT);
console.log("REDIS_PASSWORD:", process.env.REDIS_PASSWORD);

const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6378
    },
    password: process.env.REDIS_PASSWORD
});

redisClient.on("error", (err) => console.error("Redis error:", err));

redisClient.connect().then(() => {
  console.log("✅ Connected to Redis");
}).catch((err) => {
  console.error("❌ Failed to connect to Redis:", err);
});

module.exports = redisClient;