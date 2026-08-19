import type { Knex } from "knex";
import path from "path";
import { readSecret } from "./secrets";

function dbPassword(): string {
  return readSecret("vogler_db_password", "DB_PASSWORD");
}

// Paths are __dirname-relative so this resolves the same whether run via tsx from
// src/ in dev, or as compiled dist/knexfile.js sitting next to dist/migrations in prod.
const config: Knex.Config = {
  client: "pg",
  connection: {
    host: process.env.DB_HOST || "postgres",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "vogler",
    password: dbPassword(),
    database: process.env.DB_NAME || "vogler_maintenance",
    // TCP keepalive so a connection sitting idle in the pool over the Docker overlay
    // network doesn't go silently stale and get handed to a request as already-dead.
    keepAlive: true
  },
  migrations: {
    directory: path.join(__dirname, "migrations"),
    extension: process.env.NODE_ENV === "production" ? "js" : "ts"
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
    extension: process.env.NODE_ENV === "production" ? "js" : "ts"
  },
  pool: {
    min: 0,
    max: 10,
    // Recycle idle connections well before they'd otherwise go stale over the Docker
    // overlay network — this app is low-traffic enough that opening a fresh connection
    // per burst of requests is cheap, and it beats handing out a connection that died
    // silently while sitting idle in the pool (the original bug this pool config is
    // hardened against: an already-dead pooled connection failing a live request with
    // a 500 instead of the pool never having kept it around long enough to go stale).
    idleTimeoutMillis: 10000,
    // node-postgres emits an "error" event on idle clients when a connection drops
    // unexpectedly (network blip, DB restart, etc.) — with no listener, that becomes
    // an uncaught exception and kills the whole process. Attaching one here just logs it
    // and lets the pool recycle the connection instead of crashing the API.
    afterCreate: (conn: { on: (event: string, cb: (err: Error) => void) => void }, done: (err: Error | null, conn: unknown) => void) => {
      conn.on("error", (err: Error) => {
        console.error("[db] idle connection error:", err);
      });
      done(null, conn);
    }
  }
};

export default config;
