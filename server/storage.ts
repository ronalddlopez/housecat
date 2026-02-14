import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";

export interface IStorage {
  getRedis(): Redis;
  getQStash(): QStashClient;
}

export class AppStorage implements IStorage {
  getRedis(): Redis {
    return new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  getQStash(): QStashClient {
    return new QStashClient({
      token: process.env.QSTASH_TOKEN!,
    });
  }
}

export const storage = new AppStorage();
