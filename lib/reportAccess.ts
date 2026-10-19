import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { userFromSession } from "@/lib/cloudflarePrivate";
import { serverDb } from "@/lib/supabaseServer";

/** Resolves the authenticated account for a detailed report request. */
export async function reportAccessUser(request: Request): Promise<{ id: string } | null> {
  if (cloudflarePrivateAvailable()) {
    try {
      const user = await userFromSession(request);
      return user ? { id: user.id } : null;
    } catch {
      return null;
    }
  }
  try {
    const db = await serverDb();
    const result = await db.auth.getUser();
    return result.data.user ? { id: result.data.user.id } : null;
  } catch {
    return null;
  }
}
