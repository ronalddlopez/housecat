import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", async (_req, res) => {
    const status: Record<string, string> = {};

    try {
      const redis = storage.getRedis();
      await redis.set("health:ping", "pong");
      const val = await redis.get("health:ping");
      status.redis = val === "pong" ? "connected" : "error";
    } catch (e: any) {
      status.redis = `error: ${String(e.message || e).slice(0, 100)}`;
    }

    try {
      const qstash = storage.getQStash();
      await qstash.schedules.list();
      status.qstash = "connected";
    } catch (e: any) {
      status.qstash = `error: ${String(e.message || e).slice(0, 100)}`;
    }

    const tinyfishKey = process.env.TINYFISH_API_KEY || "";
    status.tinyfish = tinyfishKey.length > 0 ? "key_set" : "missing";

    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    status.anthropic = anthropicKey.length > 0 ? "key_set" : "missing";

    const publicUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.PUBLIC_URL || "http://localhost:5000";
    status.publicUrl = publicUrl;

    const allOk = ["redis", "qstash", "tinyfish", "anthropic"].every(
      (k) => status[k] === "connected" || status[k] === "key_set"
    );
    status.overallStatus = allOk ? "all_green" : "issues_detected";

    res.json(status);
  });

  app.post("/api/callback/:testId", (req, res) => {
    const { testId } = req.params;
    log(`QStash callback received for test: ${testId}`);
    res.json({ status: "received", testId });
  });

  app.post("/api/tests/:testId/run", (_req, res) => {
    const { testId } = _req.params;
    res.json({ status: "triggered", testId });
  });

  app.post("/api/test/tinyfish", async (_req, res) => {
    try {
      const tinyfishKey = process.env.TINYFISH_API_KEY;
      if (!tinyfishKey) {
        return res.json({ success: false, error: "TINYFISH_API_KEY not set" });
      }

      const response = await fetch(
        "https://agent.tinyfish.ai/v1/automation/run-sse",
        {
          method: "POST",
          headers: {
            "X-API-Key": tinyfishKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: "https://example.com",
            goal: 'What is the main heading on this page? Return JSON: {"heading": "..."}. Return valid JSON only.',
          }),
        }
      );

      if (!response.ok) {
        return res.json({
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return res.json({ success: false, error: "No response body" });
      }

      const decoder = new TextDecoder();
      let result: any = null;
      let streamingUrl: string | undefined;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "STREAMING_URL") {
              streamingUrl = data.streamingUrl;
            } else if (data.type === "COMPLETE") {
              result = data.resultJson;
            } else if (data.type === "ERROR") {
              return res.json({ success: false, error: data.message });
            }
          } catch {
          }
        }
      }

      res.json({ success: true, result, streamingUrl });
    } catch (e: any) {
      res.json({ success: false, error: String(e.message || e).slice(0, 200) });
    }
  });

  app.post("/api/test/agent", async (_req, res) => {
    try {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return res.json({ success: false, error: "ANTHROPIC_API_KEY not set" });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 100,
          messages: [
            {
              role: "user",
              content: "What is 2 + 2? Answer with just the number.",
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.json({
          success: false,
          error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        });
      }

      const data = await response.json();
      const answer =
        data.content?.[0]?.text || JSON.stringify(data.content);

      res.json({ success: true, output: { answer } });
    } catch (e: any) {
      res.json({ success: false, error: String(e.message || e).slice(0, 200) });
    }
  });

  app.post("/api/test/qstash", async (_req, res) => {
    try {
      const qstash = storage.getQStash();
      const publicUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.PUBLIC_URL || "http://localhost:5000";

      const result = await qstash.publishJSON({
        url: `${publicUrl}/api/callback/qstash-sanity-test`,
        body: { test: true, timestamp: Date.now() },
      });

      res.json({
        success: true,
        messageId: result.messageId,
      });
    } catch (e: any) {
      res.json({ success: false, error: String(e.message || e).slice(0, 200) });
    }
  });

  return httpServer;
}
