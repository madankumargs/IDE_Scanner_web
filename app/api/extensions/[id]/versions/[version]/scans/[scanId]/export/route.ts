import { NextResponse } from "next/server";
import { getVersionScanProduct } from "@/lib/productData";
import { reportAccessUser } from "@/lib/reportAccess";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string; version: string; scanId: string }>;
  },
) {
  const user = await reportAccessUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to export the full report.", code: "auth_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id, version, scanId } = await context.params;
  const product = await getVersionScanProduct(id, version, scanId);
  const scan = product?.scan as Record<string, unknown> | null | undefined;
  if (!product || !scan) {
    return NextResponse.json(
      { error: "This immutable scan report does not exist." },
      { status: 404 },
    );
  }

  const status = String(scan.analysis_status || "complete");
  if (!["complete", "incomplete"].includes(status)) {
    return NextResponse.json(
      {
        error:
          "Evidence can be exported only after analysis reaches a terminal state.",
      },
      { status: 409 },
    );
  }

  const payload = {
    schema_version: "guardrails-immutable-evidence-v1",
    immutable_report: true,
    identity: pick(scan, [
      "id",
      "extension_id",
      "version",
      "artifact_sha256",
      "scanned_at",
      "scanner_build",
      "ruleset_version",
      "policy_version",
      "score_schema_version",
    ]),
    outcome: pick(scan, [
      "decision",
      "public_outcome",
      "decision_basis",
      "severity",
      "decision_reason",
      "evidence_confidence",
      "provenance_tier",
      "coverage_percent",
      "analysis_status",
    ]),
    findings: Array.isArray(product.findings)
      ? product.findings.map((finding) =>
          pick(finding as Record<string, unknown>, [
            "id",
            "rule_id",
            "category",
            "severity",
            "confidence",
            "evidence_class",
            "actionability",
            "summary",
            "recommendation",
            "file_refs",
          ]),
        )
      : [],
    capabilities: scan.capabilities || {},
    dependencies: Array.isArray(product.dependencies)
      ? product.dependencies.map((dependency) =>
          pick(dependency as Record<string, unknown>, [
            "name",
            "version",
            "ecosystem",
            "relationship",
          ]),
        )
      : [],
    files: Array.isArray(product.files)
      ? product.files.map((file) =>
          pick(file as Record<string, unknown>, [
            "path",
            "size",
            "content_sha256",
            "mime_type",
            "preview_available",
          ]),
        )
      : [],
  };
  const fileName = `guardrails-${safePart(id)}-${safePart(version)}-${safePart(scanId)}-evidence.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

function pick(source: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}

function safePart(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 120);
}
