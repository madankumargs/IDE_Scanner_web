"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Plus,
  Radar,
  RotateCcw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import PermissionPassport from "@/app/extensions/PermissionPassport";
import PermissionDiffCard from "@/app/extensions/PermissionDiffCard";
import ReleaseEventQueue from "@/app/ReleaseEventQueue";
import type { QueueDecision } from "@/lib/teamDecisionQueue";
import { buildPermissionPassport } from "@/lib/permissionPassport";
import type {
  DecisionReceipt,
  DecisionSaveResult,
  Member,
} from "@/app/workspace/types";
import {
  decisionScan,
  humanize,
  initials,
  memberLabel,
} from "@/app/workspace/format";
import PageTitle from "@/app/workspace/views/PageTitle";
import { EmptyReview } from "@/app/workspace/views/Overview";
import styles from "@/app/workspace/teamWorkspace.module.css";

type ReviewFilter = "open" | "mine" | "unassigned" | "overdue";
const reviewFilters: Array<{ id: ReviewFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "overdue", label: "Overdue" },
];

function isReviewFilter(value: unknown): value is ReviewFilter {
  return reviewFilters.some((filter) => filter.id === value);
}

function filterReviewDecisions(
  decisions: QueueDecision[],
  filter: ReviewFilter,
  currentUserId: string,
) {
  if (filter === "mine")
    return decisions.filter(
      (decision) => decision.assigned_to === currentUserId,
    );
  if (filter === "unassigned")
    return decisions.filter((decision) => !decision.assigned_to);
  if (filter === "overdue") {
    const now = Date.now();
    return decisions.filter(
      (decision) =>
        decision.due_at && new Date(decision.due_at).getTime() < now,
    );
  }
  return decisions;
}

function persistReviewFilters(
  key: string,
  active: ReviewFilter,
  saved: ReviewFilter[],
) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ active, saved }));
  } catch {
    // Filtering still works when storage is unavailable in a restricted browser.
  }
}

function readReviewFilters(key: string): {
  active: ReviewFilter;
  saved: ReviewFilter[];
} {
  if (typeof window === "undefined") return { active: "open", saved: [] };
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "{}");
    return {
      active: isReviewFilter(stored.active) ? stored.active : "open",
      saved: Array.isArray(stored.saved)
        ? stored.saved.filter(isReviewFilter)
        : [],
    };
  } catch {
    return { active: "open", saved: [] };
  }
}

function DecisionReceiptView({ receipt }: { receipt: DecisionReceipt }) {
  return (
    <>
      <div className={styles.receipt}>
        <span className={styles.receiptIcon}>
          <ClipboardCheck />
        </span>
        <div className={styles.receiptHeading}>
          <span>Recorded successfully</span>
          <h3>{humanize(receipt.decision)} for this exact release</h3>
          <p>
            This receipt proves what GuardRails recorded. The decision remains
            bound to {receipt.extensionId}@{receipt.version}.
          </p>
        </div>
        <dl>
          <div>
            <dt>Extension</dt>
            <dd>{receipt.extensionId}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>
              <code>@{receipt.version}</code>
            </dd>
          </div>
          <div>
            <dt>Decision</dt>
            <dd>{humanize(receipt.decision)}</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{new Date(receipt.recordedAt).toLocaleString()}</dd>
          </div>
          <div className={styles.receiptRationale}>
            <dt>Rationale</dt>
            <dd>{receipt.rationale}</dd>
          </div>
        </dl>
        <div className={styles.receiptIds}>
          <span>
            Decision ID <code>{receipt.decisionId}</code>
          </span>
          <span>
            Audit event <code>{receipt.eventId}</code>
          </span>
        </div>
      </div>
      <footer className={styles.receiptFooter}>
        <Link href="/workspace">Return to inbox</Link>
      </footer>
    </>
  );
}

