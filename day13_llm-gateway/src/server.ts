import express from "express";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { createChatRouter } from "./routes/chat.js";
import { audit } from "./audit/logger.js";
import { DeepSeekProvider } from "./providers/deepseek.js";
import type { Provider } from "./providers/types.js";

export function createApp(provider?: Provider) {
  const app = express();

  app.use(express.json({ limit: "64kb" }));

  app.use((req, _res, next) => {
    (req as any).id = nanoid(12);
    _res.setHeader("X-Request-ID", (req as any).id);
    next();
  });

  const limiter = rateLimit({
    windowMs: 60_000,
    max: config.rateLimitPerMin,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const requestId = (req as any).id as string;
      const ip = req.ip ?? "unknown";
      audit(
        {
          ts: new Date().toISOString(),
          requestId,
          ip,
          event: "rate_limit",
        },
        config.logDir
      );
      const retryAfter = Math.ceil(
        (res.getHeader("Retry-After") as number) ?? 60
      );
      res.status(429).json({
        requestId,
        error: "rate_limited",
        code: "rate_limited",
        retryAfter,
      });
    },
    keyGenerator: (req) => req.ip ?? "unknown",
  });

  app.use("/chat", limiter);

  const resolvedProvider =
    provider ?? new DeepSeekProvider(config.deepseekApiKey);
  app.use("/chat", createChatRouter(resolvedProvider));

  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const requestId = (req as any).id ?? "unknown";
      res.status(500).json({ requestId, error: "internal_error" });
    }
  );

  return app;
}

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.js"));

if (isMainModule) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`LLM Gateway listening on port ${config.port}`);
  });
}
