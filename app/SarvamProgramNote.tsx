import { ArrowUpRight, Sparkles } from "lucide-react";
import styles from "./sarvamProgramNote.module.css";

export default function SarvamProgramNote() {
  return (
    <section className={styles.note} id="sarvam-ai" aria-labelledby="sarvam-heading">
      <div className={styles.signal} aria-hidden="true">
        <Sparkles />
      </div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>Sarvam AI Startup Program</p>
        <h2 id="sarvam-heading">Turn an exact release report into a reviewer guide.</h2>
        <p>
          GuardRails has been accepted into Sarvam AI&apos;s Startup Program. We&apos;re exploring Sarvam APIs for a bounded interpretation layer across three review jobs:
          decide whether to install, investigate a flagged release, or prepare
          a publisher response.
        </p>
        <p className={styles.disclosure}>
          Each guide cites exact report evidence. The deterministic decision remains authoritative. It stays grounded in exact artifacts, published evidence, and version-specific analysis. If the report cannot establish a
          trigger → action → target chain, the guide says that chain is
          unavailable; if generation fails, the report remains usable.
        </p>
        <div className={styles.links}>
          <a href="https://indus.sarvam.ai" target="_blank" rel="noreferrer">
            Open Sarvam Indus <ArrowUpRight />
          </a>
          <a href="https://docs.sarvam.ai" target="_blank" rel="noreferrer">
            Read the API docs <ArrowUpRight />
          </a>
        </div>
      </div>
      <aside className={styles.meta} aria-label="Sarvam AI program status">
        <span>Program relationship</span>
        <strong>Evidence-cited reviewer guides</strong>
        <small>Install decision · flagged-release investigation · publisher response.</small>
      </aside>
    </section>
  );
}
