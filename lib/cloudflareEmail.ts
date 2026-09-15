import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runtimeEnv } from "@/lib/runtimeEnv";

type EmailMessage = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
};

type EmailBinding = {
  send(message: EmailMessage): Promise<unknown>;
};

export function cloudflareEmail(): EmailBinding | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const binding = env.AUTH_EMAIL as EmailBinding | undefined;
    return binding && typeof binding.send === "function" ? binding : null;
  } catch {
    return null;
  }
}

export function authEmailFrom(): string {
  return runtimeEnv("AUTH_EMAIL_FROM").trim() || "hello@abscissa.dev";
}

export async function sendAuthCode(email: string, code: string): Promise<void> {
  const message: EmailMessage = {
    to: email,
    from: authEmailFrom(),
    subject: "Your GuardRails sign-in code",
    text: `Your GuardRails sign-in code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<p>Your GuardRails sign-in code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
  };

  const binding = cloudflareEmail();
  if (binding) {
    try {
      await binding.send(message);
      return;
    } catch {
      // Cloudflare Email Sending is unavailable on the free Workers plan.
    }
  }

  const apiKey = runtimeEnv("RESEND_API_KEY").trim();
  if (!apiKey) throw new Error("No transactional email provider is configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...message, to: [message.to] }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Transactional email provider returned HTTP ${response.status}.`);
}
