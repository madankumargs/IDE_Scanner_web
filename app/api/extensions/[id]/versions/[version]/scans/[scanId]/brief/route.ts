import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The original brief endpoint accepted a different, essay-shaped contract.
 * Retire it explicitly so callers cannot receive an unvalidated second AI
 * report. The dossier uses /intelligence with signed evidence context.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; version: string; scanId: string }> },
) {
  void request;
  const route = await context.params;
  const path = `/extensions/${encodeURIComponent(route.id)}/versions/${encodeURIComponent(route.version)}/scans/${encodeURIComponent(route.scanId)}#intelligence`;
  return NextResponse.json(
    {
      error: "The legacy evidence brief is retired.",
      code: "reviewer_guide_required",
      reviewer_guide_path: path,
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
