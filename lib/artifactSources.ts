import type { ArtifactKind, ArtifactLocator } from "@/lib/artifactScan";

export interface ResolvedArtifact {
  kind: ArtifactKind;
  display_name: string;
  source: "github" | "npm";
  source_ref: string;
  owner: string | null;
  version: string;
  locator: ArtifactLocator;
}

export function listKnown(_kind: ArtifactKind): ResolvedArtifact[] { return []; }

export async function resolve(raw: string, kind: ArtifactKind, version?: string): Promise<ResolvedArtifact> {
  const value = raw.trim();
  if (!value) throw new Error("Provide a repository URL, GitHub owner/repository, or npm package name.");
  const github = parseGithub(value);
  if (github) return { kind, display_name: github.repo, source: "github", source_ref: [github.owner, github.repo, github.path].filter(Boolean).join("/"), owner: github.owner, version: version || await resolveGithubHeadSha(github.owner, github.repo), locator: { source: "github", owner: github.owner, repo: github.repo, ...(github.path ? { path: github.path } : {}) } };
  const packageName = value.replace(/^npm:/i, "").replace(/^https?:\/\/registry\.npmjs\.org\//i, "").replace(/\/$/, "");
  if (!/^@?[a-z0-9][a-z0-9._~/-]*$/i.test(packageName) || packageName.includes("..")) throw new Error("Use a public GitHub repository URL or npm package name.");
  return { kind, display_name: packageName, source: "npm", source_ref: packageName, owner: null, version: version || "latest", locator: { source: "npm", packageName, version: version || "latest" } };
}

async function resolveGithubHeadSha(owner: string, repo: string): Promise<string> {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACTIONS_TOKEN;
  const headers: Record<string, string> = token ? { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } : { Accept: "application/vnd.github+json" };
  const repoInfo = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers, cache: "no-store" });
  if (!repoInfo.ok) throw new Error(`Could not resolve repository ${owner}/${repo}.`);
  const { default_branch } = await repoInfo.json() as { default_branch?: string };
  const branchInfo = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(default_branch || "main")}`, { headers, cache: "no-store" });
  if (!branchInfo.ok) throw new Error(`Could not resolve default branch for ${owner}/${repo}.`);
  const { sha } = await branchInfo.json() as { sha?: string };
  if (!sha) throw new Error(`No commit sha returned for ${owner}/${repo}.`);
  return sha;
}

function parseGithub(value: string): { owner: string; repo: string; path?: string } | null {
  let path = value.trim().replace(/^git@github\.com:/i, "https://github.com/").replace(/\.git$/, "");
  if (!/^https?:\/\/github\.com\//i.test(path)) path = `https://github.com/${path}`;
  try { const url = new URL(path); if (url.hostname.toLowerCase() !== "github.com") return null; const parts = url.pathname.split("/").filter(Boolean); if (parts.length < 2) return null; return { owner: parts[0], repo: parts[1], path: parts.slice(2).join("/") || undefined }; } catch { return null; }
}
