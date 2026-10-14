import { NextResponse } from "next/server";
import { rankAlternatives } from "@/lib/alternatives";
import { isValidGateCheck, lookupGateVerdict } from "@/lib/gateLookup";
import { getBadgeDecision, getExtensionProduct, getPublicAnalysisHistory, getPublicInventory, getVersionProduct, listCatalog } from "@/lib/productData";
import { publicDb } from "@/lib/supabase";
import { deriveTrustTier } from "@/lib/trustTiers";
import { validBearerSecret } from "@/lib/internalRunnerAuth";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { getActiveRuleCatalog } from "@/lib/activeRuleCatalog";
import { getPublicStatus } from "@/lib/publicStatus";
import { mcpOAuthToken } from "@/lib/mcpOAuth";
import { privateDb } from "@/lib/cloudflarePrivate";
import { requireTeamRole } from "@/lib/teams";
import { getWorkspaceState } from "@/lib/cloudflareWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MCP server (Streamable HTTP, stateless) for AI agents.
// Implements the JSON-RPC 2.0 subset the protocol requires — initialize,
// notifications/initialized, tools/list, tools/call — without an SDK
// dependency. Every POST is self-contained; no session state is kept.

const PROTOCOL_VERSION = "2025-06-18";
const EXTENSION_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/;
const MAX_BODY_BYTES = 64 * 1024;
const MCP_ACCESS_TOKEN_ENV = "MCP_ACCESS_TOKEN";
const WORKSPACE_TOOLS = new Set([
  "list_guardrails_workspaces",
  "get_workspace_extension_inventory",
  "get_workspace_monitoring",
  "get_workspace_policies",
  "get_workspace_decision_history",
  "get_workspace_audit_history",
]);

type JsonRpcId = string | number | null;
type JsonRpcRequest = { jsonrpc?: unknown; id?: JsonRpcId; method?: unknown; params?: unknown };

