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
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "GuardRails | IDE extension intelligence",
    description: "GuardRails helps developers and security teams inspect exact IDE extension releases, monitor meaningful changes, and keep evidence attached to software decisions.",
    about: ["IDE extension security", "software supply-chain risk", "release monitoring", "developer tooling"],
  };

  return <main className={`${styles.page} productLanding`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
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
        <div><span className={styles.sectionKicker}>The complete GuardRails product</span><h2 id="positioning-heading">One evidence system for <em>every extension decision.</em></h2></div>
        <p>GuardRails connects the public registry, Deep Scans, local inspection, monitoring, team review, portable evidence, and automation around the same exact-release record.</p>
      </header>
      <div className={styles.positioningGrid}>
        <article><span>01 / Public intelligence</span><h3>Registry and Deep Scans</h3><p>Inspect published packages, exact versions, observed capabilities, coverage, and the evidence behind a release before installation.</p><Link href="/registry">Browse the registry <ArrowUpRight /></Link></article>
        <article><span>02 / Local inspection</span><h3>GuardRails CLI</h3><p>Inspect extensions already installed on a machine and keep portable report bundles under your own control.</p><Link href="/cli">Explore local inspection <ArrowUpRight /></Link></article>
        <article><span>03 / Change awareness</span><h3>Release monitoring</h3><p>Watch the extensions your team depends on and return meaningful access or behavior changes to review.</p><Link href="/monitor">See release monitoring <ArrowUpRight /></Link></article>
        <article><span>04 / Shared decisions</span><h3>Team workspace</h3><p>Assign reviews, preserve the rationale, and keep the approved baseline visible when the next version arrives.</p><Link href="/workspace">Open the workspace <ArrowUpRight /></Link></article>
        <article><span>05 / Verifiable records</span><h3>Reports, exports, and badges</h3><p>Share exact-release evidence in reports, audit exports, public inventory, and version-pinned trust badges.</p><Link href="/badge">Build a trust badge <ArrowUpRight /></Link></article>
        <article><span>06 / Assisted research</span><h3>AI and API access</h3><p>Connect an MCP-compatible assistant or a pipeline to check evidence and alternatives before a software recommendation is made.</p><Link href="/docs/mcp">Connect an assistant <ArrowUpRight /></Link></article>
      </div>
      <div className={styles.positioningRead}><strong>Product boundary</strong><p>Every capability reads from the same evidence model. GuardRails is not a safety guarantee; it makes the artifact, coverage, findings, and decision history visible enough to act on.</p><Link href="/about">Read how GuardRails works <ArrowRight /></Link></div>
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
