import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import ExtensionSearch from "@/app/ExtensionSearch";
import styles from "./authorityLanding.module.css";
import ReleaseReviewFilm from "./ReleaseReviewFilm";
import TrustProof from "./TrustProof";
import IdeCompatibility from "./IdeCompatibility";
import ExtensionSignalBoard from "./ExtensionSignalBoard";
import { getPublicInventory } from "@/lib/productData";

export default async function AuthorityLanding() {
  const inventory = await getPublicInventory(8);

  return <main className={`${styles.page} productLanding`}>
    <section className={`${styles.hero} productLandingHero`}>
      <div className={styles.heroTopline}>
        <span className={styles.heroKicker}><i /> Extension intelligence for the software you install</span>
        <span className={styles.heroIssue}>Issue 01 <b>·</b> Before install</span>
      </div>
      <div className={`${styles.heroLayout} productLandingHeroGrid`}>
        <div className={`${styles.heroCopy} productLandingCopy`}>
          <h1>Know what an extension can do <em>before you let it in.</em></h1>
          <p className={styles.heroLead}>GuardRails turns every release into a clear install decision: what changed, what it can reach, and whether the evidence supports a yes.</p>
          <div className={styles.heroSearch}>
            <span className={styles.heroSearchLabel}>Search Marketplace / Open VSX</span>
            <ExtensionSearch submitLabel="Check extension" />
            <p className={styles.trialHint}>Five Deep Scans per 30 days. No account required.</p>
            <div className={styles.searchExamples} aria-label="Example extension searches">
              <span>Try:</span>{["GitHub Copilot", "Cline", "ESLint"].map((name) => <Link key={name} href={`/registry?q=${encodeURIComponent(name)}`}>{name}</Link>)}
            </div>
          </div>
          <div className={styles.actions}><Link className={styles.heroTextLink} href="#how">See how it works <ArrowUpRight /></Link></div>
        </div>
        <aside className={styles.reportExample} aria-label="Illustrative extension report">
          <span className={styles.sectionKicker}>Illustrative report · fictional extension</span>
          <h2>Workspace Assistant</h2>
          <p>Example release <code>2.9.0</code></p>
          <strong className={styles.exampleOutcome}>Needs review</strong>
          <dl>
            <div><dt>Finding</dt><dd>This update adds terminal execution.</dd></div>
            <div><dt>Access</dt><dd>Workspace files, terminal, outbound network.</dd></div>
            <div><dt>Coverage</dt><dd>Static package analysis shown. Runtime behavior unverified.</dd></div>
          </dl>
          <p>This demonstrates the report layout. It is not a real scan or security decision.</p>
          <Link href="#how">Explore the review example <ArrowRight /></Link>
        </aside>
      </div>
      <nav className="productPath" aria-label="GuardRails review path">
        <span className="productPathLabel">A review, not a tour</span>
        <ol>
          <li className="isCurrent"><b>01</b><strong>Discover</strong><small>Find the package you are considering.</small></li>
          <li><b>02</b><strong>Inspect</strong><small>See the exact release and observed access.</small></li>
          <li><b>03</b><strong>Compare</strong><small>Measure what changed from the baseline.</small></li>
          <li><b>04</b><strong>Decide</strong><small>Keep the evidence with the decision.</small></li>
        </ol>
      </nav>
      <div className={`${styles.heroMovie} productLandingProof`}>
        <div className={styles.heroMovieMeta}><span>Product film / release review</span><span>GuardRails · 00:48</span></div>
        <div className={styles.heroMovieFrame}>
          <video autoPlay controls muted loop playsInline preload="metadata" poster="/demos/guardrails-product-overview-poster.jpg" aria-label="GuardRails product demo">
            <source src="/demos/guardrails-product-overview.mp4" type="video/mp4" />
            Your browser does not support video playback.
          </video>
          <div className={styles.heroMovieCaption}><span>From a new capability to a saved decision.</span><Link href="/demos">Open the full demo <ArrowUpRight /></Link></div>
        </div>
      </div>
    </section>

    <section className={styles.liveEvidence} aria-labelledby="live-evidence-heading">
      <div className={styles.liveHeader}>
        <div>
          <span className={styles.sectionKicker}>02 / The public view</span>
          <h2 id="live-evidence-heading">The useful answer is<br /><em>what changed.</em></h2>
        </div>
        <div className={styles.liveHeaderAside}><p>See a release the way a reviewer sees it: exact version, observed surfaces, evidence coverage, and the decision that follows.</p><Link href="/registry">Browse the release index <ArrowRight /></Link></div>
      </div>
      <div className={styles.liveBoard}>
        <div className={styles.liveBoardLabel}><span>Live release index</span><span>{inventory.totals.releases.toLocaleString()} releases</span></div>
        <ExtensionSignalBoard items={inventory.items} total={inventory.totals.releases} />
      </div>
    </section>

    <section className={styles.trialCallout} aria-labelledby="trial-heading">
      <div className={styles.trialLead}>
        <span className={styles.sectionKicker}>03 / Start here</span>
        <h2 id="trial-heading">Five scans.<br /><em>No account required.</em></h2>
        <p>Inspect the package, capabilities, and evidence before you decide whether GuardRails belongs in your workflow.</p>
      </div>
      <div className={styles.trialSteps} aria-label="Free scan details">
        <span><strong>01</strong><b>No card</b><small>Start from a public extension.</small></span>
        <span><strong>05</strong><b>Scans / 30 days</b><small>Start with any public extension.</small></span>
        <Link href="/registry">Start a free scan <ArrowRight /></Link>
      </div>
    </section>

    <section className={styles.demoSection} id="how" aria-labelledby="demo-heading">
      <div className={styles.demoIntro}>
        <span className={styles.sectionKicker}>04 / The review surface</span>
        <h2 id="demo-heading">A release arrives.<br /><em>The decision stays.</em></h2>
        <p>Compare the new capability against the approved baseline, inspect the evidence, and save the context for the next release.</p>
        <Link href="/workspace">Build a review workflow <ArrowUpRight /></Link>
      </div>
      <div className={styles.demoFilm}><ReleaseReviewFilm /></div>
    </section>

    <section className={styles.positioning} aria-labelledby="positioning-heading">
      <header className={styles.positioningHeader}>
        <div><span className={styles.sectionKicker}>What GuardRails is</span><h2 id="positioning-heading">An evidence desk for <em>IDE extensions.</em></h2></div>
        <p>GuardRails is the product behind abscissa.dev: a research and review companion that turns a published extension release into searchable, comparable, version-pinned evidence.</p>
      </header>
      <div className={styles.positioningGrid}>
        <article><span>01 / Review</span><h3>More than a scanner</h3><p>Inspect package behavior, observed capabilities, and coverage before an extension enters your editor or your team.</p></article>
        <article><span>02 / Connection</span><h3>Read-only MCP access</h3><p>Connect Codex, Claude, or another MCP client to check extension risk and find alternatives from the public evidence corpus.</p><Link href="/docs#mcp">Read the MCP docs <ArrowUpRight /></Link></article>
        <article><span>03 / Boundary</span><h3>Useful, not a guarantee</h3><p>GuardRails is not an antivirus or a safety promise. Results stay tied to exact artifacts, available coverage, and the limits shown in each report.</p></article>
      </div>
      <div className={styles.positioningRead}><strong>Overall read</strong><p>GuardRails is closer to a release-review and evidence system for extension supply-chain risk than a generic dashboard.</p><Link href="/about">Read how the product works <ArrowRight /></Link></div>
    </section>

    <section className={styles.researchLink}><p>Research note</p><div><h2>What an extension can reach is a supply-chain question.</h2><Link href="/research/solidity-pro">Read the Solidity Pro case study <ArrowUpRight /></Link></div></section>

    <section className={styles.teamSection} aria-labelledby="team-heading">
      <div className={styles.teamIntro}>
        <span className={styles.sectionKicker}>05 / For teams</span>
        <h2 id="team-heading">Turn one good review into a system.</h2>
        <p>Give reviewers one place to triage changes, carry decisions forward, and publish the evidence developers need before they install.</p>
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
    <section className={styles.close}><span className={styles.sectionKicker}>The next install is a decision</span><h2>Inspect one extension.<br /><em>Keep the evidence.</em></h2><Link href="/registry">Check an extension <ArrowRight /></Link></section>
  </main>;
}
