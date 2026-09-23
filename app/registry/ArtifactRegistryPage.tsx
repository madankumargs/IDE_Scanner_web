import { Search, ScanSearch, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./registry.module.css";

export default function ArtifactRegistryPage({ kind, title, description, placeholder }: { kind: string; title: ReactNode; description: string; placeholder: string }) {
  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}><i/> {kind} intelligence</span><h1>{title}</h1><p>{description}</p></div>
      <div className={styles.searchPanel}><div className={styles.searchHeading}><span><ScanSearch/> Search the registry</span><small>Source-aware analysis</small></div><div className={styles.discoverySearch}><form className={styles.artifactSearch} action={`/registry/${kind.toLowerCase().replace(/\s+/g, "-")}`} method="get"><Search aria-hidden="true"/><input name="q" placeholder={placeholder} aria-label={`Search ${kind}`} /><button type="submit">Find {kind.toLowerCase()}</button></form></div><footer><ShieldCheck/><span>Results are tied to the exact source and version scanned.</span></footer></div>
    </section>
    <section className={styles.catalog}><header className={styles.catalogHeader}><div><span className={styles.eyebrow}><i/> Catalog</span><h2>Review before<br/>you connect.</h2></div><p>{description} Search by repository, package, or source URL to begin an evidence-backed review.</p></header><div className={styles.empty}><ScanSearch/><h3>No {kind.toLowerCase()} results yet</h3><p>Enter a public source above to queue an exact artifact scan. Curated catalog entries will appear here as they are published.</p></div></section>
  </main>;
}
