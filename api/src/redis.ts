import Redis from "ioredis";
import { readSecret } from "./secrets";

function redisPassword(): string {
  return readSecret("vogler_redis_password", "REDIS_PASSWORD");
}

export const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: redisPassword()
});
