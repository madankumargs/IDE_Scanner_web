"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, Boxes, X } from "lucide-react";
import { useEffect } from "react";
import styles from "./registryChooser.module.css";

export default function RegistryChooser({ open }: { open: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") router.push("/registry"); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, router]);

  if (!open) return null;
  return <div className={styles.backdrop} role="presentation">
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="registry-chooser-title">
      <header><div><span className={styles.eyebrow}>GuardRails registry</span><h2 id="registry-chooser-title">Choose what you want to inspect.</h2><p>Use the established extension evidence path, or open the separate public Skills review surface.</p></div><Link className={styles.close} href="/registry" aria-label="Close registry chooser"><X/></Link></header>
      <div className={styles.options}>
        <Link className={styles.option} href="/analyze">
          <span className={styles.icon}><Boxes/></span><span><strong>Extension scanning</strong><small>Search Marketplace and Open VSX, then request the existing exact-release Deep Scan.</small></span><ArrowRight/>
        </Link>
        <Link className={`${styles.option} ${styles.skillOption}`} href="/skills">
          <span className={styles.icon}><BookOpenCheck/></span><span><strong>Skills scanning</strong><small>Review public agent Skills with a distinct SKILL.md, instruction, script, provenance, and supply-chain matrix.</small></span><ArrowRight/>
        </Link>
      </div>
      <footer><span>Same evidence discipline. Different artifact and detection rules.</span><Link href="/registry">Continue to extension registry</Link></footer>
    </section>
  </div>;
}
