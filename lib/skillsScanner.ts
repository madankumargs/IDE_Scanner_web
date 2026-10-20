import { createHash } from "node:crypto";
import {
  decideSkillScan,
  scoreSkillFindings,
  skillAnalyzers,
  skillDetectionMatrix,
  type SkillCoverage,
  type SkillEvidenceClass,
  type SkillFinding,
  type SkillRule,
} from "@/lib/skillsMatrix";

export type SkillAnalyzerId = "manifest" | "instructions" | "scripts" | "deps" | "archive" | "intel" | "sandbox_probe";

export type SkillTreeEntry = {
  path: string;
  mode?: string;
  type: "blob" | "tree" | "commit" | "symlink" | string;
  size?: number;
};

export type SkillFile = {
  path: string;
  content: string;
  size: number;
};

export type SkillSource = {
  requestedUrl: string;
  owner: string;
  repo: string;
  ref: string;
  commit: string;
  skillPath: string;
  pinned: boolean;
  canonicalUrl: string;
  commitUrl: string;
};

export type SkillScanReport = {
  source: SkillSource;
  artifact: {
    contentHash: string;
    fileCount: number;
    fetchedFileCount: number;
    bytes: number;
  };
  decision: ReturnType<typeof decideSkillScan>;
  scores: ReturnType<typeof scoreSkillFindings>;
  coverage: SkillCoverage;
  findings: SkillFinding[];
  limitations: string[];
  scannedAt: string;
};

type ParsedSource = {
  requestedUrl: string;
  owner: string;
  repo: string;
  requestedRef?: string;
  requestedPath: string;
};

type DependencyTarget = {
  ecosystem: "npm" | "PyPI";
  name: string;
  version?: string;
  file: string;
};

type VulnerableDependency = DependencyTarget & { id?: string };

type StaticScanOptions = {
  source: SkillSource;
  treeEntries: SkillTreeEntry[];
  files: SkillFile[];
  sourcePinned: boolean;
  limitations?: string[];
  completedAnalyzers?: Partial<Record<SkillAnalyzerId, boolean>>;
  intelMatches?: Array<{ id?: string; explanation?: string }>;
  vulnerableDependencies?: VulnerableDependency[];
};

type GitHubRepository = { default_branch: string };
type GitHubCommit = { sha: string };
type GitHubTree = { tree: SkillTreeEntry[]; truncated?: boolean };

export type PublicGitHubSkillCandidate = {
  sourceUrl: string;
  owner: string;
  repo: string;
  commit: string;
  skillPath: string;
};

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 80;
const REQUEST_TIMEOUT_MS = 10_000;
const SCRIPT_EXTENSIONS = new Set([".bat", ".cmd", ".js", ".mjs", ".ps1", ".py", ".rb", ".sh", ".ts"]);
const BINARY_EXTENSIONS = new Set([".7z", ".bin", ".dll", ".dylib", ".exe", ".gif", ".jpg", ".jpeg", ".node", ".png", ".so", ".tar", ".gz", ".zip"]);
const TRUSTED_SCRIPT_HOSTS = new Set(["api.github.com", "github.com", "raw.githubusercontent.com", "objects.githubusercontent.com", "pypi.org", "registry.npmjs.org"]);
const SENSITIVE_SOURCE_PATTERN = /(?:\.env|id_rsa|credentials|cookies?|api[_-]?key|access[_-]?token|password|process\.env|os\.environ|secret(?:s)?\.(?:json|txt)|secret[_-]?file)/i;
const ruleById = new Map<string, SkillRule>(skillDetectionMatrix.map((rule) => [rule.id, rule]));

export class SkillScanError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_source" | "not_skill" | "source_unavailable" | "source_too_large" | "intel_unavailable",
    public readonly status = 422,
  ) {
    super(message);
    this.name = "SkillScanError";
  }
}

function normalizePath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new SkillScanError("The requested skill path is not a safe repository path.", "invalid_source");
  }
  return normalized;
}

function decodeSegment(segment: string) {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new SkillScanError("The source URL contains an invalid encoded path.", "invalid_source");
  }
  if (decoded.includes("/") || decoded === "." || decoded === ".." || !decoded) {
    throw new SkillScanError("The source URL contains an unsafe path segment.", "invalid_source");
  }
  return decoded;
}

