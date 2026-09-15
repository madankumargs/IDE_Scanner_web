"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, LoaderCircle } from "lucide-react";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";

export default function WatchExtension({ extensionId }: { extensionId: string }) {
  const db = useMemo(() => browserDb(), []);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function watch() {
    const headers = await browserAuthHeaders(db);
    if (!headers.Authorization) {
      router.push(`/account?next=${encodeURIComponent(`/extensions/${extensionId}`)}`);
      return;
    }
    setState("loading");
    try {
      const teamsResponse = await fetch("/api/teams", { headers });
      const teamsBody = await teamsResponse.json().catch(() => ({}));
      const team = Array.isArray(teamsBody.teams)
        ? teamsBody.teams.find((candidate: { role?: string }) =>
            ["owner", "admin", "analyst"].includes(candidate.role || ""),
          )
        : null;
      if (!teamsResponse.ok) {
        setState("error");
        return;
      }
      if (!team?.id) {
        router.push(`/account?next=${encodeURIComponent(`/extensions/${extensionId}`)}`);
        return;
      }
      const response = await fetch(
        `/api/teams/${encodeURIComponent(String(team.id))}/watchlist`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ extension_id: extensionId }),
        },
      );
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return <button className={`button watchButton ${state === "done" ? "watched" : ""}`} onClick={() => void watch()} disabled={state === "loading" || state === "done"}>{state === "loading" ? <LoaderCircle className="spin"/> : state === "done" ? <Check/> : <Bell/>}{state === "done" ? "Watching" : state === "error" ? "Try again" : "Watch releases"}</button>;
}
