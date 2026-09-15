"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Laptop, LoaderCircle, Radar, RefreshCw, Upload } from "lucide-react";
import styles from "./teamInventory.module.css";

type InventoryItem = {
  device_id: string;
  extension_id: string;
  display_name: string;
  version: string;
  registry: string;
  status: "scanned" | "review_required" | "unscanned" | "unknown";
  monitored: boolean;
  decision: string | null;
  severity: string | null;
};
type InventoryPayload = {
  devices: Array<{ id: string; display_name: string; platform: string; last_seen_at: string }>;
  items: InventoryItem[];
  summary: { devices: number; installations: number; unique_extensions: number; scanned: number; review_required: number; unscanned: number; unknown: number; monitored: number };
  last_import_at: string | null;
};

const example = JSON.stringify({
  device: { id: "engineering-laptop-01", name: "Engineering laptop", platform: "linux" },
  reported_at: new Date().toISOString(),
  source: "json",
  extensions: [
    { extension_id: "GitHub.copilot", version: "1.388.0", registry: "vs-marketplace" },
    { extension_id: "dbaeumer.vscode-eslint", version: "3.0.10", registry: "vs-marketplace" },
  ],
}, null, 2);

export default function TeamInventoryPanel({ teamId, role, getAuthHeaders }: { teamId: string; role: string; getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [data, setData] = useState<InventoryPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [document, setDocument] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canManage = ["owner", "admin", "analyst"].includes(role);

  const load = useCallback(async () => {
    setState("loading"); setError("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/inventory`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Inventory could not be loaded."));
      setData(body as InventoryPayload); setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inventory could not be loaded."); setState("error");
    }
  }, [getAuthHeaders, teamId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const uniqueItems = useMemo(() => {
    const rows = new Map<string, InventoryItem>();
    for (const item of data?.items || []) if (!rows.has(item.extension_id.toLowerCase())) rows.set(item.extension_id.toLowerCase(), item);
    return [...rows.values()];
  }, [data]);
  const monitorable = uniqueItems.filter((item) => item.status !== "unknown" && !item.monitored);

  async function importInventory() {
    setSaving(true); setError(""); setNotice("");
    try {
      const parsed = JSON.parse(document);
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/inventory`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(parsed) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error || "Inventory could not be imported."));
      setNotice(`Imported ${Number(body.import?.extension_count || 0)} extensions.`); setImportOpen(false); setDocument(""); await load();
    } catch (cause) {
      setError(cause instanceof SyntaxError ? "The selected file is not valid JSON." : cause instanceof Error ? cause.message : "Inventory could not be imported.");
    } finally { setSaving(false); }
  }

  async function monitorDiscovered() {
    setSaving(true); setError(""); setNotice("");
    const headers = await getAuthHeaders();
    const results = await Promise.allSettled(monitorable.map(async (item) => {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/watchlist`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ extension_id: item.extension_id }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(String(body.error || `Could not monitor ${item.extension_id}.`)); }
    }));
    const completed = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - completed;
    if (failed) setError(`${completed} extensions were added to monitoring; ${failed} could not be added.`);
    else setNotice(`${completed} extensions added to monitoring.`);
    setSaving(false); await load();
  }

  function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { setError("Inventory files must be smaller than 1 MB."); return; }
    void file.text().then((value) => { setDocument(value); setImportOpen(true); setError(""); });
  }

  return <section className={styles.inventory}>
    <header className={styles.title}><div><span>Team inventory</span><h1>Know what is installed before deciding what is allowed.</h1><p>Import a device snapshot, measure exact-version coverage, and move registry-known extensions into continuous monitoring.</p></div><div><button onClick={() => void load()}><RefreshCw/> Refresh</button>{canManage ? <label><Upload/> Import JSON<input type="file" accept="application/json,.json" onChange={readFile}/></label> : null}</div></header>
    {error ? <div className={styles.error}><AlertTriangle/><span>{error}</span>{state === "error" ? <button onClick={() => void load()}>Try again</button> : null}</div> : null}
    {notice ? <div className={styles.notice}><CheckCircle2/>{notice}</div> : null}
    {importOpen ? <section className={styles.importer}><header><div><FileJson/><span><strong>Import one device snapshot</strong><small>JSON only · maximum 1,000 extensions · current device state replaces its previous snapshot</small></span></div><button onClick={() => setDocument(example)}>Load example</button></header><textarea aria-label="Inventory JSON" value={document} onChange={(event) => setDocument(event.target.value)} spellCheck={false}/><footer><button onClick={() => { setImportOpen(false); setDocument(""); }}>Cancel</button><button disabled={saving || !document.trim()} onClick={() => void importInventory()}>{saving ? <LoaderCircle className={styles.spin}/> : <Upload/>} Import inventory</button></footer></section> : null}
    {state === "loading" && !data ? <div className={styles.loading}><LoaderCircle className={styles.spin}/> Loading team inventory…</div> : null}
    {data ? <>
      <div className={styles.metrics}><article><span>Devices</span><strong>{data.summary.devices}</strong><small>Reporting endpoints</small></article><article><span>Unique extensions</span><strong>{data.summary.unique_extensions}</strong><small>{data.summary.installations} installations</small></article><article><span>Exact versions scanned</span><strong>{data.summary.scanned}</strong><small>{data.summary.review_required} need review</small></article><article><span>Unknown or unscanned</span><strong>{data.summary.unknown + data.summary.unscanned}</strong><small>Coverage to close</small></article></div>
      <div className={styles.toolbar}><span>{data.last_import_at ? `Last import ${new Date(data.last_import_at).toLocaleString()}` : "No inventory has been imported yet."}</span>{canManage && monitorable.length ? <button disabled={saving} onClick={() => void monitorDiscovered()}><Radar/> Monitor {monitorable.length} discovered</button> : null}</div>
      {uniqueItems.length ? <div className={styles.table}><header><span>Extension</span><span>Installed</span><span>Evidence</span><span>Monitoring</span></header>{uniqueItems.map((item) => <article key={item.extension_id}><div><strong>{item.display_name}</strong><code>{item.extension_id}</code></div><code>@{item.version}</code><span className={styles[item.status]}>{statusLabel(item.status)}</span><span>{item.monitored ? "Monitored" : "Not monitored"}</span></article>)}</div> : <div className={styles.empty}><Laptop/><h2>No team inventory yet.</h2><p>Export installed extensions from a development machine and import the JSON snapshot. GuardRails stores extension identifiers and versions, not local paths or source files.</p>{canManage ? <button onClick={() => { setDocument(example); setImportOpen(true); }}>Start with an example</button> : null}</div>}
    </> : null}
  </section>;
}

function statusLabel(status: InventoryItem["status"]) {
  return ({ scanned: "Scanned", review_required: "Review required", unscanned: "Scan needed", unknown: "Not in registry" })[status];
}
