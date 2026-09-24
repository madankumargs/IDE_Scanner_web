import { ScanSearch, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import ArtifactScanForm from "./ArtifactScanForm";
import type { ArtifactKind } from "@/lib/artifactScan/types";
import styles from "./registry.module.css";

export default function ArtifactRegistryPage({ kind, artifactKind, title, description, placeholder }: { kind: string; artifactKind: ArtifactKind; title: ReactNode; description: string; placeholder: string }) {
  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}><i/> {kind} intelligence</span><h1>{title}</h1><p>{description}</p></div>
      <div className={styles.searchPanel}><div className={styles.searchHeading}><span><ScanSearch/> Search the registry</span><small>Source-aware analysis</small></div><div className={styles.discoverySearch}><ArtifactScanForm kind={artifactKind} placeholder={placeholder}/></div><footer><ShieldCheck/><span>Results are tied to the exact source and version scanned.</span></footer></div>
    </section>
    <section className={styles.catalog}><header className={styles.catalogHeader}><div><span className={styles.eyebrow}><i/> Catalog</span><h2>Review before<br/>you connect.</h2></div><p>{description} Search by repository, package, or source URL to begin an evidence-backed review.</p></header><div className={styles.empty}><ScanSearch/><h3>No {kind.toLowerCase()} results yet</h3><p>Enter a public source above to queue an exact artifact scan. Curated catalog entries will appear here as they are published.</p></div></section>
  </main>;
}
