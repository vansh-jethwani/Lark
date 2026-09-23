import Redis from "ioredis";

// Try to connect to Redis, but don't crash if it's unavailable (support local dev without Redis)
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
    retryStrategy(times) {
        // Retry a few times, then give up to prevent infinite connection loops in dev
        if (times > 3) {
            console.warn("Redis connection failed. Running without Redis cache.");
            return null;
        }
        return Math.min(times * 1000, 3000);
    },
    maxRetriesPerRequest: 1, // Don't queue up commands indefinitely if disconnected
});

redis.on("error", (err) => {
    // Suppress verbose connection errors if we are intentionally running without Redis
    if (err.code === "ECONNREFUSED") {
        console.warn(`Redis connection refused at ${err.address}:${err.port}. Caching is disabled.`);
    } else {
        console.error("Redis Error:", err.message);
    }
});

redis.on("connect", () => {
    console.log("Redis connected successfully");
});

// A safe wrapper around redis that acts as a dummy cache if redis is down
export const safeCache = {
    async get(key) {
        if (redis.status !== "ready") return null;
        try {
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    },
    async setex(key, ttl, value) {
        if (redis.status !== "ready") return;
        try {
            await redis.setex(key, ttl, JSON.stringify(value));
        } catch {}
    },
    async del(key) {
        if (redis.status !== "ready") return;
        try {
            await redis.del(key);
        } catch {}
    }
};
