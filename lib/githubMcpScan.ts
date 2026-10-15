import { randomUUID } from "node:crypto";
import { runtimeEnv } from "@/lib/runtimeEnv";

const GITHUB_API = "https://api.github.com";
const WORKFLOW = "mcp-scan.yml";
const BRANCH = "main";
const MAX_DESCRIPTOR_BYTES = 48 * 1024;
const REQUEST_ID_PATTERN = /^mcp-[0-9a-f-]{36}$/;

type GithubRun = {
  id: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
};

type GithubArtifact = {
  name?: string;
  expired?: boolean;
  archive_download_url?: string;
};

export type McpScanStatus =
  | { status: "queued" | "running"; request_id: string }
  | { status: "complete"; request_id: string; report: Record<string, unknown> }
  | { status: "failed"; request_id: string; error: string; run_url?: string };

export function githubMcpScanConfigured(): boolean {
  return Boolean(runtimeEnv("GITHUB_ACTIONS_TOKEN").trim() && runtimeEnv("MCP_SCAN_ENCRYPTION_KEY").trim());
}

export async function dispatchGithubMcpScan(raw: string): Promise<McpScanStatus> {
  const requestId = `mcp-${randomUUID()}`;
  const payloadBytes = new TextEncoder().encode(raw);
  if (payloadBytes.byteLength > MAX_DESCRIPTOR_BYTES) {
    throw new Error("This free MCP runner accepts descriptors up to 48 KiB.");
  }
  const payloadEnc = await encryptPayload(payloadBytes);
  if (payloadEnc.length > 64_000) {
    throw new Error("This free MCP runner accepts descriptors up to 48 KiB.");
  }

  const token = requireGithubToken();
  const { owner, repository } = githubRepository();
  const response = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${WORKFLOW}/dispatches`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ ref: BRANCH, inputs: { request_id: requestId, payload_enc: payloadEnc } }),
    },
  );
  if (!response.ok) throw new Error(`MCP runner dispatch failed (${response.status}).`);
  return { status: "queued", request_id: requestId };
}

export async function getGithubMcpScan(requestId: string): Promise<McpScanStatus> {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("Invalid MCP assessment request.");
  const token = requireGithubToken();
  const { owner, repository } = githubRepository();
  const runsResponse = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=${BRANCH}&per_page=20`,
    token,
  );
  if (!runsResponse.ok) throw new Error(`MCP runner status lookup failed (${runsResponse.status}).`);
  const runsBody = await runsResponse.json() as { workflow_runs?: GithubRun[] };
  const run = (runsBody.workflow_runs || []).find((candidate) => candidate.name === `MCP assessment ${requestId}`);
  if (!run) return { status: "queued", request_id: requestId };
  if (run.status !== "completed") return { status: "running", request_id: requestId };
  if (run.conclusion !== "success") {
    return { status: "failed", request_id: requestId, error: "The MCP runner did not complete successfully.", run_url: run.html_url };
  }

  const artifactsResponse = await githubFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${run.id}/artifacts`,
    token,
  );
  if (!artifactsResponse.ok) throw new Error(`MCP result lookup failed (${artifactsResponse.status}).`);
  const artifactsBody = await artifactsResponse.json() as { artifacts?: GithubArtifact[] };
  const artifact = (artifactsBody.artifacts || []).find((candidate) => candidate.name === `mcp-report-${requestId}` && !candidate.expired);
  if (!artifact?.archive_download_url) return { status: "running", request_id: requestId };

  const archiveResponse = await githubFetch(artifact.archive_download_url, token);
  if (!archiveResponse.ok) throw new Error(`MCP result download failed (${archiveResponse.status}).`);
  const report = await readReportArchive(await archiveResponse.arrayBuffer());
  return { status: "complete", request_id: requestId, report };
}

async function githubFetch(urlOrPath: string, token: string, init: RequestInit = {}): Promise<Response> {
  const url = urlOrPath.startsWith("https://") ? urlOrPath : `${GITHUB_API}${urlOrPath}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "guardrails-web",
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
}

function requireGithubToken(): string {
  const token = runtimeEnv("GITHUB_ACTIONS_TOKEN").trim();
  if (!token) throw new Error("MCP assessment runner is not configured.");
  return token;
}

function githubRepository(): { owner: string; repository: string } {
  return {
    owner: runtimeEnv("GITHUB_REPO_OWNER").trim() || "preethamak",
    repository: runtimeEnv("GITHUB_SCANNER_REPO").trim() || "IDE_Scanner",
  };
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = runtimeEnv("MCP_SCAN_ENCRYPTION_KEY").trim();
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("MCP assessment encryption is not configured correctly.");
  return globalThis.crypto.subtle.importKey("raw", raw as unknown as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptPayload(payload: Uint8Array): Promise<string> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await encryptionKey(), payload as unknown as BufferSource));
  const packet = new Uint8Array(nonce.byteLength + encrypted.byteLength);
  packet.set(nonce);
  packet.set(encrypted, nonce.byteLength);
  return encodeBase64(packet);
}

async function readReportArchive(archive: ArrayBuffer): Promise<Record<string, unknown>> {
  const bytes = new Uint8Array(archive);
  const view = new DataView(archive);
  const centralDirectory = 0x02014b50;
  const localFile = 0x04034b50;
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) !== centralDirectory) continue;
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const compression = view.getUint16(offset + 10, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));
    if (name !== "mcp-report.json" || view.getUint32(localOffset, true) !== localFile) continue;
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    const decoded = compression === 0
      ? compressed
      : compression === 8
        ? new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer())
        : null;
    if (!decoded) throw new Error("MCP result archive uses an unsupported compression method.");
    const report = JSON.parse(await decryptReport(new TextDecoder().decode(decoded))) as unknown;
    if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("MCP result was not a JSON object.");
    return report as Record<string, unknown>;
  }
  throw new Error("MCP result archive did not contain a report.");
}

async function decryptReport(encoded: string): Promise<string> {
  const packet = decodeBase64(encoded);
  if (packet.byteLength < 13) throw new Error("MCP result is truncated.");
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: packet.slice(0, 12) as unknown as BufferSource }, await encryptionKey(), packet.slice(12) as unknown as BufferSource);
  return new TextDecoder().decode(plaintext);
}
