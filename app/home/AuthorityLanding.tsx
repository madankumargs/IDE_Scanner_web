import Link from "next/link";
import { ArrowRight, ChevronRight, ScanSearch } from "lucide-react";
import ExtensionSearch from "@/app/ExtensionSearch";
import styles from "./authorityLanding.module.css";
import ReleaseReviewFilm from "./ReleaseReviewFilm";
import DecisionMemoryFilm from "./DecisionMemoryFilm";
import TrustProof from "./TrustProof";
import LandingFaq from "./LandingFaq";
import IdeCompatibility from "./IdeCompatibility";
import SarvamProgramNote from "../SarvamProgramNote";
import ExtensionSignalBoard from "./ExtensionSignalBoard";
import { getPublicInventory } from "@/lib/productData";

export default async function AuthorityLanding() {
  const inventory = await getPublicInventory(8);
  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1>See an extension’s access<br /><em>before it reaches your editor.</em></h1>
        <p className={styles.heroLead}>GuardRails compares the package, permissions, and release history before you install. When a later version changes access, it shows exactly what changed.</p>
        <div className={styles.heroSearch}>
          <span className={styles.heroSearchLabel}><ScanSearch /> Check any extension — Marketplace or Open VSX</span>
          <ExtensionSearch submitLabel="Check extension" />
        </div>
        <div className={styles.actions}><Link href="/registry">Browse the registry <ArrowRight /></Link><Link href="#how">See the flow <ChevronRight /></Link></div>
      </div>
      <div className={styles.heroVisual}><ReleaseReviewFilm /></div>
    </section>
    <section className={styles.liveEvidence} aria-labelledby="live-evidence-heading">
      <div className={styles.liveEvidenceCopy}>
        <h2 id="live-evidence-heading">Know what changed before you install.</h2>
        <p>See the version, what it can reach, and the decision made about it.</p>
        <Link href="/registry">Browse release reports <ArrowRight /></Link>
      </div>
      <ExtensionSignalBoard items={inventory.items} total={inventory.totals.releases} />
    </section>
    <section className={styles.trialCallout} aria-labelledby="trial-heading">
      <div>
        <h2 id="trial-heading">Try five scans free.</h2>
        <p>Inspect the package, capabilities, and evidence before you create an account. Sign in only when you want monitoring, team decisions, and scan history.</p>
      </div>
      <div className={styles.trialSteps} aria-label="Free scan details">
        <span><strong>01</strong><b>No card</b><small>Start from a public extension.</small></span>
        <span><strong>05</strong><b>Scans / 30 days</b><small>Start with any public extension.</small></span>
        <Link href="/registry">Try a free scan <ArrowRight /></Link>
      </div>
    </section>
    <section className={styles.demoSection} id="how" aria-labelledby="demo-heading">
      <div className={styles.demoCopy}>
        <h2 id="demo-heading">Watch a release<br /><em>become a decision.</em></h2>
        <p>Watch a release move from monitoring to review. The change is isolated, the evidence stays attached, and the next step is clear.</p>
        <Link href="/demos">See all product demos <ArrowRight /></Link>
      </div>
      <div className={styles.demoVideo}>
        <video autoPlay controls muted loop playsInline preload="metadata" poster="/demos/guardrails-product-overview-poster.jpg">
          <source src="/demos/guardrails-product-overview.mp4" type="video/mp4" />
          Your browser does not support video playback.
        </video>
      </div>
    </section>
    <section className={styles.researchLink}><p>Case study</p><div><h2>Solidity Pro: a case study in extension supply-chain risk.</h2><Link href="/research/solidity-pro">Read the case study <ArrowRight /></Link></div></section>
    <section className={styles.teamSection} aria-labelledby="team-heading">
      <div className={styles.teamSectionCopy}>
        <h2 id="team-heading">Make every extension decision reusable.</h2>
        <p>Give reviewers one place to triage changes, carry decisions forward, and publish the evidence that developers need before they install.</p>
        <Link href="/workspace">Open the team workspace <ArrowRight /></Link>
      </div>
      <div className={styles.teamGrid}>
        <article><span>01</span><h3>Review inbox</h3><p>Route new releases to the people who can decide.</p></article>
        <article><span>02</span><h3>Decision memory</h3><p>Keep the reason and baseline with each version.</p></article>
        <article><span>03</span><h3>Release monitoring</h3><p>Know when a watched extension changes its access surface.</p></article>
        <article><span>04</span><h3>Trust badges</h3><p>Share a current, verifiable result with your developers.</p></article>
      </div>
    </section>
    <IdeCompatibility />
    <TrustProof />
    <SarvamProgramNote />
    <DecisionMemoryFilm />
    <LandingFaq />
    <section className={styles.close}><h2>Inspect one extension.<br /><em>Keep the evidence.</em></h2><Link href="/registry">Check an extension <ArrowRight /></Link></section>
  </main>;
}
