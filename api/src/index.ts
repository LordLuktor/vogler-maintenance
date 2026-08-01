import "dotenv/config";
import express from "express";
// Must be imported right after express, before any routers are mounted — patches
// Express 4's router so thrown/rejected errors in async handlers reach the error
// middleware below instead of becoming unhandled rejections that crash the process.
import "express-async-errors";
import helmet from "helmet";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { locationsRouter } from "./routes/locations";
import { equipmentRouter } from "./routes/equipment";
import { ticketsRouter } from "./routes/tickets";
import { pmSchedulesRouter } from "./routes/pmSchedules";
import { usersRouter } from "./routes/users";
import { inventoryRouter } from "./routes/inventory";
import { assetsRouter } from "./routes/assets";
import { receiptsRouter } from "./routes/receipts";
import { UPLOAD_DIR } from "./services/upload";
import { startPmScheduler } from "./services/pmScheduler";

const app = express();

// Trust exactly one hop: Traefik is the only proxy in front of this container,
// so req.ip / X-Forwarded-For can be trusted for rate-limit keying.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.PUBLIC_APP_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  })
);
app.use(express.json({ limit: "1mb" }));

app.use("/uploads", express.static(UPLOAD_DIR));

app.use("/api/auth", authRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/pm-schedules", pmSchedulesRouter);
app.use("/api/users", usersRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/receipts", receiptsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Fail closed: unhandled errors never leak internals (stack traces, DB errors) to the client.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`vogler-maintenance API listening on :${port}`));

startPmScheduler();

// Last-resort net: anything that slips past express-async-errors (e.g. a rejection from
// outside the request lifecycle entirely) gets logged instead of taking the whole server
// down — a single dropped DB connection shouldn't cost every other request in flight.
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaught exception:", err);
});
