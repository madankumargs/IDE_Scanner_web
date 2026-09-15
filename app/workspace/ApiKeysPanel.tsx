"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, KeyRound, LoaderCircle, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import styles from "./apiKeysPanel.module.css";

type ApiKeyRow = {
  id: string;
  label: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export default function ApiKeysPanel({ teamId, getAuthHeaders }: { teamId: string; getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading"); setMessage("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/api-keys`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(String(body.error || "API keys could not be loaded.")); setState("error"); return; }
      setKeys(Array.isArray(body.api_keys) ? body.api_keys : []); setState("ready");
    } catch { setMessage("API keys could not be loaded."); setState("error"); }
  }, [getAuthHeaders, teamId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function createKey() {
    const trimmed = label.trim();
    if (!trimmed) { setCreateError("Give this key a label, e.g. \"CI pipeline\"."); return; }
    setCreating(true); setCreateError(""); setIssued(null); setCopied(false);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/api-keys`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setCreateError(String(body.error || "The key could not be created.")); setCreating(false); return; }
      setIssued({ label: trimmed, key: String(body.api_key?.key || "") });
      setLabel("");
      setCreating(false);
      void load();
    } catch { setCreateError("The key could not be created."); setCreating(false); }
  }

  async function revokeKey(id: string) {
    setRevoking(id);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/api-keys?key_id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (response.ok) void load();
    } finally {
      setRevoking(null);
    }
  }

  if (state === "loading") return <div className={styles.state}><LoaderCircle className={styles.spin} /><strong>Loading API keys</strong></div>;
  if (state === "error") return <div className={styles.state} role="alert"><ShieldAlert /><strong>API keys unavailable</strong><p>{message}</p><button onClick={() => void load()}><RefreshCw /> Try again</button></div>;

  const active = keys.filter((k) => !k.revoked_at);

  return (
    <div className={styles.panel}>
      <header>
        <div>
          <span>Programmatic access</span>
          <h2>API keys</h2>
          <p>Check an entire extension inventory in one call with <code>POST /api/gate/bulk</code> instead of clicking through the UI one release at a time. Available on the Team plan and above.</p>
        </div>
        <KeyRound />
      </header>

      {issued ? (
        <div className={styles.issued} role="status">
          <strong>{issued.label} — copy this key now.</strong>
          <p>It will not be shown again. Store it in your CI secrets as <code>GUARDRAILS_API_KEY</code>.</p>
          <div className={styles.issuedKey}>
            <code>{issued.key}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(issued.key).then(() => setCopied(true)).catch(() => {});
              }}
            >
              <ClipboardCheck /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.createRow}>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Key label, e.g. CI pipeline"
          aria-label="New API key label"
          maxLength={80}
        />
        <button onClick={() => void createKey()} disabled={creating}>
          <Plus /> {creating ? "Creating…" : "Create key"}
        </button>
      </div>
      {createError ? <p className={styles.error} role="alert">{createError}</p> : null}

      <div className={styles.keyTable}>
        <header>
          <span>Label</span>
          <span>Key</span>
          <span>Last used</span>
          <span />
        </header>
        {active.map((key) => (
          <article key={key.id}>
            <strong>{key.label}</strong>
            <code>{key.key_prefix}…</code>
            <span>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never used"}</span>
            <button
              aria-label={`Revoke ${key.label}`}
              onClick={() => void revokeKey(key.id)}
              disabled={revoking === key.id}
            >
              <Trash2 /> {revoking === key.id ? "Revoking…" : "Revoke"}
            </button>
          </article>
        ))}
        {!active.length ? <p>No active API keys. Create one to script bulk gate checks in CI.</p> : null}
      </div>
    </div>
  );
}
