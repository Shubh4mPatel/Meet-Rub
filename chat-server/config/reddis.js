
const redis = require('redis');


const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: 6379,
    password: process.env.REDIS_PASSWORD 
});
redisClient.on("error", (err) => console.error("Redis error:", err));

redisClient.connect().then(() => {
  console.log("✅ Connected to Redis");
});
module.exports = redisClient;