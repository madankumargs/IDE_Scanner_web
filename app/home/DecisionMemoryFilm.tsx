"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronRight, Clock3, GitCompareArrows } from "lucide-react";
import styles from "./decisionMemoryFilm.module.css";
import interactionStyles from "./decisionMemoryFilmInteraction.module.css";

export default function DecisionMemoryFilm() {
  const [nextRelease, setNextRelease] = useState(false);
  const reducedMotion = useReducedMotion();
  const contentTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: "easeOut" as const };
  const toggleRelease = () => setNextRelease((value) => !value);

  return <section className={styles.scene}>
    <div className={styles.copy}><p><i /> Built-up context</p><h2>Your last review<br />should <em>carry forward.</em></h2><span>When the next version appears, its review begins with the last decision—not a blank page.</span></div>
    <div className={`${styles.window} ${nextRelease ? styles.next : ""}`} aria-label="GuardRails decision history interaction">
      <header><div><i /><i /><i /></div><b>GuardRails</b><span>Release history</span><small>Workspace assistant</small></header>
      <div className={styles.app}>
        <aside><p>RELEASES</p><button type="button" className={styles.approved} onClick={() => setNextRelease(false)} aria-pressed={!nextRelease}><Check /><span>2.9.0<small>Approved</small></span></button><button type="button" className={styles.incoming} onClick={toggleRelease} aria-pressed={nextRelease}><Clock3 /><span>3.0.0<small>New release</small></span><i /></button><footer>3 tracked versions</footer></aside>
        <main>
          <div className={styles.title}><div><p>{nextRelease ? "NEXT REVIEW" : "TRUSTED BASELINE"}</p><h3>{nextRelease ? "Compare 3.0.0" : "Decision for 2.9.0"}</h3></div><span>{nextRelease ? "1 change" : "Saved"}</span></div>
          <div className={styles.rule} />
          <article className={styles.decision}><header><span><Check /></span><div><b>Approved with context</b><small>Decision saved for this release</small></div></header><p>Terminal access is expected for this workspace. The reviewer confirmed the capability is required for the team’s workflow.</p><footer><span>Review saved</span><span>Workspace scope</span></footer></article>
          <article className={styles.compare}><GitCompareArrows /><AnimatePresence mode="wait" initial={false}><motion.div key={nextRelease ? "next-release" : "trusted-baseline"} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={contentTransition}><b>{nextRelease ? "3.0.0 is ready to compare" : "This is the baseline for the next release"}</b><p>{nextRelease ? "GuardRails brings forward the last decision, then shows only what changed." : "A future update begins here, with context intact."}</p></motion.div></AnimatePresence><ChevronRight /></article>
        </main>
      </div>
      <footer className={styles.caption}><span>Review a release once. Every future release starts from that answer.</span><div className={interactionStyles.captionControls}><button type="button" onClick={toggleRelease} aria-pressed={nextRelease}>{nextRelease ? "Show 2.9.0" : "Compare 3.0.0"} <ChevronRight /></button><div><i className={!nextRelease ? styles.on : ""} /><i className={nextRelease ? styles.on : ""} /></div></div></footer>
    </div>
  </section>;
}
