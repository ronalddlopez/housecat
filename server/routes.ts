import type { Express, Request } from "express";
import { type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getAuth } from "@clerk/express";

const PUBLIC_API_PREFIXES = [
  "/api/health",
  "/api/callback/",
  "/api/auth/",
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth gate: require Clerk session for non-public API routes
  // Also stashes userId on the request for the proxy to forward
  app.use("/api", (req, res, next) => {
    const isPublic = PUBLIC_API_PREFIXES.some((prefix) =>
      req.originalUrl.startsWith(prefix)
    );
    if (isPublic) return next();

    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    (req as any)._clerkUserId = userId;
    next();
  });

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
          proxyReq.path = (req as Request).originalUrl;

          // Forward Clerk user ID to FastAPI
          const userId = (req as any)._clerkUserId as string | undefined;
          if (userId) {
            proxyReq.setHeader("X-Clerk-User-Id", userId);
          }
        },
      },
    })
  );

  return httpServer;
}
