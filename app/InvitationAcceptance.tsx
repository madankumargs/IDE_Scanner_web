"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";

export default function InvitationAcceptance({ token }: { token: string }) {
  const db = useMemo(() => browserDb(), []);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function accept() {
    setState("saving"); setMessage("");
    const headers = await browserAuthHeaders(db);
    if (!headers.Authorization) { router.push(`/account?next=${encodeURIComponent(`/workspace/invitations/${token}`)}`); return; }
    try {
      const response = await fetch("/api/team-invitations/accept", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState("error"); setMessage(String(body.error || "Could not accept invitation.")); return; }
      router.replace("/workspace"); router.refresh();
    } catch { setState("error"); setMessage("Could not accept invitation."); }
  }

  return <main className="workspacePage gatePage"><section className="workspaceSignedOut">
    <UserPlus/><span>Team invitation</span><h1>Join a GuardRails workspace.</h1>
    <p>This invitation grants only the role selected by a workspace owner or administrator. It expires after one successful acceptance.</p>
    <button className="button buttonDark" type="button" onClick={() => void accept()} disabled={state === "saving"}>{state === "saving" ? "Joining workspace" : "Accept invitation"}</button>
    {state === "error" ? <p className="previewError" role="status">{message}</p> : null}
  </section></main>;
}
