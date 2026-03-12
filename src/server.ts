import Fastify from "fastify";
import { registerPartnerRoutes } from "./routes/partnerRoutes.js";

const app = Fastify({
  logger: {
    level: "info",
  },
});

app.addHook("onRequest", async (request) => {
  (request as typeof request & { startTimeMs: number }).startTimeMs = performance.now();
});

app.addHook("onResponse", async (request, reply) => {
  const startTime = (request as typeof request & { startTimeMs?: number }).startTimeMs;
  const durationMs = startTime === undefined ? 0 : Math.round((performance.now() - startTime) * 100) / 100;
  app.log.info(
    {
      event: "http.response",
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: durationMs,
    },
    "Request completed",
  );
});

app.get("/health", async () => {
  return {
    status: "ok",
    service: "juniper",
  };
});

registerPartnerRoutes(app);

const port = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info({ port }, "Juniper API started");
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  }
}

void start();
