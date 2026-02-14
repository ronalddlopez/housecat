import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";

export interface IStorage {
  getRedis(): Redis;
  getQStash(): QStashClient;
}

export class AppStorage implements IStorage {
  private redis: Redis | null = null;
  private qstash: QStashClient | null = null;

  getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
    }
    return this.redis;
  }

  getQStash(): QStashClient {
    if (!this.qstash) {
      this.qstash = new QStashClient({
        token: process.env.QSTASH_TOKEN!,
      });
    }
    return this.qstash;
  }
}

export const storage = new AppStorage();
