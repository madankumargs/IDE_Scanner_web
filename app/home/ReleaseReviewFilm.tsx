"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, CircleAlert, GitCompareArrows } from "lucide-react";
import styles from "./releaseReviewFilm.module.css";
import mobileStyles from "./releaseReviewFilmMobile.module.css";

type Stage = "arrived" | "explained" | "saved";

export default function ReleaseReviewFilm() {
  const [stage, setStage] = useState<Stage>("arrived");

  const reviewChange = () => {
    setStage("explained");
  };

  const saveDecision = () => {
    setStage("saved");
  };

  return <div className={`${styles.film} ${styles[stage]}`} aria-label="GuardRails release review in action">
    <header className={styles.chrome}><div><i /><i /><i /></div><b>GuardRails</b><span>Acme workspace <ChevronRight /> Review queue</span><small>Live preview</small></header>
    <div className={styles.body} style={{ position: "relative" }}>
      <aside className={styles.side}><b>WORKSPACE</b><span className={styles.active}>Review queue <i>1</i></span><span>Inventory</span><span>Decisions</span><span>Monitoring</span><footer><i /> Connected</footer></aside>
      <main className={styles.workspace}>
        <div className={styles.topline}><div><p>RELEASE UPDATE</p><h3>Workspace assistant <small>2.8.0 → 2.9.0</small></h3></div><span className={styles.pending}><i /> Needs review</span></div>
        <div className={styles.tabs}><span className={styles.selected}>What changed <i>1</i></span><span>Previous decision</span><span>Evidence</span></div>
        <article className={styles.change}><div className={styles.changeIcon}><CircleAlert /></div><div><p>NEW CAPABILITY</p><h4>Terminal access</h4><span>Can run commands in the current workspace</span></div><b>Added</b></article>
        <article className={styles.note}><GitCompareArrows /><div><b>New compared with your approved version</b><p>Open the context before you decide.</p></div><ChevronRight /></article>
        <footer className={styles.actions}><span aria-live="polite"><i /> Evidence is attached to this release</span><button type="button" onClick={reviewChange} disabled={stage === "saved"}>{stage === "saved" ? <><Check /> Decision saved</> : "Review change"}</button></footer>
      </main>
      <AnimatePresence initial={false}>
        {stage !== "arrived" ? <motion.aside
          key="release-explanation"
          className={`${styles.drawer} ${mobileStyles.mobileDrawer}`}
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 26 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          style={{ position: "absolute", zIndex: 3, top: 0, right: 0, bottom: 0, width: 255, borderLeftWidth: 1, boxShadow: "-16px 0 35px rgba(168,88,67,.08)" }}
        ><header><div><p>REVIEW GUIDE</p><h4>What changed in this release</h4></div><span>1 / 1</span></header><div className={styles.impact}><b>Affected surface</b><p>This tool can run commands with workspace permissions.</p></div><div className={styles.evidence}><span>RELEASE DELTA</span><p>Added after the approved baseline.</p></div><footer><span aria-live="polite">{stage === "saved" ? "Decision saved" : "Evidence attached"}</span><button type="button" onClick={saveDecision} disabled={stage === "saved"}>{stage === "saved" ? <>Saved <Check /></> : <>Save decision <Check /></>}</button></footer></motion.aside> : null}
      </AnimatePresence>
    </div>
    <footer className={styles.caption}><span>Watch a release become a decision.</span><div><i className={stage === "arrived" ? styles.on : ""} /><i className={stage === "explained" ? styles.on : ""} /><i className={stage === "saved" ? styles.on : ""} /></div></footer>
  </div>;
}
