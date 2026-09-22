import Image from "next/image";
import { FileCheck2 } from "lucide-react";
import BrandMark from "./BrandMark";
import styles from "./sarvamProgramNote.module.css";

export default function SarvamProgramNote() {
  return (
    <section className={styles.note} id="sarvam-ai" aria-labelledby="sarvam-heading">
      <div className={styles.signal} aria-hidden="true">
        <FileCheck2 />
      </div>
      <div className={styles.content}>
        <p className={styles.eyebrow}>AI-assisted reviewer guide</p>
        <div className={styles.marks} aria-label="GuardRails and Sarvam AI logos">
          <span className={styles.guardrailsLockup} aria-label="GuardRails">
            <BrandMark />
            <span className={styles.guardrailsWordmark}>GuardRails</span>
          </span>
          <span className={styles.plus} aria-hidden="true">×</span>
          <Image className={styles.sarvamLogomark} src="/brands/sarvam/logo-black.svg" alt="Sarvam AI" width={52} height={52} loading="eager" unoptimized />
        </div>
        <h2 id="sarvam-heading">A clear answer to “what should I do next?”</h2>
        <p>
          For a new install, a flagged release, or a publisher question, GuardRails turns the scan into a short explanation of what to check next.
        </p>
        <p className={styles.disclosure}>
          The scan is the source of truth. If it does not answer a question, the guide says so instead of guessing.
        </p>
      </div>
      <aside className={styles.meta} aria-label="Sarvam AI program status">
        <span>Program relationship</span>
          <strong>Plain-language scan summaries</strong>
        <small>Install decision · flagged-release investigation · publisher response.</small>
      </aside>
    </section>
  );
}