export function parsePublicGitHubSkillUrl(input: string): ParsedSource {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SkillScanError("Enter a complete public GitHub URL.", "invalid_source");
  }
  if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.search || url.hash) {
    throw new SkillScanError("Skills scanning accepts only public HTTPS GitHub URLs without credentials or query state.", "invalid_source");
  }
  const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
  if (segments.length < 2) throw new SkillScanError("The GitHub URL must include an owner and repository.", "invalid_source");
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new SkillScanError("The GitHub owner or repository name is invalid.", "invalid_source");
  }
  if (segments.length === 2) return { requestedUrl: url.toString(), owner, repo, requestedPath: "" };
  if (!["tree", "blob"].includes(segments[2]) || segments.length < 4) {
    throw new SkillScanError("Use a repository URL or a GitHub tree/blob URL for one Skill.", "invalid_source");
  }
  const requestedRef = segments[3];
  const requestedPath = segments.slice(4).join("/");
  if (!requestedPath) throw new SkillScanError("The GitHub URL needs a Skill directory or SKILL.md path.", "invalid_source");
  return { requestedUrl: url.toString(), owner, repo, requestedRef, requestedPath };
}

async function readLimitedResponse(response: Response, limit: number) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > limit) throw new SkillScanError("The public source is larger than the scanner safety limit.", "source_too_large", 413);
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) throw new SkillScanError("The public source is larger than the scanner safety limit.", "source_too_large", 413);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new SkillScanError("The public source is larger than the scanner safety limit.", "source_too_large", 413);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

async function githubRequest<T>(url: string, init?: RequestInit, limit = MAX_JSON_BYTES): Promise<T> {
  let response: Response;
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "GuardRails-Skills-Scanner/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SkillScanError(error instanceof Error ? `Public source request failed: ${error.message}` : "Public source request failed.", "source_unavailable", 502);
  }
  const body = await readLimitedResponse(response, limit);
  if (!response.ok) {
    if (response.status === 404) throw new SkillScanError("The public GitHub source or requested ref was not found.", "source_unavailable", 404);
    throw new SkillScanError(`GitHub returned HTTP ${response.status} while reading the public source.`, "source_unavailable", 502);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SkillScanError("GitHub returned an invalid source response.", "source_unavailable", 502);
  }
}

