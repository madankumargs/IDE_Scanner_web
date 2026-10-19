export type PublicSkill = {
  id: string;
  name: string;
  slug: string;
  source: string;
  installs: number;
  sourceType: "github" | "well-known" | "unknown";
  catalogUrl: string;
  installUrl: string | null;
  githubUrl: string | null;
  duplicate: boolean;
};

export type PublicSkillSearch = {
  query: string;
  effectiveQuery: string;
  searchType: string;
  results: PublicSkill[];
  source: "skills.sh";
  limited: boolean;
};

type RawSkill = {
  id?: unknown;
  slug?: unknown;
  skillId?: unknown;
  name?: unknown;
  source?: unknown;
  installs?: unknown;
  sourceType?: unknown;
  installUrl?: unknown;
  url?: unknown;
  isDuplicate?: unknown;
};

type RawSearchPayload = { query?: unknown; searchType?: unknown; skills?: RawSkill[] };
type RawV1Payload = { data?: RawSkill[]; pagination?: { hasMore?: boolean } };

const PUBLIC_SEARCH_URL = "https://skills.sh/api/search";
const AUTHENTICATED_SEARCH_URL = "https://skills.sh/api/v1/skills/search";
const MAX_QUERY_LENGTH = 120;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function catalogToken() {
  return process.env.SKILLS_SH_TOKEN?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";
}

function normalizedQuery(input: string) {
  return input.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

export function expandSkillSearchQuery(input: string) {
  const query = normalizedQuery(input);
  if (/andre(?:ti|j)\s+karapp?at(?:i|y)/i.test(query) || /andrej\s+karpathy/i.test(query)) return "karpathy";
  return query;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asInstalls(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

export function normalizePublicSkill(raw: RawSkill): PublicSkill | null {
  const id = asString(raw.id);
  const source = asString(raw.source) || id.split("/").slice(0, 2).join("/");
  const slug = asString(raw.slug) || asString(raw.skillId) || id.split("/").at(-1) || "";
  const name = asString(raw.name) || slug;
  if (!id || !source || !slug || !name) return null;
  const sourceParts = source.split("/").filter(Boolean);
  const sourceType = raw.sourceType === "github" || (sourceParts.length === 2 && sourceParts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))) ? "github" : raw.sourceType === "well-known" ? "well-known" : "unknown";
  const installUrl = asString(raw.installUrl) || (sourceType === "github" ? `https://github.com/${source}` : null);
  const githubUrl = sourceType === "github" ? `https://github.com/${source}` : null;
  return {
    id,
    name,
    slug,
    source,
    installs: asInstalls(raw.installs),
    sourceType,
    catalogUrl: asString(raw.url) || `https://skills.sh/${id}`,
    installUrl,
    githubUrl,
    duplicate: raw.isDuplicate === true,
  };
}

function normalizeResults(items: RawSkill[] | undefined) {
  const seen = new Set<string>();
  return (items || []).map(normalizePublicSkill).filter((skill): skill is PublicSkill => Boolean(skill && !seen.has(skill.id) && seen.add(skill.id)));
}

async function readJson(response: Response) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("The public Skills catalog response was too large.");
  try {
    return JSON.parse(text) as RawSearchPayload | RawV1Payload;
  } catch {
    throw new Error("The public Skills catalog returned invalid JSON.");
  }
}

async function request(url: string, token?: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GuardRails-Skills-Catalog/1.0", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`The public Skills catalog returned HTTP ${response.status}.`);
  return readJson(response);
}

async function searchWithPublicEndpoint(query: string) {
  const payload = await request(`${PUBLIC_SEARCH_URL}?q=${encodeURIComponent(query)}`) as RawSearchPayload;
  return { searchType: asString(payload.searchType, "ranked"), results: normalizeResults(payload.skills) };
}

async function searchWithAuthenticatedEndpoint(query: string, token: string, limit: number) {
  const payload = await request(`${AUTHENTICATED_SEARCH_URL}?q=${encodeURIComponent(query)}&limit=${limit}`, token) as RawV1Payload;
  return { searchType: "catalog", results: normalizeResults(payload.data), limited: Boolean(payload.pagination?.hasMore) };
}

export async function searchPublicSkills(input: string, limit = 24): Promise<PublicSkillSearch> {
  const query = normalizedQuery(input);
  if (query.length < 2) throw new Error("Search for at least two characters.");
  const effectiveQuery = expandSkillSearchQuery(query);
  const token = catalogToken();
  let result: { searchType: string; results: PublicSkill[]; limited?: boolean };
  try {
    result = token ? await searchWithAuthenticatedEndpoint(effectiveQuery, token, Math.min(Math.max(limit, 1), 100)) : await searchWithPublicEndpoint(effectiveQuery);
  } catch (error) {
    if (!token) throw error;
    result = await searchWithPublicEndpoint(effectiveQuery);
  }
  return { query, effectiveQuery, searchType: result.searchType, results: result.results.slice(0, Math.min(Math.max(limit, 1), 100)), source: "skills.sh", limited: result.limited ?? result.results.length >= 100 };
}

export async function recommendedPublicSkills(limit = 12): Promise<PublicSkillSearch> {
  const result = await searchPublicSkills("agent", Math.min(Math.max(limit, 1), 50));
  return { ...result, query: "", effectiveQuery: "agent", searchType: "recommended", results: result.results.filter((skill) => !skill.duplicate).slice(0, limit) };
}
