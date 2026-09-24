import DossierSectionHead from "@/app/dossier/DossierSectionHead";
import styles from "./artifactFindings.module.css";
import type { Finding } from "@/lib/artifactScan/types";

export default function ArtifactFindingsSection({ findings }: { findings: Finding[] }) {
  return <><DossierSectionHead eyebrow="Artifact evidence" title="Findings from the source scan" detail="Each observation is tied to a file and includes a concrete remediation for review." />{findings.length ? <div className={styles.list}>{findings.map((item, index) => <article className={styles.finding} key={`${item.file}:${item.line || 0}:${item.category}:${index}`}><header><span className={`${styles.severity} ${styles[item.severity]}`}>{item.severity.toUpperCase()}</span><strong>{item.title}</strong><code>{item.category}</code></header><p>{item.description}</p><dl><div><dt>Location</dt><dd>{item.file}{item.line ? `:${item.line}` : ""}</dd></div>{item.snippet ? <div><dt>Observed</dt><dd><code>{item.snippet}</code></dd></div> : null}<div><dt>Remediation</dt><dd>{item.remediation}</dd></div></dl></article>)}</div> : <div className="dossierEmpty"><p>No findings matched across the analyzed source.</p></div>}</>;
}
