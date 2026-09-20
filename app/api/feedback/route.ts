import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  isFeedbackCategory,
  isFeedbackEmail,
} from "@/lib/feedback";
import {
  feedbackEmailConfigured,
  feedbackEmailPayload,
} from "@/lib/feedbackEmail";
import { cloudflareEmail } from "@/lib/cloudflareEmail";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { serviceDb } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request) {
  if (contentLength(request) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Feedback submission is too large." },
      { status: 413 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid request body.");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid feedback request." }, { status: 400 });
  }

  // A honeypot keeps automated submissions from consuming the database rate
  // limit while returning the same successful response as a real submission.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const category = body.category;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const contactEmail =
    typeof body.contact_email === "string"
      ? body.contact_email.trim().toLowerCase()
      : "";
  const pagePath = typeof body.page_path === "string" ? body.page_path.trim() : "";

  if (!isFeedbackCategory(category)) {
    return NextResponse.json(
      { error: "Choose a valid feedback category." },
      { status: 400 },
    );
  }
  if (message.length < 3) {
    return NextResponse.json(
      { error: "Tell us a little more so the team can act on your feedback." },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json(
      { error: "Feedback is limited to 4000 characters." },
      { status: 400 },
    );
  }
  if (contactEmail && !isFeedbackEmail(contactEmail)) {
    return NextResponse.json(
      { error: "Enter a valid contact email or leave it blank." },
      { status: 400 },
    );
  }
  if (pagePath && (pagePath.length > 500 || !pagePath.startsWith("/") || pagePath.startsWith("//"))) {
    return NextResponse.json({ error: "The page context is invalid." }, { status: 400 });
  }

  const requesterHash = hashRequester(request);
  try {
    const d1 = cloudflareFeedbackDb();
    let id = "";
    let createdAt = new Date().toISOString();
    let markEmail: EmailMarker;

    if (d1) {
      const recent = await d1
        .prepare("SELECT COUNT(*) AS count FROM feedback_submissions WHERE requester_hash=? AND created_at > datetime('now','-1 hour')")
        .bind(requesterHash)
        .first<{ count?: number | string }>();
      if (Number(recent?.count || 0) >= 5) throw new Error("Feedback limit reached. Please try again later.");

      id = randomUUID();
      await d1
        .prepare("INSERT INTO feedback_submissions (id,category,message,contact_email,page_path,requester_hash,email_status,created_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(id, category, message, contactEmail || null, pagePath, requesterHash, "pending", createdAt)
        .run();
      markEmail = async (status, error) => {
        await d1.prepare("UPDATE feedback_submissions SET email_status=?,email_error=?,emailed_at=? WHERE id=?")
          .bind(status, error, status === "sent" ? new Date().toISOString() : null, id)
          .run();
      };
    } else {
      const db = serviceDb();
      const result = await db.rpc("submit_feedback", {
        p_category: category,
        p_message: message,
        p_contact_email: contactEmail || null,
        p_page_path: pagePath,
        p_requester_hash: requesterHash,
      });
      if (result.error) throw result.error;
      const feedback = one(result.data);
      id = typeof feedback.id === "string" ? feedback.id : "";
      if (!id) throw new Error("Feedback record was not created.");
      createdAt = typeof feedback.created_at === "string" ? feedback.created_at : createdAt;
      markEmail = async (status, error) => markSupabaseEmail(db, id, status, error);
    }

    const emailDelivered = await notifyCompany({
      id,
      category,
      message,
      contactEmail: contactEmail || null,
      pagePath,
      createdAt,
      markEmail,
    });

    return NextResponse.json({ ok: true, email_delivered: emailDelivered }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feedback submission failed.";
    console.error("[feedback]", message);
    if (/limit reached/i.test(message)) {
      return NextResponse.json(
        { error: "You have sent several feedback messages recently. Please try again later." },
        { status: 429 },
      );
    }
    if (/credential|not configured|supabase/i.test(message)) {
      return NextResponse.json(
        { error: "Feedback is temporarily unavailable. Please email hello@abscissa.dev." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "We could not record your feedback just now. Please try again." },
      { status: 503 },
    );
  }
}

type FeedbackRow = {
  id?: unknown;
  created_at?: unknown;
};

function one(value: unknown): FeedbackRow {
  return (Array.isArray(value) ? value[0] : value || {}) as FeedbackRow;
}

async function notifyCompany(
  input: Parameters<typeof feedbackEmailPayload>[0] & { markEmail: EmailMarker },
): Promise<boolean> {
  const payload = feedbackEmailPayload(input);
  const binding = cloudflareEmail();
  if (binding) {
    try {
      await binding.send({
        to: payload.to[0],
        from: runtimeEnv("NOTIFICATION_FROM_EMAIL") || "hello@abscissa.dev",
        subject: payload.subject,
        text: payload.text,
      });
      await input.markEmail("sent", null);
      return true;
    } catch (error) {
      console.error("[feedback-email-cloudflare]", error instanceof Error ? error.message : error);
    }
  }

  if (!feedbackEmailConfigured()) {
    await input.markEmail("skipped", null);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtimeEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "User-Agent": "GuardRails-Feedback/1.0",
      },
      body: JSON.stringify(feedbackEmailPayload(input)),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
    await input.markEmail("sent", null);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Email delivery failed.";
    console.error("[feedback-email]", reason);
    await input.markEmail("failed", reason.slice(0, 500));
    return false;
  }
}

type EmailStatus = "sent" | "failed" | "skipped";
type EmailMarker = (status: EmailStatus, error: string | null) => Promise<void>;
type FeedbackDb = ReturnType<typeof serviceDb>;

async function markSupabaseEmail(
  db: FeedbackDb,
  id: string,
  status: "sent" | "failed" | "skipped",
  error: string | null,
) {
  const result = await db
    .from("feedback_submissions")
    .update({
      email_status: status,
      email_error: error,
      emailed_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (result.error) console.error("[feedback-email-status]", result.error.message);
}

function cloudflareFeedbackDb(): D1Database | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    return (env.ABSCISSA_REGISTRY as D1Database | undefined) || null;
  } catch {
    return null;
  }
}

function hashRequester(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.SCAN_RATE_LIMIT_SECRET || "guardrails-feedback-rate-limit";
  return createHash("sha256").update(`${salt}:${address}`).digest("hex");
}

function contentLength(request: Request): number {
  const value = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
