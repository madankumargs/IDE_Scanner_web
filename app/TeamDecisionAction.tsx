"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare } from "lucide-react";
import { trackProductEvent } from "@/lib/analyticsEvents";
import { browserDb } from "@/lib/supabase";
import { browserAuthHeaders } from "@/lib/browserAuth";

type Team = { id: string; name: string; role: string };
type Member = { user_id: string; role: string; profiles?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null };

export default function TeamDecisionAction({ scanId, extensionId }: { scanId: string; extensionId: string }) {
  const db = useMemo(() => browserDb(), []);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [decision, setDecision] = useState("review");
  const [state, setState] = useState<"hidden" | "ready" | "saving" | "saved" | "error">("hidden");
  const [watchState, setWatchState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [members, setMembers] = useState<Member[]>([]);
  const [assignee, setAssignee] = useState("");
  const [dueAt, setDueAt] = useState("");

  const token = useCallback(async () => browserAuthHeaders(db), [db]);
  useEffect(() => {
    void (async () => {
      try {
        const headers = await token();
        if (!headers.Authorization) return;
        const response = await fetch("/api/teams", { headers });
        const body = await response.json();
        const available = Array.isArray(body.teams) ? body.teams.filter((team: Team) => ["owner", "admin", "analyst"].includes(team.role)) : [];
        if (response.ok && available.length) { setTeams(available); setTeamId(available[0].id); setState("ready"); }
      } catch { setState("hidden"); }
    })();
  }, [token]);
  useEffect(() => {
    if (!teamId) return;
    void (async () => {
      try {
        const headers = await token();
        const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/members`, { headers });
        const body = await response.json();
        if (response.ok) setMembers(Array.isArray(body.members) ? body.members : []);
      } catch { setMembers([]); }
    })();
  }, [teamId, token]);
  async function save() {
    if (!teamId) return;
    setState("saving");
    try {
      const headers = await token();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/decisions`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: scanId, decision, assigned_to: assignee || null, due_at: dueAt ? new Date(dueAt).toISOString() : null }) });
      if (response.ok) {
        trackProductEvent({ name: "decision_created", source_route: window.location.pathname, decision: decision as "allow" | "review" | "block" | "exception" });
        setState("saved");
      } else setState("error");
    } catch { setState("error"); }
  }
  async function watch() {
    if (!teamId) return;
    setWatchState("saving");
    try {
      const headers = await token();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/watchlist`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ extension_id: extensionId }) });
      if (response.ok) {
        trackProductEvent({ name: "watch_created", source_route: window.location.pathname, scope: "team" });
        setWatchState("saved");
      } else setWatchState("error");
    } catch { setWatchState("error"); }
  }
  if (state === "hidden") return null;
  return <div className="teamDecisionAction">
    <select aria-label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
    <select aria-label="Decision" value={decision} onChange={(event) => setDecision(event.target.value)}><option value="review">Review</option><option value="allow">Allow</option><option value="block">Block</option><option value="exception">Exception</option></select>
    <select aria-label="Decision owner" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">No owner</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{memberName(member)} · {member.role}</option>)}</select>
    <input aria-label="Review due date" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
    <button className="button buttonQuiet" type="button" onClick={() => void save()} disabled={state === "saving"}><CheckSquare size={15}/>{state === "saving" ? "Saving" : "Save team decision"}</button>
    <button className="button buttonQuiet" type="button" onClick={() => void watch()} disabled={watchState === "saving" || watchState === "saved"}>{watchState === "saved" ? "Watching release" : watchState === "saving" ? "Adding watch" : "Watch release"}</button>
    {state === "saved" ? <span className="actionNotice" role="status">Team decision saved.</span> : null}
    {state === "error" ? <span className="actionError" role="status">Could not save the team decision.</span> : null}
    {watchState === "error" ? <span className="actionError" role="status">Could not add the team watch.</span> : null}
  </div>;
}

function memberName(member: Member) {
  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  return profile?.display_name || member.user_id;
}
