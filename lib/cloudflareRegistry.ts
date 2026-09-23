import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_cache } from "next/cache";

type RegistryChunk = { payload: string };
type ActiveRegistryChunk = { payload?: string | null; active_publication_id?: string | null };
type ActiveChunkRead = { active: boolean; payload: string | null };
type RegistryCatalogEntry = Record<string, unknown>;
type RegistryCatalogPayload = RegistryCatalogEntry[] | { catalog?: RegistryCatalogEntry[] };

function registryDb(): D1Database | null {
  try {
    return getCloudflareContext().env.ABSCISSA_REGISTRY || null;
  } catch {
    return null;
  }
}

async function readChunks(
  query: string,
  value: string,
): Promise<string | null> {
  const db = registryDb();
  if (!db) return null;
  try {
    const result = await db
      .prepare(query)
      .bind(value)
      .all<RegistryChunk>();
    if (!result.results.length) return null;
    return result.results.map((row) => row.payload).join("");
  } catch {
    return null;
  }
}

const ACTIVE_SECTION_QUERY = `
  SELECT c.payload, s.publication_id AS active_publication_id
  FROM registry_publication_state s
  LEFT JOIN registry_section_chunks_v2 c
    ON c.publication_id = s.publication_id AND c.section = ?
  WHERE s.state_key = 'active'
  ORDER BY c.chunk_index
`;

const ACTIVE_PRODUCT_QUERY = `
  SELECT c.payload, s.publication_id AS active_publication_id
  FROM registry_publication_state s
  LEFT JOIN registry_product_chunks_v2 c
    ON c.publication_id = s.publication_id AND lower(c.extension_id) = lower(?)
  WHERE s.state_key = 'active'
  ORDER BY c.chunk_index
`;

// Registry chunks are immutable between publication imports. Persisting the
// assembled read in OpenNext's incremental cache avoids reparsing the entire
// catalog on every public page request.
const readActiveChunksCached = unstable_cache(
  async (query: string, value: string): Promise<ActiveChunkRead> => {
    const db = registryDb();
    if (!db) return { active: false, payload: null };
    try {
      const result = await db.prepare(query).bind(value).all<ActiveRegistryChunk>();
      const active = result.results.some((row) => Boolean(row.active_publication_id));
      return {
        active,
        payload: active
          ? result.results.map((row) => row.payload || "").join("") || null
          : null,
      };
    } catch {
      return { active: false, payload: null };
    }
  },
  ["cloudflare-registry-active-chunks-v1"],
  { revalidate: 300, tags: ["registry-catalog"] },
);

const readChunksCached = unstable_cache(
  async (query: string, value: string) => readChunks(query, value),
  ["cloudflare-registry-chunks-v2"],
  { revalidate: 300, tags: ["registry-catalog"] },
);

export async function getCloudflareRegistrySection<T>(
  section: string,
): Promise<T | null> {
  const active = await readActiveChunksCached(ACTIVE_SECTION_QUERY, section);
  const payload = active.active
    ? active.payload
    : await readChunksCached("SELECT payload FROM registry_section_chunks WHERE section = ? ORDER BY chunk_index", section);
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export async function getCloudflareRegistryProduct<T>(
  extensionId: string,
): Promise<T | null> {
  const active = await readActiveChunksCached(ACTIVE_PRODUCT_QUERY, extensionId);
  const payload = active.active
    ? active.payload
    : await readChunksCached("SELECT payload FROM registry_product_chunks WHERE extension_id = ? ORDER BY chunk_index", extensionId)
      || await readChunksCached("SELECT payload FROM registry_product_chunks WHERE lower(extension_id) = lower(?) ORDER BY chunk_index", extensionId);
  if (!payload) return null;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

export async function getCloudflareRegistryCatalogExtension<T>(
  extensionId: string,
): Promise<T | null> {
  const catalog = await getCloudflareRegistrySection<RegistryCatalogPayload>("catalog");
  return findCloudflareRegistryCatalogExtension<T>(catalog, extensionId);
}

export function findCloudflareRegistryCatalogExtension<T>(
  catalog: RegistryCatalogPayload | null,
  extensionId: string,
): T | null {
  const entries = Array.isArray(catalog) ? catalog : catalog?.catalog || [];
  const match = entries.find(
    (item) => String(item.id || "").toLowerCase() === extensionId.toLowerCase(),
  );
  return (match || null) as T | null;
}

export async function getCloudflareRegistrySnapshot<T extends Record<string, unknown>>(): Promise<T | null> {
  const sections = await Promise.all(
    ["metrics", "feed", "inventory", "history", "catalog", "benchmark"].map(async (section) => [
      section,
      await getCloudflareRegistrySection(section),
    ] as const),
  );
  if (sections.some(([, value]) => value == null)) return null;
  const values = Object.fromEntries(sections) as Record<string, unknown>;
  return { ...values, products: {} } as unknown as T;
}

export async function getCloudflareRegistryPublication(): Promise<{ id: string; generated_at: string } | null> {
  const db = registryDb();
  if (!db) return null;
  try {
    const row = await db
      .prepare(`
        SELECT state.publication_id AS id, publication.generated_at
        FROM registry_publication_state state
        JOIN registry_publications publication ON publication.id = state.publication_id
        WHERE state.state_key = 'active'
        LIMIT 1
      `)
      .first<{ id?: unknown; generated_at?: unknown }>();
    return row?.id
      ? { id: String(row.id), generated_at: String(row.generated_at || "") }
      : null;
  } catch {
    return null;
  }
}
