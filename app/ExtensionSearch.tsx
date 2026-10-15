"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Search, Star, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ExtensionIcon from "@/app/ExtensionIcon";
import type { DiscoveryResponse, DiscoveryResult } from "@/lib/types";

type Props = {
  initialQuery?: string;
  onSelect?: (item: DiscoveryResult) => void;
  submitLabel?: string;
  compact?: boolean;
};

export default function ExtensionSearch({ initialQuery = "", onSelect, submitLabel = "Search", compact = false }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(initialQuery));
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  async function search(value = query) {
    const clean = value.trim();
    if (!clean) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(""); setData(null);
    try {
      const response = await fetch(`/api/marketplace/search?q=${encodeURIComponent(clean)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Registry search is unavailable.");
      if (!controller.signal.aborted) setData(body as DiscoveryResponse);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Registry search is unavailable.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => { if (!initialQuery) return; const timer = window.setTimeout(() => { void search(initialQuery); }, 0); return () => window.clearTimeout(timer); // initial route query is an external navigation input
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);
  const profileHref = (item: DiscoveryResult) => `/extensions/${encodeURIComponent(item.extension_id)}`;
  const open = (item: DiscoveryResult) => onSelect ? <button type="button" onClick={() => onSelect(item)}>Choose release <ArrowRight size={15}/></button> : <Link className="discoveryProfileLink" href={profileHref(item)} aria-label={`Open ${item.display_name} extension profile`}>Open profile <ArrowRight size={15}/></Link>;
  return <div className={`extensionSearch ${compact ? "compact" : ""}`}>
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, publisher.extension, Marketplace URL, or VS Code URI" aria-label="Find an extension"/>
      <button className="button buttonDark" disabled={loading}>{loading ? "Searching…" : submitLabel}</button>
    </form>
    {loading ? <p className="discoveryLoading" role="status">Searching the Extension Registry…</p> : null}
    {error ? <p className="discoveryError">{error}</p> : null}
    {data ? <div className="discoveryResults" aria-live="polite">
      {data.matching_publishers?.length ? <section className="publisherMatches"><span>Publisher</span>{data.matching_publishers.map((publisher) => <Link key={`${publisher.registry}-${publisher.publisher}`} href={`/publishers/${encodeURIComponent(publisher.publisher)}`}><UsersRound/><div><strong>{publisher.display_name}{publisher.verified ? <BadgeCheck aria-label="Verified Marketplace publisher"/> : null}</strong><small>@{publisher.publisher} · View published extensions</small></div><ArrowRight/></Link>)}</section> : null}
      {data.exact_match ? <ResultGroup label={data.exact_match.match_reason === "exact_identity" ? "Exact identity match" : "Exact extension name"} items={[data.exact_match]} action={open}/> : <p className="exactMiss">No exact match for <code>{data.query}</code>. Related extensions are shown below; choose a release explicitly.</p>}
      {data.matching_extensions.length ? <ResultGroup label="Matching extensions" items={data.matching_extensions} action={open}/> : null}
      {data.related_extensions.length ? <ResultGroup label="Related extensions" items={data.related_extensions} action={open}/> : null}
      {!data.exact_match && !data.matching_extensions.length && !data.related_extensions.length ? <p className="exactMiss">No registry results were returned. This is distinct from a provider failure.</p> : null}
    </div> : null}
  </div>;
}

function ResultGroup({ label, items, action }: { label: string; items: DiscoveryResult[]; action: (item: DiscoveryResult) => React.ReactNode }) {
  return <section className="discoveryGroup"><span>{label}</span>{items.map((item) => <article key={`${item.registry}-${item.extension_id}`}><ExtensionIcon iconUrl={item.icon_url} publisher={item.publisher} name={item.display_name}/><div><strong>{item.display_name}{item.publisher_verified ? <BadgeCheck aria-label="Verified Marketplace publisher"/> : null}</strong><code>{item.extension_id} · {item.version}</code><small>{item.registry === "openvsx" ? "Open VSX" : "VS Marketplace"} · {formatInstalls(item.install_count)} installs{item.rating_count ? <> · <Star/> {item.rating_average.toFixed(1)} ({formatInstalls(item.rating_count)})</> : ""}</small></div>{action(item)}</article>)}</section>;
}

function formatInstalls(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
