import { createClient } from "redis";

export const redis = createClient({
  url: "redis://localhost:6379"
});

export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
    console.log("✅ Redis connected");
  }
}
