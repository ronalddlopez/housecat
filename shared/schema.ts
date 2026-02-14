import { z } from "zod";

export const serviceStatusSchema = z.object({
  name: z.string(),
  status: z.enum(["connected", "key_set", "error", "missing"]),
  message: z.string().optional(),
});

export const healthCheckSchema = z.object({
  redis: z.string(),
  qstash: z.string(),
  tinyfish: z.string(),
  anthropic: z.string(),
  publicUrl: z.string(),
  overallStatus: z.enum(["all_green", "issues_detected"]),
});

export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type HealthCheck = z.infer<typeof healthCheckSchema>;

export const tinyfishResultSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  streamingUrl: z.string().optional(),
  error: z.string().optional(),
});

export type TinyfishResult = z.infer<typeof tinyfishResultSchema>;

export const agentResultSchema = z.object({
  success: z.boolean(),
  output: z.any().optional(),
  error: z.string().optional(),
});

export type AgentResult = z.infer<typeof agentResultSchema>;
