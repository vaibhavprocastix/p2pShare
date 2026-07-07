import { createClient } from "redis";

let redis = null;

export async function initRedis() {
  if (redis) return redis;

  redis = createClient({
    url: process.env.REDIS_URL || "redis://redis:6379"
  });

  redis.on("connect", () => {
    console.log("✓ Redis Connected");
  });

  redis.on("ready", () => {
    console.log("✓ Redis Ready");
  });

  redis.on("reconnecting", () => {
    console.log("Redis Reconnecting...");
  });

  redis.on("error", (err) => {
    console.error("Redis Error:", err.message);
  });

  redis.on("end", () => {
    console.log("Redis Connection Closed");
  });

  await redis.connect();

  return redis;
}

export function getRedis() {
  if (!redis) {
    throw new Error("Redis has not been initialized.");
  }

  return redis;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}