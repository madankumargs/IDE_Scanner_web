import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_cache } from "next/cache";

type RegistryChunk = { payload: string };
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

// Registry chunks are immutable between publication imports. Persisting the
// assembled read in OpenNext's incremental cache avoids reparsing the entire
// catalog on every public page request.
const readChunksCached = unstable_cache(
  async (query: string, value: string) => readChunks(query, value),
  ["cloudflare-registry-chunks-v1"],
  { revalidate: 300, tags: ["registry-catalog"] },
);

export async function getCloudflareRegistrySection<T>(
  section: string,
): Promise<T | null> {
  const payload = await readChunksCached(
    "SELECT payload FROM registry_section_chunks WHERE section = ? ORDER BY chunk_index",
    section,
  );
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
  const payload = await readChunksCached(
    "SELECT payload FROM registry_product_chunks WHERE extension_id = ? ORDER BY chunk_index",
    extensionId,
  );
  const fallbackPayload = payload || await readChunksCached(
    "SELECT payload FROM registry_product_chunks WHERE lower(extension_id) = lower(?) ORDER BY chunk_index",
    extensionId,
  );
  if (!fallbackPayload) return null;
  try {
    return JSON.parse(fallbackPayload) as T;
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
