import { NextResponse } from "next/server";
import { authenticated, AuthenticationError } from "@/lib/auth";
import { queueArtifactScan } from "@/lib/artifactScanQueue";
import type { ArtifactKind } from "@/lib/artifactScan";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const kinds = new Set<ArtifactKind>(["skill", "plugin", "mcp"]);
export async function POST(request: Request) {
  try {
    const auth = await authenticated(request); const body = await request.json().catch(() => ({})) as { id?: unknown; name?: unknown; url?: unknown; source?: unknown; kind?: unknown; version?: unknown };
    const raw = [body.source, body.url, body.name, body.id].find(value => typeof value === "string" && value.trim()) as string | undefined;
    const kind = typeof body.kind === "string" && kinds.has(body.kind as ArtifactKind) ? body.kind as ArtifactKind : null;
    if (!raw || !kind) return NextResponse.json({ error: "Provide source and kind (skill, plugin, or mcp)." }, { status: 400 });
    const result = await queueArtifactScan(raw, kind, String(auth.user.id), typeof body.version === "string" ? body.version.trim() || undefined : undefined);
    return NextResponse.json(result, { status: 202 });
  } catch (error) { const status = error instanceof AuthenticationError || (error instanceof Error && error.name === "AuthenticationError") ? 401 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Artifact scan could not be queued." }, { status }); }
}
