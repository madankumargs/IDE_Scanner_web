"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, LoaderCircle, Search, ShieldAlert, TriangleAlert } from "lucide-react";
import type { PublicSkill, PublicSkillSearch } from "@/lib/skillsCatalog";
import styles from "./skills.module.css";

type ErrorPayload = { error?: string };

export default function SkillsCatalogClient() {
  const [query, setQuery] = useState("");
  const [payload, setPayload] = useState<PublicSkillSearch | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  async function load(nextQuery = "") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/skills/catalog${nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ""}`, { cache: "no-store" });
      const body = (await response.json()) as PublicSkillSearch & ErrorPayload;
      if (!response.ok) throw new Error(body.error || "The public Skills catalog is unavailable.");
      setPayload(body);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "The public Skills catalog is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    void load(query.trim());
  }

  return <section className={styles.catalogPanel} aria-labelledby="skills-catalog-heading">
    <header className={styles.catalogHeader}><div><span className={styles.eyebrow}><i/> Public Skills directory</span><h2 id="skills-catalog-heading">Find a Skill before you scan it.</h2><p>Searches the public skills.sh index for ranked matches, then keeps the source link visible so discovery never becomes a safety verdict.</p></div><div className={styles.catalogBoundary}><BookOpen/><span>Discovery only</span><strong>Scan before install</strong></div></header>
    <form className={styles.catalogSearch} onSubmit={submit}><label htmlFor="skills-catalog-query">Search public Skills</label><div><Search/><input id="skills-catalog-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Andrej Karpathy, React Native, or browser testing" autoComplete="off"/><button type="submit" disabled={busy || query.trim().length < 2}>{busy ? <LoaderCircle className={styles.spin}/> : <Search/>}<span>{busy ? "Loading" : "Search"}</span></button></div><small>Public index results · install counts are popularity signals, not GuardRails decisions</small></form>
    {error && <div className={styles.catalogError} role="alert"><TriangleAlert/><span>{error}</span><button type="button" onClick={() => void load(query.trim())}>Retry</button></div>}
    {payload && <><div className={styles.catalogResultHeader}><div><span className={styles.eyebrow}><i/> {payload.query ? "Search results" : "Recommended public Skills"}</span><h3>{payload.query ? `Matches for “${payload.query}”` : "A starting set from the public index"}</h3></div><span>{payload.results.length}{payload.limited ? "+" : ""} result{payload.results.length === 1 ? "" : "s"} · {payload.effectiveQuery !== payload.query ? `searched as “${payload.effectiveQuery}”` : payload.searchType}</span></div>{payload.results.length ? <div className={styles.catalogGrid}>{payload.results.map((skill) => <SkillCard key={skill.id} skill={skill}/>)}</div> : <div className={styles.catalogEmpty}><ShieldAlert/><strong>No indexed match yet.</strong><p>Try a capability, product, or person’s name. You can still scan any public GitHub Skill directly below.</p></div>}</>}
  </section>;
}

function SkillCard({ skill }: { skill: PublicSkill }) {
  return <article className={styles.skillCard}><div className={styles.skillCardTop}><span className={styles.skillPill}>{skill.sourceType === "github" ? "GitHub" : "Public source"}</span>{skill.duplicate && <span className={styles.duplicatePill}>Duplicate signal</span>}</div><h4>{skill.name}</h4><p className={styles.skillSource}>{skill.source}</p><p className={styles.skillMeta}>{skill.installs.toLocaleString()} indexed installs · not yet a GuardRails decision</p><div className={styles.skillCardActions}><a href={skill.catalogUrl} target="_blank" rel="noreferrer">View catalog <ArrowUpRight/></a>{skill.githubUrl && <a href={skill.githubUrl} target="_blank" rel="noreferrer">Open source <ArrowUpRight/></a>}</div></article>;
}
