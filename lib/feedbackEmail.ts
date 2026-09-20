import {
  FEEDBACK_CATEGORY_LABELS,
  isFeedbackEmail,
  type FeedbackCategory,
} from "@/lib/feedback";
import { runtimeEnv } from "@/lib/runtimeEnv";

export type FeedbackEmailInput = {
  id: string;
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
  pagePath: string;
  createdAt: string;
};

export function feedbackRecipient(): string {
  return runtimeEnv("FEEDBACK_TO_EMAIL").trim() || "hello@abscissa.dev";
}

export function feedbackEmailConfigured(): boolean {
  return Boolean(
    runtimeEnv("RESEND_API_KEY") &&
      runtimeEnv("NOTIFICATION_FROM_EMAIL") &&
      isFeedbackEmail(feedbackRecipient()),
  );
}

export function feedbackEmailPayload(input: FeedbackEmailInput) {
  const label = FEEDBACK_CATEGORY_LABELS[input.category];
  const contact = input.contactEmail || "Not provided";
  const page = input.pagePath || "/";
  return {
    from: runtimeEnv("NOTIFICATION_FROM_EMAIL"),
    to: [feedbackRecipient()],
    subject: `[GuardRails feedback] ${label}`,
    text: [
      "New feedback was submitted on GuardRails.",
      "",
      `Category: ${label}`,
      `Message: ${input.message}`,
      `Contact email: ${contact}`,
      `Page: ${page}`,
      `Submitted: ${input.createdAt}`,
      `Feedback ID: ${input.id}`,
      "",
      "Reply to the contact email only if the sender provided one and follow the privacy policy for any support context.",
    ].join("\n"),
  };
}
