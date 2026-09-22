import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("company site surface", () => {
  it("publishes terms that cover billing honesty and analysis limits", () => {
    const terms = read("./terms/page.tsx");
    expect(terms).toContain("point-in-time evidence");
    expect(terms).toContain("Disclosed before payment");
    expect(terms).toContain("not affiliated with or endorsed");
    expect(terms).toContain("security@abscissa.dev");
    expect(terms).toMatch(/export const metadata/);
  });

  it("keeps the formal privacy policy anchored to consent and rights", () => {
    const privacy = read("./privacy/page.tsx");
    expect(privacy).toContain('id="analytics"');
    expect(privacy).toContain("ConsentResetButton");
    expect(privacy).toContain("supervisory authority");
    expect(privacy).toContain("security@abscissa.dev");
  });

  it("answers FAQ questions with methodology links and structured data", () => {
    const faq = read("./faq/page.tsx");
    for (const question of [
      "What does GuardRails actually check?",
      "Do you install or execute extensions to scan them?",
      "How much does it cost?",
      "How do I dispute a finding or flag a malicious extension?",
    ])
      expect(faq).toContain(question);
    expect(faq).toContain('"@type": "FAQPage"');
    expect(faq.match(/\bhref: "\//g)?.length).toBeGreaterThanOrEqual(9);
  });

  it("routes contact through real channels only", () => {
    const contact = read("./contact/page.tsx");
    expect(contact).toContain("mailto:security@abscissa.dev");
    expect(contact).toContain("/design-partners");
  });

  it("describes the Sarvam Startup Program relationship accurately", () => {
    const about = read("./about/page.tsx");
    expect(about).toContain("Supported through Sarvam AI&apos;s Startup Program");
    expect(about).toContain("make scan results easier to read");
    expect(about).toContain("three common questions");
    expect(about).toContain("The scan remains the source of truth");
  });

  it("describes integrations that exist in the product", () => {
    const integrations = read("./integrations/page.tsx");
    for (const feature of ["Slack", "Jira", "Weekly digest", "audit export", "GuardRails CLI"])
      expect(integrations).toContain(feature);
  });

  it("keeps changelog entries dated, tagged, and newest first", () => {
    const entries = read("./changelog/entries.ts");
    const dates = [...entries.matchAll(/date: "(\d{4}-\d{2}-\d{2})"/g)].map(
      (match) => match[1],
    );
    expect(dates.length).toBeGreaterThanOrEqual(3);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const tag of ["Product", "Site", "Methodology"])
      expect(entries).toContain(`"${tag}"`);
  });

  it("loads Google Analytics only behind consent", () => {
    const layout = read("./layout.tsx");
    expect(layout).not.toContain("googletagmanager.com");
    const consent = read("./CookieConsent.tsx");
    expect(consent).toContain("guardrails-consent");
    expect(consent).toContain("loadGoogleAnalytics");
  });

  it("keeps the feedback launcher above a wrapped consent bar", () => {
    const chrome = read("./companyChrome.module.css");
    expect(chrome).toContain("@media (max-width: 760px)");
    expect(chrome).toContain("@media (min-width: 761px) and (max-width: 980px)");
    expect(chrome).toContain("bottom: 110px;");
  });

  it("exposes newsletter capture through a rate-limited endpoint", () => {
    const route = read("./api/newsletter/route.ts");
    expect(route).toContain("subscribe_newsletter");
    expect(route).toContain("SCAN_RATE_LIMIT_SECRET");
    const migrationNames = readFileSync(
      new URL("../supabase/migrations/20260823120000_add_newsletter_subscribers.sql", import.meta.url),
      "utf8",
    );
    expect(migrationNames).toContain("newsletter_subscribers");
    expect(migrationNames).toContain("grant execute");
  });

  it("lists new company pages in the sitemap and nav resources", () => {
    const sitemap = read("./sitemap.ts");
    for (const path of ["/terms", "/contact", "/faq", "/changelog", "/integrations"])
      expect(sitemap).toContain(`"${path}"`);
    const nav = read("./SiteNav.tsx");
    expect(nav).toContain('"/faq"');
    expect(nav).toContain('"/changelog"');
  });
});
