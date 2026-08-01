import fs from "fs";

// Docker secrets are mounted at /run/secrets/<name>; fall back to env var for local dev.
export function readSecret(name: string, envVar: string): string {
  const secretPath = `/run/secrets/${name}`;
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, "utf8").trim();
  }
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Missing required secret: ${envVar} (or /run/secrets/${name})`);
  }
  return value;
}
