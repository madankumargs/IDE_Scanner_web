"use client";

import { useRef, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import styles from "./tiltedReportCard.module.css";

type Props = {
  decision: string;
  decisionLabel: string;
  scanId: string;
  artifactSha256: string;
  coverageLabel: string;
  coveragePercent: number;
  analysisStatus: string;
};

/**
 * A restrained adaptation of ReactBits' Tilted Card interaction for the
 * immutable report identity. The interaction is decorative; all report facts
 * remain ordinary text and are available to keyboard and assistive users.
 */
export default function TiltedReportCard({
  decision,
  decisionLabel,
  scanId,
  artifactSha256,
  coverageLabel,
  coveragePercent,
  analysisStatus,
}: Props) {
  const cardRef = useRef<HTMLElement>(null);
  const [style, setStyle] = useState({ transform: "perspective(900px) rotateX(0deg) rotateY(0deg)", glare: 0.12 });

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const card = cardRef.current;
    if (!card || event.pointerType === "touch") return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setStyle({
      transform: `perspective(900px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg)`,
      glare: Math.min(0.28, 0.12 + Math.abs(x) * 0.14 + Math.abs(y) * 0.1),
    });
  }

  function reset() {
    setStyle({ transform: "perspective(900px) rotateX(0deg) rotateY(0deg)", glare: 0.12 });
  }

  return (
    <section
      ref={cardRef}
      className={`${styles.card} ${styles[decision] || styles.incomplete}`}
      style={{ transform: style.transform, "--glare": style.glare } as React.CSSProperties}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      aria-label="Exact artifact identity"
    >
      <div className={styles.sheen} aria-hidden="true" />
      <header>
        <span className={styles.eyebrow}><Fingerprint aria-hidden="true" /> Exact artifact identity</span>
        <span className={styles.status}><ShieldCheck aria-hidden="true" /> {analysisStatus}</span>
      </header>
      <div className={styles.body}>
        <div>
          <span>Current decision</span>
          <strong>{decisionLabel}</strong>
        </div>
        <div>
          <span>Scan identity</span>
          <code>{scanId}</code>
        </div>
        <div>
          <span>Artifact SHA-256</span>
          <code>{artifactSha256}</code>
        </div>
      </div>
      <footer>
        <span>{coverageLabel}</span>
        <strong>{coveragePercent}% recorded</strong>
      </footer>
    </section>
  );
}
