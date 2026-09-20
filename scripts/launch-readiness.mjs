import { spawnSync } from "node:child_process";
import "./verify-node-runtime.mjs";

const commands = [
  ["npm", ["run", "lint"]],
  ["npx", ["tsc", "--noEmit"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "test:public-corpus"]],
  ["npm", ["run", "test:e2e"]],
  ["npm", ["run", "build"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (process.argv.includes("--with-health")) {
  const baseUrl = process.env.LAUNCH_HEALTH_URL;
  const secret = process.env.LAUNCH_HEALTH_SECRET;
  if (!baseUrl || !secret) {
    console.error("LAUNCH_HEALTH_URL and LAUNCH_HEALTH_SECRET are required with --with-health.");
    process.exit(1);
  }
  const headers = { "x-guardrails-health-token": secret };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/launch-health`, { headers });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.healthy) {
    console.error(`Launch health failed: ${response.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
}

console.log("Launch readiness checks passed.");
