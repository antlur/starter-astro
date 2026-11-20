import { existsSync } from "node:fs";

for (const envFile of [".env.development.local", ".env.local", ".env.development", ".env"]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