async function githubText(url: string) {
  let response: Response;
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  try {
    response = await fetch(url, {
      headers: { Accept: "text/plain", "User-Agent": "GuardRails-Skills-Scanner/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new SkillScanError(error instanceof Error ? `Public file request failed: ${error.message}` : "Public file request failed.", "source_unavailable", 502);
  }
  if (!response.ok) throw new SkillScanError(`GitHub returned HTTP ${response.status} while reading a Skill file.`, "source_unavailable", 502);
  return readLimitedResponse(response, MAX_FILE_BYTES);
}

function selectedSkillPaths(parsed: ParsedSource, tree: GitHubTree) {
  const allSkillPaths = tree.tree
    .filter((entry) => entry.type === "blob" && basename(entry.path) === "SKILL.md")
    .map((entry) => entry.path);
  const requestedRoot = parsed.requestedPath === "SKILL.md"
    ? ""
    : parsed.requestedPath
      ? normalizePath(parsed.requestedPath.endsWith("/SKILL.md") ? dirname(parsed.requestedPath) : parsed.requestedPath)
      : "";
  const matching = allSkillPaths.filter((path) => !requestedRoot || path === `${requestedRoot}/SKILL.md` || (requestedRoot === "" && path === "SKILL.md"));
  return { matching, requestedRoot };
}

export async function discoverPublicGitHubSkillUrls(input: string, maxSkills = 100): Promise<PublicGitHubSkillCandidate[]> {
  const parsed = parsePublicGitHubSkillUrl(input);
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const repository = await githubRequest<GitHubRepository>(repoUrl);
  const requestedRef = parsed.requestedRef || repository.default_branch;
  const commit = await githubRequest<GitHubCommit>(`${repoUrl}/commits/${encodeURIComponent(requestedRef)}`);
  if (!/^[a-f0-9]{40}$/i.test(commit.sha)) throw new SkillScanError("GitHub did not return an immutable commit SHA.", "source_unavailable", 502);
  const tree = await githubRequest<GitHubTree>(`${repoUrl}/git/trees/${commit.sha}?recursive=1`);
  const { matching } = selectedSkillPaths(parsed, tree);
  return matching.slice(0, Math.max(1, Math.min(maxSkills, 100))).map((path) => ({
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}/tree/${commit.sha}/${path}`,
    owner: parsed.owner,
    repo: parsed.repo,
    commit: commit.sha,
    skillPath: dirname(path),
  }));
}

function basename(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function dirname(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function extension(path: string) {
  const name = basename(path).toLowerCase();
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

function isTextCandidate(path: string) {
  const name = basename(path).toLowerCase();
  return !BINARY_EXTENSIONS.has(extension(path)) || ["license", "makefile", "procfile", "skill.md"].includes(name);
}

function canonicalContentHash(treeEntries: SkillTreeEntry[], files: SkillFile[]) {
  const contents = new Map(files.map((file) => [file.path, file.content.replace(/\r\n?/g, "\n")]));
  const hash = createHash("sha256");
  [...treeEntries].sort((a, b) => a.path.localeCompare(b.path)).forEach((entry) => {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.type);
    hash.update("\0");
    hash.update(entry.mode || "");
    hash.update("\0");
    hash.update(String(entry.size ?? ""));
    hash.update("\0");
    hash.update(contents.get(entry.path) || "");
    hash.update("\0");
  });
  return hash.digest("hex");
}

function lineContext(content: string, index: number) {
  const normalized = content.replace(/\r\n?/g, "\n");
  const line = normalized.slice(0, index).split("\n").length;
  const raw = normalized.split("\n")[line - 1] || "";
  const snippet = raw
    .replace(/((?:api[_-]?key|token|secret|password|credential)[^:=]{0,20}[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
    .trim()
    .slice(0, 220);
  return { line, snippet };
}

function scalar(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function parseManifest(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return { valid: false, fields: {} as Record<string, string>, body: content };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) return { valid: false, fields: {} as Record<string, string>, body: content };
  const fields: Record<string, string> = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (["|", ">"].includes(rawValue.trim())) {
      const continuation: string[] = [];
      for (let next = index + 1; next < end && /^\s+/.test(lines[next]); next += 1) continuation.push(lines[next].trim());
      fields[key.toLowerCase()] = continuation.join(rawValue.trim() === ">" ? " " : "\n");
    } else fields[key.toLowerCase()] = scalar(rawValue);
  }
  return { valid: true, fields, body: lines.slice(end + 1).join("\n") };
}

function addPattern(
  findings: SkillFinding[],
  seen: Set<string>,
  ruleId: string,
  file: string,
  content: string,
  pattern: RegExp,
  evidenceClass: SkillEvidenceClass,
  confidence: number,
  explanation: string,
) {
  const match = content.match(pattern);
  if (!match || match.index === undefined) return false;
  const rule = ruleById.get(ruleId);
  if (!rule) return false;
  const context = lineContext(content, match.index);
  const key = `${ruleId}:${file}:${context.line}`;
  if (seen.has(key)) return true;
  seen.add(key);
  findings.push({ ruleId, title: rule.title, severity: rule.severity, evidenceClass, confidence, dimension: rule.dimension, file, line: context.line, endLine: context.line, snippet: context.snippet, explanation });
  return true;
}

function addDirect(
  findings: SkillFinding[],
  seen: Set<string>,
  ruleId: string,
  file: string,
  evidenceClass: SkillEvidenceClass,
  confidence: number,
  explanation: string,
  snippet?: string,
  line?: number,
) {
  const rule = ruleById.get(ruleId);
  if (!rule) return;
  const key = `${ruleId}:${file}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ ruleId, title: rule.title, severity: rule.severity, evidenceClass, confidence, dimension: rule.dimension, file, line, endLine: line, snippet, explanation });
}

function scriptNetworkHost(content: string) {
  const urls = [...content.matchAll(/https?:\/\/[^\s'"`)>]+/gi)].map((match) => match[0]);
  if (!urls.length) return { matched: /\b(?:requests?\.(?:get|post|put)|urllib\.|fetch\(|curl\b|wget\b|http\.request)/i.test(content), trusted: false };
  const untrusted = urls.some((url) => {
    try {
      return !TRUSTED_SCRIPT_HOSTS.has(new URL(url).hostname.toLowerCase());
    } catch {
      return true;
    }
  });
  return { matched: true, trusted: !untrusted };
}

function collectDependencies(files: SkillFile[]): DependencyTarget[] {
  const targets: DependencyTarget[] = [];
  for (const file of files) {
    const name = basename(file.path).toLowerCase();
    if (name === "package.json") {
      try {
        const manifest = JSON.parse(file.content) as Record<string, unknown>;
        for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
          const dependencies = manifest[field];
          if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
          for (const [dependency, version] of Object.entries(dependencies as Record<string, unknown>)) targets.push({ ecosystem: "npm", name: dependency, version: typeof version === "string" ? version : undefined, file: file.path });
        }
      } catch {
        // Invalid package metadata is handled by the manifest coverage result, not guessed as a dependency.
      }
    }
    if (["requirements.txt", "requirements-dev.txt", "constraints.txt"].includes(name)) {
      for (const line of file.content.split(/\r?\n/)) {
        const match = line.trim().match(/^([A-Za-z0-9_.-]+)\s*(?:==\s*([^\s;]+))?/);
        if (match) targets.push({ ecosystem: "PyPI", name: match[1], version: match[2], file: file.path });
      }
    }
  }
  return targets;
}

async function queryOsv(targets: DependencyTarget[]) {
  const queries = targets.slice(0, 40).map((target) => ({ package: { ecosystem: target.ecosystem, name: target.name }, ...(target.version ? { version: target.version } : {}) }));
  if (!queries.length) return { vulnerabilities: [] as VulnerableDependency[], available: true };
  try {
    const response = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json", "User-Agent": "GuardRails-Skills-Scanner/1.0" },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return { vulnerabilities: [] as VulnerableDependency[], available: false };
    const payload = JSON.parse(await readLimitedResponse(response, MAX_JSON_BYTES)) as { results?: Array<{ vulns?: Array<{ id?: string }> }> };
    const vulnerabilities: VulnerableDependency[] = [];
    targets.slice(0, 40).forEach((target, index) => (payload.results?.[index]?.vulns || []).forEach((vulnerability) => vulnerabilities.push({ ...target, id: vulnerability.id })));
    return { vulnerabilities, available: true };
  } catch {
    return { vulnerabilities: [] as VulnerableDependency[], available: false };
  }
}

async function loadIntel(contentHash: string) {
  const configured = process.env.SKILLS_INTEL_URL?.trim();
  if (!configured && !process.env.SKILLS_INTEL_HASHES) return { available: false, matches: [] as Array<{ id?: string; explanation?: string }> };
  const hashes = new Set((process.env.SKILLS_INTEL_HASHES || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== "https:") throw new Error("intel feed must use HTTPS");
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "GuardRails-Skills-Scanner/1.0" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`intel HTTP ${response.status}`);
      const payload = JSON.parse(await readLimitedResponse(response, 256 * 1024)) as { hashes?: string[] } | string[];
      const feedHashes = Array.isArray(payload) ? payload : payload.hashes || [];
      feedHashes.forEach((hash) => hashes.add(String(hash).toLowerCase()));
    } catch {
      return { available: false, matches: [] as Array<{ id?: string; explanation?: string }> };
    }
  }
  return { available: true, matches: hashes.has(contentHash.toLowerCase()) ? [{ id: "content-hash", explanation: "The immutable Skill snapshot matched the configured malicious-intelligence hash feed." }] : [] };
}

export function scanSkillFiles(options: StaticScanOptions): SkillScanReport {
  const files = options.files.map((file) => ({ ...file, content: file.content.replace(/\r\n?/g, "\n") }));
  const fileMap = new Map(files.map((file) => [file.path, file]));
  const skillFile = files.find((file) => basename(file.path) === "SKILL.md");
  const findings: SkillFinding[] = [];
  const seen = new Set<string>();
  const limitations = [...new Set(options.limitations || [])];
  const add = (ruleId: string, file: string, evidenceClass: SkillEvidenceClass, confidence: number, explanation: string, snippet?: string) => addDirect(findings, seen, ruleId, file, evidenceClass, confidence, explanation, snippet);

  if (!skillFile) {
    add("SK-M01", "SKILL.md", "single_static", 1, "The selected skill root did not provide a readable SKILL.md file.");
  } else {
    const manifest = parseManifest(skillFile.content);
    if (!manifest.valid || !manifest.fields.name || !manifest.fields.description || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.fields.name)) add("SK-M01", skillFile.path, "single_static", 1, "SKILL.md frontmatter must contain valid name and description fields.");
    if (/\b(?:official|trusted|verified)[-_ ]+(?:openai|anthropic|github|microsoft)\b|\b(?:openai|anthropic|github)-official\b/i.test(manifest.fields.name || "")) add("SK-M02", skillFile.path, "single_static", 0.82, "The skill name uses a reserved publisher or officiality pattern that requires provenance review.");
    if (/\b(?:always use|use for every|any request|all tasks|regardless of|before doing anything)\b/i.test(manifest.fields.description || "")) add("SK-M03", skillFile.path, "single_static", 0.7, "The trigger description is broad enough to expand activation beyond a specific capability.");
    if (/(?:^|[\s,])(?:\*|all|network|shell|execute|filesystem)(?:$|[\s,])/i.test(manifest.fields["allowed-tools"] || "")) add("SK-M04", skillFile.path, "single_static", 0.65, "The manifest requests broad tools or network access without a narrower declared boundary.");
    const references = [...skillFile.content.matchAll(/(?:scripts|references|assets)\/[A-Za-z0-9_./-]+/g)].map((match) => match[0].replace(/[.,;:!?)]$/g, ""));
    for (const reference of references) {
      const fullPath = options.source.skillPath ? `${options.source.skillPath}/${reference}` : reference;
      if (!fileMap.has(fullPath)) add("SK-M05", skillFile.path, "single_static", 0.65, `The instruction layer references ${reference}, but that bundled path was not present in the pinned tree.`);
    }
    if (!options.sourcePinned) add("SK-P01", skillFile.path, "context", 0.9, "The requested GitHub ref is mutable; the scan pins the resolved commit for this report, but the source URL itself is not immutable.");
    const hasLicense = files.some((file) => /^(?:license|copying)(?:\.[a-z0-9]+)?$/i.test(basename(file.path))) || Boolean(manifest.fields.license);
    if (!hasLicense) add("SK-P02", skillFile.path, "context", 0.5, "No license or publisher provenance was found in the selected Skill root.");

    addPattern(findings, seen, "SK-I01", skillFile.path, skillFile.content, /(?:ignore|disregard|override)\b[\s\S]{0,100}\b(?:system|developer|previous|safety|policy)\b/i, "single_static", 0.82, "The instructions contain a prompt-boundary override pattern.");
    addPattern(findings, seen, "SK-I02", skillFile.path, skillFile.content, /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]|<!--[\s\S]*?-->/, "single_static", 0.9, "The instruction layer contains hidden Unicode or an HTML comment that can conceal content.");
    addPattern(findings, seen, "SK-I03", skillFile.path, skillFile.content, /(?:read|cat|copy|collect|search|open|extract)\b[\s\S]{0,80}(?:\.env|id_rsa|credentials|cookies?|api[_ -]?keys?|tokens?|passwords?)/i, "single_static", 0.82, "The instructions direct an agent toward credential or secret material.");
    const hasUrl = /https?:\/\//i.test(skillFile.content);
    if (hasUrl) addPattern(findings, seen, "SK-I04", skillFile.path, skillFile.content, /(?:send|upload|post|share|exfiltrat|forward|transmit)\b[\s\S]{0,100}https?:\/\//i, "single_static", 0.85, "The instructions correlate an external destination with a data-transfer verb.");
    addPattern(findings, seen, "SK-I05", skillFile.path, skillFile.content, /(?:disable|bypass|turn off|do not use)\b[\s\S]{0,80}\b(?:safety|security|approval|review|sandbox|guardrail|permission)/i, "single_static", 0.85, "The instructions attempt to remove a safety or approval boundary.");
    addPattern(findings, seen, "SK-I06", skillFile.path, skillFile.content, /(?:curl|wget|pip install|npm install|download|fetch)\b[\s\S]{0,100}(?:run|execute|eval|install|pipe|shell)/i, "single_static", 0.72, "The instructions combine remote acquisition with local execution or installation.");
    addPattern(findings, seen, "SK-I07", skillFile.path, skillFile.content, /(?:data:[^\s]+|(?:[A-Za-z0-9+/]{80,}={0,2})|base64\s*(?:decode|encoded?))/i, "single_static", 0.68, "The instruction layer contains an encoded or high-density payload pattern.");
  }

  const scriptFiles = files.filter((file) => SCRIPT_EXTENSIONS.has(extension(file.path)));
  for (const file of scriptFiles) {
    const secret = SENSITIVE_SOURCE_PATTERN.test(file.content);
    const network = scriptNetworkHost(file.content);
    const untrustedNetwork = network.matched && !network.trusted;
    const secretRead = addPattern(findings, seen, "SK-S01", file.path, file.content, /(?:open|readFile|read_text|cat|Get-Content|process\.env|os\.environ|dotenv)[\s\S]{0,100}(?:\.env|id_rsa|credentials|cookies?|api[_-]?key|token|password|secret)/i, "single_static", 0.74, "The script contains a read pattern adjacent to a sensitive path or credential source.");
    const networkRead = untrustedNetwork ? addPattern(findings, seen, "SK-S02", file.path, file.content, /(?:requests?\.|urllib\.|fetch\(|curl\b|wget\b|http\.request|https?:\/\/)/i, "single_static", 0.66, "The script makes an outbound request to a host that is not in the scanner's small trusted-host set.") : false;
    if ((secret || secretRead) && (network || networkRead)) {
      const secretIndex = file.content.search(SENSITIVE_SOURCE_PATTERN);
      const networkIndex = file.content.search(/(?:requests?\.|urllib\.|fetch\(|curl\b|wget\b|http\.request|https?:\/\/)/i);
      const context = lineContext(file.content, Math.max(0, Math.min(secretIndex < 0 ? 0 : secretIndex, networkIndex < 0 ? 0 : networkIndex)));
      addDirect(findings, seen, "SK-S03", file.path, "corroborated_static", 0.86, "The same script contains both a secret source and an outbound network sink; this is a static correlation, not a runtime proof.", context.snippet, context.line);
    }
    addPattern(findings, seen, "SK-S04", file.path, file.content, /(?:eval\s*\(|exec\s*\(|new Function\s*\(|child_process\.(?:exec|spawn)|Invoke-Expression)/i, "single_static", 0.78, "The script invokes a dynamic execution primitive that can turn fetched or decoded data into code.");
    if (network.matched) addPattern(findings, seen, "SK-S05", file.path, file.content, /(?:curl\b|wget\b|requests?\.|urllib\.|fetch\(|https?:\/\/)[\s\S]{0,260}(?:chmod\s+\+x|subprocess\.|os\.system|child_process\.|exec\s*\(|shell\s*=\s*True|Invoke-Expression)/i, "single_static", 0.78, "The script correlates remote acquisition with a local execution primitive.");
    addPattern(findings, seen, "SK-S06", file.path, file.content, /(?:\.bashrc|\.zshrc|startup|launchagents?|cron|crontab|agent[_ -]?config|\.vscode)[\s\S]{0,120}(?:write|append|open|copy|move|rename|mkdir|create)/i, "single_static", 0.78, "The script appears to write an agent, shell, startup, or scheduled-task configuration path.");
    addPattern(findings, seen, "SK-S07", file.path, file.content, /(?:rm\s+-rf|shutil\.rmtree|(?:unlink|remove|rmdir)\s*\(|Remove-Item\s+-Recurse|DROP\s+TABLE)/i, "single_static", 0.8, "The script contains a destructive operation pattern.");
    addPattern(findings, seen, "SK-S08", file.path, file.content, /(?:base64\.(?:b64decode|decodebytes)|Buffer\.from\([^\n]+base64|fromCharCode\s*\(|rot13|marshal\.loads|zlib\.decompress)/i, "single_static", 0.7, "The script contains an encoding or decoder primitive commonly used to hide behavior.");
    addPattern(findings, seen, "SK-S09", file.path, file.content, /(?:shell\s*=\s*True|os\.system\s*\(\s*[a-zA-Z_][\w]*|subprocess\.(?:run|Popen|call)\s*\([^\n]*(?:f[\"']|\+\s*[a-zA-Z_]))/i, "single_static", 0.72, "The script passes interpolated or variable input into a shell execution path.");
    addPattern(findings, seen, "SK-S10", file.path, file.content, /(?:\bsudo\b|setuid\s*\(|runas\b|net\s+user\b|chmod\s+[0-7]*7[0-7]*|pkexec\b)/i, "single_static", 0.8, "The script contains a privilege or permission-escalation command pattern.");
  }
  const binaries = options.treeEntries.filter((entry) => entry.type === "blob" && [".dll", ".dylib", ".exe", ".node", ".so"].includes(extension(entry.path)));
  for (const binary of binaries) {
    const stem = binary.path.replace(/\.[^.]+$/, "");
    const hasPair = options.treeEntries.some((entry) => entry.type === "blob" && entry.path.startsWith(`${stem}.`) && SCRIPT_EXTENSIONS.has(extension(entry.path)));
    if (!hasPair) add("SK-S11", binary.path, "single_static", 0.7, "A prebuilt executable is present under the Skill root without a same-stem source file.");
  }

  const dependencies = collectDependencies(files);
  for (const file of files) {
    if (basename(file.path).toLowerCase() === "package.json") {
      try {
        const packageJson = JSON.parse(file.content) as { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
        const installScript = Object.keys(packageJson.scripts || {}).find((key) => /^(?:pre|post)?install$|^prepare$/.test(key));
        if (installScript) add("SK-D01", file.path, "single_static", 0.75, `The package manifest defines the ${installScript} lifecycle script, which runs during installation.`);
      } catch {
        // Keep malformed package metadata from becoming an ungrounded dependency finding.
      }
    }
  }
  for (const dependency of dependencies) if (!dependency.version || /^(?:\*|latest|git\+|https?:|file:|github:)/i.test(dependency.version)) add("SK-D02", dependency.file, "single_static", 0.65, `${dependency.ecosystem} dependency ${dependency.name} is not pinned to a registry version.`);
  for (const dependency of options.vulnerableDependencies || []) add("SK-D03", dependency.file, "corroborated_static", 0.9, `OSV reported ${dependency.id || "a vulnerability"} for ${dependency.name}${dependency.version ? `@${dependency.version}` : ""}.`);

  for (const entry of options.treeEntries) {
    if (entry.type === "symlink" || entry.type === "commit" || (entry.size || 0) > MAX_FILE_BYTES || /\.(?:zip|tar|tgz|gz|7z)$/i.test(entry.path)) add("SK-M06", entry.path, "single_static", 0.8, entry.type === "symlink" ? "The pinned tree contains a symlink, which is not followed by this scanner." : entry.type === "commit" ? "The pinned tree contains a submodule boundary that was not expanded." : "The Skill tree contains an archive or oversized file that requires isolated handling.");
  }
  for (const match of options.intelMatches || []) add("SK-A01", options.source.skillPath || "SKILL.md", "authoritative", 1, match.explanation || "The immutable Skill snapshot matched configured malicious intelligence.");

  const status: Record<SkillAnalyzerId, "complete" | "incomplete" | "unavailable" | "failed"> = {
    manifest: options.completedAnalyzers?.manifest === false ? "incomplete" : "complete",
    instructions: options.completedAnalyzers?.instructions === false ? "incomplete" : "complete",
    scripts: options.completedAnalyzers?.scripts === false ? "incomplete" : "complete",
    deps: options.completedAnalyzers?.deps === false ? "incomplete" : "complete",
    archive: options.completedAnalyzers?.archive === false ? "incomplete" : "complete",
    intel: options.completedAnalyzers?.intel ? "complete" : "unavailable",
    sandbox_probe: "incomplete",
  };
  const required = skillAnalyzers.filter((analyzer) => analyzer.required).map((analyzer) => analyzer.id);
  const coverage: SkillCoverage = { completedRequired: required.filter((id) => status[id as SkillAnalyzerId] === "complete").length, requiredAnalyzers: required.length, analyzers: status, limitations };
  const scores = scoreSkillFindings(findings);
  return {
    source: options.source,
    artifact: { contentHash: canonicalContentHash(options.treeEntries, files), fileCount: options.treeEntries.length, fetchedFileCount: files.length, bytes: files.reduce((total, file) => total + file.size, 0) },
    decision: decideSkillScan(findings, coverage, scores),
    scores,
    coverage,
    findings,
    limitations,
    scannedAt: new Date().toISOString(),
  };
}

export async function scanPublicGitHubSkill(input: string): Promise<SkillScanReport> {
  const parsed = parsePublicGitHubSkillUrl(input);
  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  const repository = await githubRequest<GitHubRepository>(repoUrl);
  const requestedRef = parsed.requestedRef || repository.default_branch;
  const commit = await githubRequest<GitHubCommit>(`${repoUrl}/commits/${encodeURIComponent(requestedRef)}`);
  if (!/^[a-f0-9]{40}$/i.test(commit.sha)) throw new SkillScanError("GitHub did not return an immutable commit SHA.", "source_unavailable", 502);
  const tree = await githubRequest<GitHubTree>(`${repoUrl}/git/trees/${commit.sha}?recursive=1`);
  const { matching, requestedRoot } = selectedSkillPaths(parsed, tree);
  if (!matching.length) throw new SkillScanError("No SKILL.md was found at the requested public GitHub path.", "not_skill");
  if (!requestedRoot && matching.length > 1) throw new SkillScanError(`This repository contains ${matching.length} Skills. Open one Skill directory or SKILL.md directly so the report has an unambiguous identity.`, "not_skill");
  const selectedSkillPath = matching[0];
  const skillPath = dirname(selectedSkillPath);
  const scopedTree = tree.tree.filter((entry) => !skillPath || entry.path === skillPath || entry.path.startsWith(`${skillPath}/`));
  const limitations: string[] = ["Untrusted Skill files were fetched for static inspection only; no script, dependency hook, or sandbox probe was executed."];
  if (tree.truncated) limitations.push("GitHub truncated the repository tree, so archive and file coverage is incomplete.");
  const candidates = scopedTree.filter((entry) => entry.type === "blob" && isTextCandidate(entry.path)).sort((a, b) => a.path.localeCompare(b.path));
  const files: SkillFile[] = [];
  let totalBytes = 0;
  let skipped = 0;
  for (const entry of candidates) {
    const size = entry.size || 0;
    if (files.length >= MAX_FILES || size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${commit.sha}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const content = await githubText(rawUrl);
      const actualSize = new TextEncoder().encode(content).byteLength;
      files.push({ path: entry.path, content, size: actualSize });
      totalBytes += actualSize;
    } catch (error) {
      skipped += 1;
      limitations.push(`${entry.path} could not be fetched for static analysis.`);
      if (entry.path === selectedSkillPath) throw error;
    }
  }
  if (skipped) limitations.push(`${skipped} file(s) were outside the bounded static acquisition budget.`);
  const dependencies = collectDependencies(files);
  const osv = await queryOsv(dependencies);
  if (dependencies.length && !osv.available) limitations.push("OSV dependency intelligence was unavailable for this scan; dependency coverage is incomplete.");
  const intel = await loadIntel(canonicalContentHash(scopedTree, files));
  if (!intel.available) limitations.push("Curated malicious-intelligence coverage is not configured; this report cannot make an intelligence-backed ALLOW decision.");
  const source: SkillSource = {
    requestedUrl: parsed.requestedUrl,
    owner: parsed.owner,
    repo: parsed.repo,
    ref: requestedRef,
    commit: commit.sha,
    skillPath,
    pinned: /^[a-f0-9]{40}$/i.test(parsed.requestedRef || ""),
    canonicalUrl: `https://github.com/${parsed.owner}/${parsed.repo}/tree/${commit.sha}${skillPath ? `/${skillPath}` : ""}`,
    commitUrl: `https://github.com/${parsed.owner}/${parsed.repo}/commit/${commit.sha}`,
  };
  const report = scanSkillFiles({
    source,
    treeEntries: scopedTree,
    files,
    sourcePinned: source.pinned,
    limitations,
    completedAnalyzers: { scripts: skipped === 0 && !tree.truncated, deps: !dependencies.length || osv.available, archive: !tree.truncated && skipped === 0, intel: intel.available },
    intelMatches: intel.matches,
    vulnerableDependencies: osv.vulnerabilities,
  });
  return report;
}
