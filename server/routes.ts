import type { Express } from "express";
import { type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      pathRewrite: undefined,
      timeout: 120000,
      proxyTimeout: 120000,
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.path = req.originalUrl;
        },
      },
    })
  );

  return httpServer;
}