const TOOLS = [
  {
    name: "check_extension_risk",
    title: "Check extension risk",
    description:
      "Check the GuardRails public analysis verdict for an IDE extension before recommending or installing it. Returns the decision (allow/review/block), severity, public outcome, analysis coverage, a report URL, and a one-line recommendation. Pass a version to check the exact release; omit it to check the latest analyzed release.",
    inputSchema: {
      type: "object",
      properties: {
        extension: { type: "string", description: "Extension id in publisher.name form, e.g. ms-python.python" },
        version: { type: "string", description: "Exact release version, e.g. 1.2.3. Optional; defaults to the latest analyzed release." },
      },
      required: ["extension"],
    },
    outputSchema: {
      type: "object",
      required: ["extension", "version", "verdict", "recommendation"],
      properties: {
        extension: { type: "string" },
        version: { type: ["string", "null"] },
        verdict: { type: "string", enum: ["pass", "fail", "unreviewed"] },
        recommendation: { type: "string", enum: ["safe to recommend", "needs human review", "do not recommend"] },
        report_url: { type: ["string", "null"] },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "find_reputable_alternatives",
    title: "Find reputable alternatives",
    description:
      "Search the GuardRails public inventory for analyzed extensions matching a keyword query (name, publisher, or description) and return up to five ranked by reputability: allowed decisions first, then trust tier, verified publisher, and lower severity. Use this to suggest a safer alternative when an extension from an unknown publisher looks risky.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords describing the extension category, e.g. 'python linter'" },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      required: ["query", "alternatives"],
      properties: {
        query: { type: "string" },
        alternatives: { type: "array" },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "search_vscode_extensions",
    title: "Search VS Code extensions",
    description: "Search GuardRails' extension catalog by extension id, publisher, or name. Use this to identify the exact publisher.name before assessing a published extension package.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Extension name, publisher, or publisher.name identifier." }, limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum results. Defaults to 10." } }, required: ["query"] },
    outputSchema: { type: "object", required: ["query", "extensions"], properties: { query: { type: "string" }, extensions: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "get_extension_release",
    title: "Get extension release details",
    description: "Return the catalog and public analysis summary for a VS Code extension. Provide a version to inspect that exact release; omit it for the latest catalog release and its available analysis state. This does not claim an unscanned release is safe.",
    inputSchema: { type: "object", properties: { extension: { type: "string", description: "Extension id in publisher.name form." }, version: { type: "string", description: "Optional exact version." } }, required: ["extension"] },
    outputSchema: { type: "object", required: ["extension", "analysis_state"], properties: { extension: { type: "object" }, version: { type: ["object", "null"] }, analysis_state: { type: "string", enum: ["analyzed", "unreviewed", "not_found"] } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "list_published_extension_scans",
    title: "List published extension scans",
    description: "List recent publicly published GuardRails analyses. Use this for ecosystem research, not as proof about releases absent from the list.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum scans. Defaults to 20." }, offset: { type: "integer", minimum: 0, maximum: 10000, description: "Offset for pagination." } } },
    outputSchema: { type: "object", required: ["items", "totals"], properties: { items: { type: "array" }, totals: { type: "object" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_extension_scan_history",
    title: "Get published scan history",
    description: "Return the most recently published public analysis records, including exact extension versions, decisions, evidence confidence, and scan timestamps.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50, description: "Maximum history records. Defaults to 20." }, page: { type: "integer", minimum: 1, maximum: 1000, description: "Page number. Defaults to 1." } } },
    outputSchema: { type: "object", required: ["items", "total", "page"], properties: { items: { type: "array" }, total: { type: "integer" }, page: { type: "integer" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_guardrails_analysis_rules",
    title: "Get GuardRails analysis rules",
    description: "Return the currently published GuardRails rule catalog, including rule categories, evidence classes, severity defaults, and decision effects. Use this to explain what the extension-package analysis checks and its limits.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["rules"], properties: { policy_version: { type: ["string", "null"] }, ruleset_version: { type: "string" }, rules: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_guardrails_service_status",
    title: "Get GuardRails service status",
    description: "Return the current public GuardRails service status before relying on a scan or report lookup.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["overall"], properties: { overall: { type: "string" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_guardrails_workspaces",
    title: "List GuardRails workspaces",
    description: "List the GuardRails workspaces available to the signed-in MCP user. Requires the workspace:read OAuth scope.",
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", required: ["workspaces"], properties: { workspaces: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_workspace_extension_inventory",
    title: "Get workspace extension inventory",
    description: "Read a GuardRails workspace's observed IDE extension inventory, device summary, exact versions, scan state, and monitoring state. Requires workspace:read OAuth scope and workspace membership.",
    inputSchema: { type: "object", properties: { workspace_id: { type: "string", description: "GuardRails workspace ID." } }, required: ["workspace_id"] },
    outputSchema: { type: "object", required: ["workspace_id", "inventory"], properties: { workspace_id: { type: "string" }, inventory: { type: "object" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_workspace_monitoring",
    title: "Get workspace monitoring",
    description: "Read GuardRails workspace watchlist entries, monitoring status, release events, and active alerts. Requires workspace:read OAuth scope and workspace membership.",
    inputSchema: { type: "object", properties: { workspace_id: { type: "string", description: "GuardRails workspace ID." }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["workspace_id"] },
    outputSchema: { type: "object", required: ["workspace_id", "watchlist", "alerts", "release_events"], properties: { workspace_id: { type: "string" }, watchlist: { type: "array" }, alerts: { type: "array" }, release_events: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_workspace_policies",
    title: "Get workspace policies",
    description: "Read the enabled GuardRails workspace policy set and monitoring preferences. Requires workspace:read OAuth scope and workspace membership.",
    inputSchema: { type: "object", properties: { workspace_id: { type: "string", description: "GuardRails workspace ID." } }, required: ["workspace_id"] },
    outputSchema: { type: "object", required: ["workspace_id", "policies", "preferences"], properties: { workspace_id: { type: "string" }, policies: { type: "array" }, preferences: { type: "object" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_workspace_decision_history",
    title: "Get workspace decision history",
    description: "Read recorded extension decisions, rationale, owners, and evidence references for a GuardRails workspace. Requires workspace:read OAuth scope and workspace membership.",
    inputSchema: { type: "object", properties: { workspace_id: { type: "string", description: "GuardRails workspace ID." }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["workspace_id"] },
    outputSchema: { type: "object", required: ["workspace_id", "decisions"], properties: { workspace_id: { type: "string" }, decisions: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_workspace_audit_history",
    title: "Get workspace audit history",
    description: "Read the GuardRails workspace audit trail for decisions, monitoring, and policy activity. Requires workspace:read OAuth scope and workspace membership.",
    inputSchema: { type: "object", properties: { workspace_id: { type: "string", description: "GuardRails workspace ID." }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["workspace_id"] },
    outputSchema: { type: "object", required: ["workspace_id", "events"], properties: { workspace_id: { type: "string" }, events: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
] as const;

export async function GET() {
  return NextResponse.json(
    { error: "This MCP endpoint is stateless; use POST with JSON-RPC 2.0 messages." },
    { status: 405, headers: { Allow: "POST, OPTIONS" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}

export async function POST(request: Request) {
  const authorization = authorize(request);
  if (authorization) return authorization;
  if (contentLength(request) > MAX_BODY_BYTES) return rpcError(null, -32600, "Invalid request: body exceeds 64 KiB.", 413);
  let message: JsonRpcRequest;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return rpcError(null, -32600, "Invalid request: body exceeds 64 KiB.", 413);
    message = JSON.parse(raw) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error: request body must be JSON.");
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid request: batch messages are not supported.");
  }
  const id = message.id === undefined ? null : message.id;
  const method = typeof message.method === "string" ? message.method : "";
  const params = (message.params && typeof message.params === "object" ? message.params : {}) as Record<string, unknown>;
  const toolName = method === "tools/call" ? String(params.name || "") : "";
  const oauth = await mcpOAuthToken(request).catch(() => null);
  if (WORKSPACE_TOOLS.has(toolName) && (!oauth || !oauth.scopes.includes("workspace:read"))) return oauthRequired();

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "guardrails", version: "1.2.0" },
        instructions:
          "Read-only VS Code extension-package intelligence. Use search_vscode_extensions to resolve an exact publisher.name, then get_extension_release or check_extension_risk before recommending an install. An unreviewed result is not approval. GuardRails complements source-code, dependency, and repository scanners; it analyzes the extension artifact and its published release evidence. Early access has no write operations and 64 KiB request bodies.",
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      // Notifications carry no id and expect no body.
      return new Response(null, { status: 202 });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call":
      return handleToolCall(id, params, request, oauth?.userId || null);
    default:
      return rpcError(id, -32601, `Method not found: ${method || "(missing)"}`);
  }
}

async function handleToolCall(id: JsonRpcId, params: Record<string, unknown>, request: Request, userId: string | null) {
  const name = String(params.name || "");
  const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
  const origin = new URL(request.url).origin;
  try {
    if (name === "check_extension_risk") return rpcResult(id, await checkExtensionRisk(args, origin));
    if (name === "find_reputable_alternatives") return rpcResult(id, await findReputableAlternatives(args, origin));
    if (name === "search_vscode_extensions") return rpcResult(id, await searchVsCodeExtensions(args, origin));
    if (name === "get_extension_release") return rpcResult(id, await getExtensionRelease(args, origin));
    if (name === "list_published_extension_scans") return rpcResult(id, await listPublishedExtensionScans(args, origin));
    if (name === "get_extension_scan_history") return rpcResult(id, await getExtensionScanHistory(args, origin));
    if (name === "get_guardrails_analysis_rules") return rpcResult(id, await getAnalysisRules());
    if (name === "get_guardrails_service_status") return rpcResult(id, await getServiceStatus());
    if (name === "list_guardrails_workspaces") return rpcResult(id, await listGuardRailsWorkspaces(userId));
    if (name === "get_workspace_extension_inventory") return rpcResult(id, await getWorkspaceExtensionInventory(args, userId));
    if (name === "get_workspace_monitoring") return rpcResult(id, await getWorkspaceMonitoring(args, userId));
    if (name === "get_workspace_policies") return rpcResult(id, await getWorkspacePolicies(args, userId));
    if (name === "get_workspace_decision_history") return rpcResult(id, await getWorkspaceDecisionHistory(args, userId));
    if (name === "get_workspace_audit_history") return rpcResult(id, await getWorkspaceAuditHistory(args, userId));
    return rpcError(id, -32602, `Unknown tool: ${name || "(missing)"}`);
  } catch {
    return rpcResult(id, toolError("The analysis backend is temporarily unavailable. Try again shortly."));
  }
}

function recommendation(decision: string | null, verdict?: string): string {
  if (decision === "allow") return "safe to recommend";
  if (decision === "block" || verdict === "fail") return "do not recommend";
  return "needs human review";
}

async function checkExtensionRisk(args: Record<string, unknown>, origin: string) {
  const extension = String(args.extension || "").trim();
  const version = String(args.version || "").trim();
  if (!EXTENSION_PATTERN.test(extension)) {
    return toolError("Provide extension as publisher.name, e.g. ms-python.python.");
  }

  if (version) {
    const check = { extension, version };
    if (!isValidGateCheck(check)) return toolError("Provide a valid version string, e.g. 1.2.3.");
    const db = publicDb();
    if (!db) return toolError("The analysis backend is unavailable.");
    const result = await lookupGateVerdict(db, check, false);
    return toolJson({
      extension,
      version,
      verdict: result.verdict,
      decision: result.decision,
      severity: result.severity,
      public_outcome: result.public_outcome,
      coverage_percent: result.coverage_percent,
      reason: result.reason,
      report_url: result.report ? `${origin}${result.report}` : null,
      recommendation:
        result.verdict === "unreviewed"
          ? "needs human review"
          : recommendation(result.decision, result.verdict),
    });
  }

  const decision = await getBadgeDecision(extension);
  if (!decision.found || !decision.decision) {
    return toolJson({
      extension,
      version: null,
      verdict: "unreviewed",
      decision: null,
      severity: null,
      public_outcome: null,
      reason: "No completed public analysis exists for this extension. This is not an approval.",
      report_url: `${origin}/extensions/${encodeURIComponent(extension)}`,
      recommendation: "needs human review",
    });
  }
  const tier = deriveTrustTier(decision);
  return toolJson({
    extension,
    version: decision.version,
    verdict: decision.decision === "allow" ? "pass" : "fail",
    decision: decision.decision,
    severity: null,
    public_outcome: decision.public_outcome,
    trust_tier: tier.tier,
    trust_summary: tier.summary,
    scanned_at: decision.scanned_at,
    reason: `Latest completed public analysis of version ${decision.version} decided "${decision.decision}".`,
    report_url: `${origin}/extensions/${encodeURIComponent(extension)}`,
    recommendation: recommendation(decision.decision),
  });
}

async function findReputableAlternatives(args: Record<string, unknown>, origin: string) {
  const query = String(args.query || "").trim();
  if (!query) return toolError("Provide a non-empty query, e.g. 'python linter'.");
  const inventory = await getPublicInventory();
  const ranked = rankAlternatives(inventory.items, query, 5);
  if (!ranked.length) {
    return toolJson({
      query,
      alternatives: [],
      note: "No analyzed extension in the public inventory matched this query. Absence from the inventory is not a judgment.",
    });
  }
  return toolJson({
    query,
    alternatives: ranked.map((item) => ({
      extension: item.extension_id,
      display_name: item.display_name,
      version: item.version,
      publisher: item.publisher,
      publisher_verified: item.publisher_verified,
      decision: item.decision,
      severity: item.severity,
      trust_tier: item.trust_tier,
      report_url: `${origin}${item.report_path}`,
    })),
  });
}

function boundedInteger(value: unknown, fallback: number, maximum: number, minimum = 1): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

async function searchVsCodeExtensions(args: Record<string, unknown>, origin: string) {
  const query = String(args.query || "").trim();
  if (!query) return toolError("Provide an extension name, publisher, or publisher.name identifier.");
  const extensions = await listCatalog(query, boundedInteger(args.limit, 10, 20));
  return toolJson({
    query,
    extensions: extensions.map((item) => ({
      extension: item.id,
      display_name: item.display_name,
      publisher: item.publisher,
      publisher_verified: item.publisher_verified,
      latest_version: item.latest_version || null,
      scan_supported: item.scan_supported ?? null,
      scan_support_reason: item.scan_support_reason || null,
      extension_url: `${origin}/extensions/${encodeURIComponent(item.id)}`,
    })),
    note: "Search identifies a published extension. Resolve the exact release before making a security recommendation.",
  });
}

async function getExtensionRelease(args: Record<string, unknown>, origin: string) {
  const extension = String(args.extension || "").trim();
  const version = String(args.version || "").trim();
  if (!EXTENSION_PATTERN.test(extension)) return toolError("Provide extension as publisher.name, e.g. ms-python.python.");
  const product = version ? await getVersionProduct(extension, version) : await getExtensionProduct(extension);
  if (!product) return toolJson({ extension, version: version || null, analysis_state: "not_found", note: "No matching extension or published release was found." });
  const record = product as Record<string, unknown>;
  const scan = record.scan && typeof record.scan === "object" ? record.scan as Record<string, unknown> : null;
  const versionRow = version ? record.version : null;
  const extensionRecord = version ? { id: extension } : record.extension;
  const scanId = scan?.id ? String(scan.id) : null;
  const scannedVersion = version || String((scan?.version || (extensionRecord as Record<string, unknown> | null)?.latest_version || ""));
  return toolJson({
    extension: extensionRecord,
    version: versionRow,
    scan: scan ? compactScan(scan) : null,
    analysis_state: scan ? "analyzed" : "unreviewed",
    report_url: scanId && scannedVersion ? `${origin}/extensions/${encodeURIComponent(extension)}/versions/${encodeURIComponent(scannedVersion)}/scans/${encodeURIComponent(scanId)}` : `${origin}/extensions/${encodeURIComponent(extension)}`,
    note: scan ? "This analysis applies only to the returned release and artifact evidence." : "No completed published analysis is available for this release. This is not an approval.",
  });
}

function compactScan(scan: Record<string, unknown>) {
  const keys = ["id", "extension_id", "version", "decision", "severity", "public_outcome", "decision_reason", "evidence_confidence", "coverage_percent", "artifact_sha256", "scanned_at", "scanner_build", "ruleset_version", "analysis_status"];
  return Object.fromEntries(keys.filter((key) => scan[key] !== undefined).map((key) => [key, scan[key]]));
}

async function listPublishedExtensionScans(args: Record<string, unknown>, origin: string) {
  const inventory = await getPublicInventory(boundedInteger(args.limit, 20, 50), boundedInteger(args.offset, 0, 10000, 0));
  return toolJson({
    items: inventory.items.map((item) => ({ ...item, report_url: `${origin}/extensions/${encodeURIComponent(item.extension_id)}/versions/${encodeURIComponent(item.version)}/scans/${encodeURIComponent(item.scan_id)}` })),
    totals: inventory.totals,
    publication: inventory.publication || null,
    availability: inventory.availability || "available",
    note: "Only published public analyses appear here. Releases absent from this list are not assessed by this result.",
  });
}

async function getExtensionScanHistory(args: Record<string, unknown>, origin: string) {
  const page = boundedInteger(args.page, 1, 1000);
  const history = await getPublicAnalysisHistory(boundedInteger(args.limit, 20, 50), (page - 1) * boundedInteger(args.limit, 20, 50));
  return toolJson({ ...history, page, page_size: boundedInteger(args.limit, 20, 50), items: history.items.map((item) => ({ ...item, report_url: `${origin}/extensions/${encodeURIComponent(item.extension_id)}/versions/${encodeURIComponent(item.version)}/scans/${encodeURIComponent(item.scan_id)}` })) });
}

async function getAnalysisRules() {
  const catalog = await getActiveRuleCatalog();
  if (!catalog) return toolError("The active published rule catalog is temporarily unavailable.");
  return toolJson({
    policy_version: catalog.policyVersion,
    ruleset_version: catalog.rulesetVersion,
    score_schema_version: catalog.scoreSchemaVersion,
    scanner_build: catalog.scannerBuild,
    rules: catalog.rules.map((rule) => ({ rule_id: rule.id, title: rule.title, category: rule.category, evidence_class: rule.evidence, default_severity: rule.severity, description: rule.description, recommendation: rule.recommendation, decision_effect: rule.decisionEffect, confidence_basis: rule.confidenceBasis, false_positive_notes: rule.falsePositiveNotes })),
  });
}

async function getServiceStatus() {
  return toolJson(await getPublicStatus() as Record<string, unknown>);
}

async function listGuardRailsWorkspaces(userId: string | null) {
  if (!userId) return toolError("OAuth workspace authorization is required.");
  const rows = await privateDb().prepare("SELECT t.id,t.name,t.slug,t.created_at,m.role FROM app_team_members m JOIN app_teams t ON t.id=m.team_id WHERE m.user_id=? ORDER BY t.created_at").bind(userId).all<Record<string, unknown>>();
  return toolJson({ workspaces: rows.results.map((row) => ({ id: String(row.id), name: String(row.name), slug: String(row.slug), role: String(row.role), created_at: String(row.created_at) })) });
}

async function workspaceForMcp(args: Record<string, unknown>, userId: string | null) {
  const workspaceId = String(args.workspace_id || "").trim();
  if (!workspaceId) return { error: toolError("workspace_id is required.") } as const;
  if (!userId) return { error: toolError("OAuth workspace authorization is required.") } as const;
  await requireTeamRole(workspaceId, userId, ["owner", "admin", "analyst", "viewer"]);
  return { workspaceId, state: await getWorkspaceState(workspaceId) } as const;
}

async function getWorkspaceExtensionInventory(args: Record<string, unknown>, userId: string | null) {
  const workspace = await workspaceForMcp(args, userId);
  if ("error" in workspace) return workspace.error;
  const installations = workspace.state.inventory.installations;
  return toolJson({ workspace_id: workspace.workspaceId, inventory: { devices: workspace.state.inventory.devices, installations, last_import_at: workspace.state.inventory.last_import_at, summary: { devices: workspace.state.inventory.devices.length, installations: installations.length, unique_extensions: new Set(installations.map((item) => String(item.extension_id).toLowerCase())).size, monitored: installations.filter((item) => workspace.state.watchlist.some((watch) => String(watch.extension_id).toLowerCase() === String(item.extension_id).toLowerCase())).length } } });
}

async function getWorkspaceMonitoring(args: Record<string, unknown>, userId: string | null) {
  const workspace = await workspaceForMcp(args, userId);
  if ("error" in workspace) return workspace.error;
  const limit = boundedInteger(args.limit, 50, 100);
  return toolJson({ workspace_id: workspace.workspaceId, monitoring: workspace.state.monitoring || null, watchlist: workspace.state.watchlist.slice(0, limit), alerts: workspace.state.alerts.slice(0, limit), release_events: workspace.state.release_events.filter((event) => String(event.state) !== "superseded").slice(0, limit) });
}

async function getWorkspacePolicies(args: Record<string, unknown>, userId: string | null) {
  const workspace = await workspaceForMcp(args, userId);
  if ("error" in workspace) return workspace.error;
  return toolJson({ workspace_id: workspace.workspaceId, policies: workspace.state.policies, preferences: workspace.state.preferences });
}

async function getWorkspaceDecisionHistory(args: Record<string, unknown>, userId: string | null) {
  const workspace = await workspaceForMcp(args, userId);
  if ("error" in workspace) return workspace.error;
  return toolJson({ workspace_id: workspace.workspaceId, decisions: workspace.state.decisions.slice(0, boundedInteger(args.limit, 50, 100)) });
}

async function getWorkspaceAuditHistory(args: Record<string, unknown>, userId: string | null) {
  const workspace = await workspaceForMcp(args, userId);
  if ("error" in workspace) return workspace.error;
  return toolJson({ workspace_id: workspace.workspaceId, events: workspace.state.audit.slice(0, boundedInteger(args.limit, 50, 100)) });
}

function toolJson(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: false,
  };
}

function toolError(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, result },
    { headers: rpcHeaders() },
  );
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: rpcHeaders() },
  );
}

function authorize(request: Request): NextResponse | null {
  const accessToken = runtimeEnv(MCP_ACCESS_TOKEN_ENV).trim();
  const requireAuth = runtimeEnv("MCP_REQUIRE_AUTH").trim().toLowerCase() === "true";
  if (!accessToken && !requireAuth) return null;
  if (!accessToken) {
    return NextResponse.json({ error: "MCP authentication is required but not configured." }, { status: 503, headers: { ...rpcHeaders(), "WWW-Authenticate": 'Bearer realm="guardrails-mcp"' } });
  }
  if (validBearerSecret(request.headers.get("authorization"), accessToken)) return null;
  return NextResponse.json({ error: "Unauthorized MCP request." }, { status: 401, headers: { ...rpcHeaders(), "WWW-Authenticate": 'Bearer realm="guardrails-mcp"' } });
}

function oauthRequired() {
  return NextResponse.json(
    { error: "OAuth authorization with workspace:read is required for GuardRails workspace tools." },
    { status: 401, headers: { ...rpcHeaders(), "WWW-Authenticate": 'Bearer resource_metadata="https://abscissa.dev/.well-known/oauth-protected-resource/api/mcp", scope="workspace:read"' } },
  );
}

function contentLength(request: Request): number {
  const value = Number(request.headers.get("content-length") || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function rpcHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", "MCP-Protocol-Version": PROTOCOL_VERSION, "X-Content-Type-Options": "nosniff" };
}