function ReviewDecisionPanel({
  decision,
  members,
  canDecide,
  saveState,
  onClose,
  onSave,
}: {
  decision: QueueDecision;
  members: Member[];
  canDecide: boolean;
  saveState: string;
  onClose: () => void;
  onSave: (value: string, rationale: string) => Promise<DecisionSaveResult>;
}) {
  const [rationale, setRationale] = useState(decision.rationale || "");
  const [attempt, setAttempt] = useState<{
    value: string;
    rationale: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<DecisionReceipt | null>(null);
  const [saveError, setSaveError] = useState("");
  async function submit(value: string, text: string) {
    const next = { value, rationale: text };
    setAttempt(next);
    setSaveError("");
    const result = await onSave(value, text);
    if (result.ok) setReceipt(result.receipt);
    else setSaveError(result.error);
  }
  return (
    <div
      className={styles.reviewOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.reviewPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-panel-heading"
      >
        <header>
          <div>
            <span>{receipt ? "Decision receipt" : "Exact release review"}</span>
            <h2 id="review-panel-heading">{decision.extension_id}</h2>
            <code>@{decision.version}</code>
          </div>
          <button onClick={onClose} aria-label="Close release review">
            <X />
          </button>
        </header>
        {receipt ? (
          <DecisionReceiptView receipt={receipt} />
        ) : (
          <>
            <div className={styles.reviewPanelBody}>
              <div className={styles.reviewWhy}>
                <span>Why this needs attention</span>
                <h3>Confirm the new package behavior before rollout.</h3>
                <p>
                  GuardRails keeps this decision attached to version{" "}
                  {decision.version}. Future releases must be reviewed
                  separately.
                </p>
                <Link
                  href={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
                >
                  Open files, commands, and network evidence <ArrowRight />
                </Link>
              </div>
              <div className={styles.reviewFacts}>
                <span>
                  <UserRound />
                  <b>Owner</b>
                  {decision.assigned_to
                    ? memberLabel(members, decision.assigned_to)
                    : "Unassigned"}
                </span>
                <span>
                  <Clock3 />
                  <b>Due</b>
                  {decision.due_at
                    ? new Date(decision.due_at).toLocaleDateString()
                    : "No due date"}
                </span>
                <span>
                  <ShieldCheck />
                  <b>Current state</b>
                  {humanize(decision.decision)}
                </span>
              </div>
              <PermissionPassport
                compact
                passport={buildPermissionPassport({
                  extensionId: decision.extension_id,
                  version: decision.version,
                  latestVersion: decision.version,
                  scan: decisionScan(decision),
                })}
                reportHref={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
              />
              <PermissionDiffCard
                compact
                extensionId={decision.extension_id}
                currentVersion={decision.version}
              />
              {canDecide ? (
                <label className={styles.rationaleField}>
                  <span>
                    Decision rationale <b>Required</b>
                  </span>
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    placeholder="Explain why this release is allowed, blocked, or receiving an exception."
                    maxLength={1200}
                  />
                  <small>
                    {rationale.trim().length}/1200 · Saved with the audit record
                  </small>
                </label>
              ) : (
                <div className={styles.readOnlyNotice}>
                  Your Viewer role can inspect evidence but cannot record a
                  decision.
                </div>
              )}
              {saveError ? (
                <div className={styles.reviewSaveError} role="alert">
                  <CircleAlert />
                  <span>
                    <strong>Decision not recorded</strong>
                    {saveError}
                    <small>
                      Your rationale was preserved. You can retry without
                      retyping it.
                    </small>
                  </span>
                  {attempt ? (
                    <button
                      onClick={() =>
                        void submit(attempt.value, attempt.rationale)
                      }
                      disabled={saveState === "saving"}
                    >
                      <RotateCcw /> Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <footer>
              <button onClick={onClose}>Cancel</button>
              {canDecide ? (
                <div>
                  <button
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("exception", rationale.trim())}
                  >
                    Exception
                  </button>
                  <button
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("block", rationale.trim())}
                  >
                    Block release
                  </button>
                  <button
                    className={styles.allowDecision}
                    disabled={!rationale.trim() || saveState === "saving"}
                    onClick={() => void submit("allow", rationale.trim())}
                  >
                    Allow release
                  </button>
                </div>
              ) : null}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

export default function ReviewInbox({
  decisions,
  members,
  currentUserId,
  teamId,
  canDecide,
  saveState,
  onSave,
}: {
  decisions: QueueDecision[];
  members: Member[];
  currentUserId: string;
  teamId: string;
  canDecide: boolean;
  saveState: string;
  onSave: (
    d: QueueDecision,
    v: string,
    rationale?: string,
  ) => Promise<DecisionSaveResult>;
}) {
  const [selected, setSelected] = useState<QueueDecision | null>(null);
  const storageKey = `guardrails:review-filters:${teamId}:${currentUserId}`;
  const [filterState, setFilterState] = useState<{
    active: ReviewFilter;
    saved: ReviewFilter[];
  }>({ active: "open", saved: [] });
  const { active: activeFilter, saved: savedFilters } = filterState;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilterState(readReviewFilters(storageKey)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  const filteredDecisions = filterReviewDecisions(
    decisions,
    activeFilter,
    currentUserId,
  );
  const counts = Object.fromEntries(
    reviewFilters.map(({ id }) => [
      id,
      filterReviewDecisions(decisions, id, currentUserId).length,
    ]),
  ) as Record<ReviewFilter, number>;
  function chooseFilter(filter: ReviewFilter) {
    setFilterState((current) => ({ ...current, active: filter }));
    persistReviewFilters(storageKey, filter, savedFilters);
  }
  function saveCurrentFilter() {
    const next = savedFilters.includes(activeFilter)
      ? savedFilters
      : [...savedFilters, activeFilter];
    setFilterState({ active: activeFilter, saved: next });
    persistReviewFilters(storageKey, activeFilter, next);
  }
  function removeSavedFilter(filter: ReviewFilter) {
    const next = savedFilters.filter((item) => item !== filter);
    setFilterState({ active: activeFilter, saved: next });
    persistReviewFilters(storageKey, activeFilter, next);
  }
  return (
    <>
      <PageTitle
        eyebrow="Review inbox"
        title="Review the update, then decide."
        copy="Prioritized extension releases, connected to their exact evidence and owner."
        action={
          <Link className={styles.primaryAction} href="/registry">
            <Plus /> Add extension
          </Link>
        }
      />
      <ReleaseEventQueue teamId={teamId} />
      <div className={styles.filterBar}>
        {reviewFilters.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeFilter === id}
            className={activeFilter === id ? styles.filterActive : ""}
            onClick={() => chooseFilter(id)}
          >
            {label} <span>{counts[id]}</span>
          </button>
        ))}
        <button
          type="button"
          className={styles.saveFilter}
          disabled={savedFilters.includes(activeFilter)}
          onClick={saveCurrentFilter}
        >
          <Plus />{" "}
          {savedFilters.includes(activeFilter) ? "View saved" : "Save view"}
        </button>
      </div>
      {savedFilters.length ? (
        <div className={styles.savedFilters} aria-label="Saved review views">
          <strong>Saved views</strong>
          {savedFilters.map((filter) => (
            <span key={filter}>
              <button type="button" onClick={() => chooseFilter(filter)}>
                {reviewFilters.find((item) => item.id === filter)?.label}
              </button>
              <button
                type="button"
                aria-label={`Remove ${filter} saved view`}
                onClick={() => removeSavedFilter(filter)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <section className={styles.inboxList}>
        {filteredDecisions.length ? (
          filteredDecisions.map((decision, index) => (
            <article key={decision.id} className={styles.inboxCard}>
              <div className={styles.inboxIdentity}>
                <div className={styles.extensionAvatar}>
                  {initials(decision.extension_id)}
                </div>
                <div>
                  <span>
                    {index === 0 ? "High priority" : "Ready for review"}
                  </span>
                  <h2>{decision.extension_id}</h2>
                  <code>Release @{decision.version}</code>
                </div>
              </div>
              <div className={styles.changeSummary}>
                <span>Why it matters</span>
                <strong>
                  {index === 0
                    ? "New behavior was detected in this release."
                    : "The new package is ready for comparison."}
                </strong>
                <p>
                  Review files, commands, connections, and permission changes
                  before recording the decision.
                </p>
              </div>
              <div className={styles.inboxMeta}>
                <span>
                  <UserRound />{" "}
                  {decision.assigned_to
                    ? memberLabel(members, decision.assigned_to)
                    : "Unassigned"}
                </span>
                <span>
                  <Radar /> Evidence ready
                </span>
              </div>
              <div className={styles.inboxActions}>
                <button
                  className={styles.reviewButton}
                  onClick={() => setSelected(decision)}
                >
                  Review release <ArrowRight />
                </button>
                <Link
                  href={`/extensions/${encodeURIComponent(decision.extension_id)}/versions/${encodeURIComponent(decision.version)}`}
                >
                  Open full evidence
                </Link>
              </div>
            </article>
          ))
        ) : activeFilter === "mine" ? (
          <div className={styles.personalEmpty}>
            <UserRound />
            <h2>Nothing is assigned to you.</h2>
            <p>
              Your personal queue is clear. Open another saved view or ask a
              workspace owner to assign a release.
            </p>
            <button type="button" onClick={() => chooseFilter("open")}>
              View every open review
            </button>
          </div>
        ) : (
          <EmptyReview />
        )}
      </section>
      {selected ? (
        <ReviewDecisionPanel
          decision={selected}
          members={members}
          canDecide={canDecide}
          saveState={saveState}
          onClose={() => setSelected(null)}
          onSave={(value, rationale) => onSave(selected, value, rationale)}
        />
      ) : null}
      {saveState !== "idle" ? (
        <div
          className={`${styles.toast} ${saveState === "error" ? styles.toastError : ""}`}
        >
          {saveState === "saving"
            ? "Recording decision…"
            : saveState === "saved"
              ? "Decision recorded and added to the audit trail."
              : "Decision could not be saved. Your rationale is still here."}
        </div>
      ) : null}
    </>
  );
}
