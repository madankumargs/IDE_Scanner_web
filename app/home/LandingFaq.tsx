import styles from "./authorityLanding.module.css";

const questions = [
  {
    q: "Does this upload my code or my installed extensions?",
    a: "No. The website analyzes published marketplace packages in isolated runners. Installed extensions are inspected locally by the GuardRails CLI, and imported report files never leave your browser.",
  },
  {
    q: "What if the analysis is wrong?",
    a: "Every report keeps its scanner build, ruleset, coverage, and limitations attached, so you can see exactly how far a result goes. Incomplete analysis is shown as incomplete — it is never converted into an approval.",
  },
  {
    q: "How much work is this for my team?",
    a: "Public reports need no account. Monitoring watches your extensions automatically and only notifies you on meaningful capability changes, so review effort goes to releases that actually changed behavior.",
  },
  {
    q: "What does it cost?",
    a: "Public reports are free forever, and anyone can try five Deep Scans every 30 days without creating an account. Monitoring is $19/month and Teams is $99/month when billing switches on — early customers keep those launch terms, annual billing takes two months off, and every paid plan carries a 30-day money-back guarantee.",
  },
] as const;

export default function LandingFaq() {
  return (
    <section className={styles.faq} aria-labelledby="faq-heading">
      <div>
        <p className={styles.eyebrow}><i /> Straight answers</p>
        <h2 id="faq-heading">Before you decide on us.</h2>
      </div>
      <div>
        {questions.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
