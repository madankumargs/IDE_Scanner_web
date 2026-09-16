"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import ApiKeysPanel from "@/app/workspace/ApiKeysPanel";
import BillingPanel from "@/app/workspace/BillingPanel";
import type { Member, Team } from "@/app/workspace/types";
import { initials, memberName, roleName } from "@/app/workspace/format";
import PageTitle from "@/app/workspace/views/PageTitle";
import styles from "@/app/workspace/teamWorkspace.module.css";

export default function SettingsView({
  team,
  members,
  currentUserId,
  onMutateMember,
  onCreateInvite,
  notificationSettings,
  getAuthHeaders,
}: {
  team: Team;
  members: Member[];
  currentUserId: string;
  onMutateMember: (
    memberId: string,
    role: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCreateInvite: (
    role: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  notificationSettings: React.ReactNode;
  getAuthHeaders: () => Promise<Record<string, string>>;
}) {
  const [section, setSection] = useState<
    "general" | "members" | "notifications" | "api"
  >("general");
  const [pending, setPending] = useState<{
    kind: "role" | "remove";
    member: Member;
    role?: string;
  } | null>(null);
  const [mutationState, setMutationState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [mutationMessage, setMutationMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState("analyst");
  const [inviteState, setInviteState] = useState<
    "idle" | "saving" | "ready" | "error"
  >("idle");
  const [inviteMessage, setInviteMessage] = useState("");
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const canManage = team.role === "owner" || team.role === "admin";
  const roles = [
    {
      id: "owner",
      name: "Owner",
      copy: "Controls membership, integrations, and every workspace decision.",
    },
    {
      id: "admin",
      name: "Administrator",
      copy: "Manages people, delivery, monitoring, and review workflows.",
    },
    {
      id: "analyst",
      name: "Security analyst",
      copy: "Monitors extensions and records evidence-backed decisions.",
    },
    {
      id: "viewer",
      name: "Viewer",
      copy: "Reads reports, decisions, and activity without changing them.",
    },
  ];

  function canEdit(member: Member) {
    if (!canManage) return false;
    if (team.role === "owner") return true;
    return member.role === "analyst" || member.role === "viewer";
  }

  async function confirmMutation() {
    if (!pending) return;
    setMutationState("saving");
    setMutationMessage("");
    const result = await onMutateMember(
      pending.member.user_id,
      pending.kind === "role" ? pending.role || null : null,
    );
    if (result.ok) {
      setMutationState("saved");
      setMutationMessage(
        pending.kind === "role"
          ? `${memberName(pending.member)} is now ${roleName(pending.role || "viewer")}.`
          : `${memberName(pending.member)} was removed from the workspace.`,
      );
      setPending(null);
      window.setTimeout(() => setMutationState("idle"), 3500);
    } else {
      setMutationState("error");
      setMutationMessage(result.error);
    }
  }

  async function createInvite() {
    setInviteState("saving");
    setInviteMessage("");
    const result = await onCreateInvite(inviteRole);
    if (result.ok) {
      setInviteState("ready");
      setInviteMessage(result.url);
    } else {
      setInviteState("error");
      setInviteMessage(result.error);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Workspace settings"
        title={`Manage ${team.name}.`}
        copy="Membership, delivery, and security controls for this workspace."
      />
      <div className={styles.settingsLayout}>
        <nav aria-label="Workspace settings">
          <button
            className={section === "general" ? styles.settingsActive : ""}
            onClick={() => setSection("general")}
          >
            General
          </button>
          <button
            className={section === "members" ? styles.settingsActive : ""}
            onClick={() => setSection("members")}
          >
            Members & roles
          </button>
          <button
            className={section === "notifications" ? styles.settingsActive : ""}
            onClick={() => setSection("notifications")}
          >
            Notifications
          </button>
          <button
            className={section === "api" ? styles.settingsActive : ""}
            onClick={() => setSection("api")}
          >
            API keys
          </button>
        </nav>
        <section>
          {section === "general" ? (
            <>
              <div className={styles.settingBlock}>
                <span>Workspace</span>
                <h2>General information</h2>
                <label>
                  Workspace name
                  <input value={team.name} readOnly />
                </label>
                <label>
                  Your role
                  <input value={roleName(team.role)} readOnly />
                </label>
              </div>
              <BillingPanel teamId={team.id} getAuthHeaders={getAuthHeaders} />
              <div className={styles.settingBlock}>
                <span>Access model</span>
                <h2>Who can change a release decision</h2>
                <div className={styles.roleGuide}>
                  {roles.map((role) => (
                    <article key={role.id}>
                      <UserCog />
                      <div>
                        <strong>{role.name}</strong>
                        <p>{role.copy}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : section === "members" ? (
            <>
              <div className={styles.memberHeader}>
                <div>
                  <span>People and access</span>
                  <h2>
                    {members.length} workspace member
                    {members.length === 1 ? "" : "s"}
                  </h2>
                  <p>
                    Role changes take effect immediately after confirmation and
                    are enforced by the workspace API.
                  </p>
                </div>
                {canManage ? (
                  <button
                    className={styles.inviteMemberButton}
                    onClick={() => {
                      setInviteOpen((value) => !value);
                      setInviteState("idle");
                      setInviteMessage("");
                    }}
                  >
                    <Plus /> Invite member
                  </button>
                ) : null}
              </div>
              {inviteOpen ? (
                <div className={styles.inviteMemberPanel}>
                  <div>
                    <span>Seven-day invitation</span>
                    <strong>Choose the access new members receive.</strong>
                    <p>
                      Owner access is never granted through an invitation. An
                      existing owner can promote the member later.
                    </p>
                  </div>
                  <label>
                    Starting role
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                    >
                      <option value="admin">Administrator</option>
                      <option value="analyst">Security analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <button
                    onClick={() => void createInvite()}
                    disabled={inviteState === "saving"}
                  >
                    {inviteState === "saving"
                      ? "Creating link…"
                      : "Create invitation link"}
                  </button>
                  {inviteState === "ready" ? (
                    <div className={styles.inviteResult} role="status">
                      <input
                        aria-label="Invitation link"
                        value={inviteMessage}
                        readOnly
                      />
                      <button
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(inviteMessage)
                            .catch(() => {})
                        }
                      >
                        <ClipboardCheck /> Copy link
                      </button>
                    </div>
                  ) : null}
                  {inviteState === "error" ? (
                    <div className={styles.inviteError} role="alert">
                      <CircleAlert />
                      <span>{inviteMessage}</span>
                      <button onClick={() => void createInvite()}>
                        <RotateCcw /> Retry
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!canManage ? (
                <div className={styles.memberNotice}>
                  <ShieldCheck />
                  <span>
                    <strong>Read-only membership directory</strong>Only owners
                    and administrators can change workspace access.
                  </span>
                </div>
              ) : null}
              {mutationState === "saved" ? (
                <div className={styles.memberSuccess} role="status">
                  <CheckCircle2 />
                  {mutationMessage}
                </div>
              ) : null}
              {mutationState === "error" ? (
                <div className={styles.memberError} role="alert">
                  <CircleAlert />
                  <span>
                    <strong>Membership unchanged</strong>
                    {mutationMessage}
                  </span>
                  <button
                    onClick={() => void confirmMutation()}
                    disabled={!pending}
                  >
                    <RotateCcw /> Retry
                  </button>
                </div>
              ) : null}
              <div className={styles.memberTable}>
                <header>
                  <span>Member</span>
                  <span>Workspace role</span>
                  <span>Access</span>
                </header>
                {members.map((member) => {
                  const finalOwner =
                    member.role === "owner" && ownerCount === 1;
                  const editable = canEdit(member) && !finalOwner;
                  const choices =
                    team.role === "owner"
                      ? roles
                      : roles.filter(
                          (role) =>
                            role.id === "analyst" || role.id === "viewer",
                        );
                  return (
                    <article key={member.user_id}>
                      <span className={styles.memberAvatar}>
                        {initials(memberName(member))}
                      </span>
                      <div>
                        <strong>
                          {memberName(member)}{" "}
                          {member.user_id === currentUserId ? (
                            <em>You</em>
                          ) : null}
                        </strong>
                        <small>{member.user_id}</small>
                      </div>
                      <label>
                        <span className={styles.srOnly}>
                          Role for {memberName(member)}
                        </span>
                        <select
                          value={member.role}
                          disabled={!editable}
                          onChange={(event) =>
                            setPending({
                              kind: "role",
                              member,
                              role: event.target.value,
                            })
                          }
                        >
                          {choices.some(
                            (role) => role.id === member.role,
                          ) ? null : (
                            <option value={member.role}>
                              {roleName(member.role)}
                            </option>
                          )}
                          {choices.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.memberAccess}>
                        <span>
                          {finalOwner
                            ? "Final owner protected"
                            : editable
                              ? "Can be changed"
                              : "Protected by your role"}
                        </span>
                        {editable ? (
                          <button
                            aria-label={`Remove ${memberName(member)}`}
                            onClick={() =>
                              setPending({ kind: "remove", member })
                            }
                          >
                            <Trash2 />
                          </button>
                        ) : (
                          <ShieldCheck />
                        )}
                      </div>
                    </article>
                  );
                })}
                {!members.length ? <p>Member directory is empty.</p> : null}
              </div>
            </>
          ) : section === "notifications" ? (
            notificationSettings
          ) : (
            <ApiKeysPanel teamId={team.id} getAuthHeaders={getAuthHeaders} />
          )}
        </section>
      </div>
      {pending ? (
        <div
          className={styles.memberConfirmOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              mutationState !== "saving"
            )
              setPending(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-confirm-title"
          >
            <span>
              <UserCog />
            </span>
            <h2 id="member-confirm-title">
              {pending.kind === "role"
                ? "Confirm role change"
                : pending.member.user_id === currentUserId
                  ? "Leave this workspace?"
                  : "Remove workspace access?"}
            </h2>
            <p>
              {pending.kind === "role"
                ? `${memberName(pending.member)} will become ${roleName(pending.role || "viewer")}. Their available actions change immediately.`
                : `${memberName(pending.member)} will lose access to this workspace, its reports, decisions, and monitoring activity.`}
            </p>
            {pending.member.role === "owner" ? (
              <div className={styles.ownerWarning}>
                <CircleAlert />
                Owner changes can affect administration and recovery. GuardRails
                will never allow the final owner to be removed or demoted.
              </div>
            ) : null}
            <footer>
              <button
                onClick={() => {
                  setPending(null);
                  setMutationState("idle");
                }}
                disabled={mutationState === "saving"}
              >
                Cancel
              </button>
              <button
                className={
                  pending.kind === "remove"
                    ? styles.dangerAction
                    : styles.confirmAction
                }
                onClick={() => void confirmMutation()}
                disabled={mutationState === "saving"}
              >
                {mutationState === "saving"
                  ? "Applying change…"
                  : pending.kind === "role"
                    ? "Confirm role change"
                    : "Remove access"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
