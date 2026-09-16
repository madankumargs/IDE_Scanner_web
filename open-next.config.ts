import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep OpenNext's incremental cache stateless until R2 is enabled for this
// account. Public HTML is protected by the Worker edge-cache wrapper, while
// Supabase and D1 remain the sources of truth for application data.
export default defineCloudflareConfig();
