import { AuthenticationError } from "@/lib/auth";
import { EntitlementError } from "@/lib/entitlements";

export class TeamAuthorizationError extends Error {
  constructor(message = "You do not have permission for this team.") {
    super(message);
    this.name = "TeamAuthorizationError";
  }
}

export function teamApiError(error: unknown, fallback: string) {
  if (error instanceof AuthenticationError) return { status: 401, error: error.message };
  if (error instanceof TeamAuthorizationError) return { status: 403, error: error.message };
  if (error instanceof EntitlementError) return { status: error.status, error: error.message, code: error.code };
  if (error instanceof Error && error.message.includes("WORKSPACE_PLAN_LIMIT_REACHED")) {
    return { status: 403, error: "This workspace has reached its plan limit. Remove an existing item or upgrade before adding another.", code: "PLAN_LIMIT_REACHED" };
  }
  if (error instanceof Error && error.message.startsWith("BADGE_LIMIT:")) {
    return { status: 429, error: error.message.slice("BADGE_LIMIT:".length).trim(), code: "BADGE_LIMIT_REACHED" };
  }
  return { status: 503, error: fallback };
}
