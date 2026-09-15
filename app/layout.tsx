import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { ArrowUpRight } from "lucide-react";
import SiteNav from "./SiteNav";
import HeaderAccount from "./HeaderAccount";
import BrandMark from "./BrandMark";
import FooterNewsletter from "./FooterNewsletter";
import CookieConsent from "./CookieConsent";
import FeedbackWidget from "./FeedbackWidget";
import { socialLinks } from "../lib/socialLinks";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/marck-script/400.css";
import "./globals.css";
import "./guardrails.css";
import "./visual-refresh.css";
import "./design-system.css";
import "./landing.css";
import "./accessibility.css";
import "./product-ui.css";
import "./readability.css";
import "./authority.css";
import "./light-theme.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://abscissa.dev"),
  title: {
    default: "GuardRails - Check IDE extensions before you install them",
    template: "%s · GuardRails",
  },
  description:
    "See what an IDE extension can access before you install it, and hear about it when an update adds terminal, network, or file access.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "GuardRails",
    title: "GuardRails - Check IDE extensions before you install them",
    description:
      "Scan IDE extensions before install, then get flagged when an update quietly gains new access.",
  },
  twitter: { card: "summary_large_image" },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <div className="siteFrame">
          <a className="skipLink" href="#main-content">
            Skip to content
          </a>
          <header className="siteHeader">
            <div className="headerInner">
              <Link className="wordmark" href="/" aria-label="GuardRails home">
                <BrandMark />
                <strong>GuardRails</strong>
              </Link>
              <SiteNav />
              <div className="headerCommands">
                <Link className="headerProductCta" href="/registry">
                  Check an extension
                </Link>
                <HeaderAccount />
              </div>
            </div>
          </header>
          <div id="main-content" className="pageContent">
            {children}
          </div>
          <footer className="siteFooter">
            <div className="footerMain">
              <div className="footerLead">
                <Link className="wordmark footerWordmark" href="/">
                  <BrandMark />
                  <strong>GuardRails</strong>
                </Link>
                <h2>
                  Know what runs
                  <br />
                  in your editor.
                </h2>
                <p>
                  See what extensions can access before installation and
                  whenever a new release changes their behavior.
                </p>
                <Link className="footerCta" href="/registry">
                  Check an extension <ArrowUpRight />
                </Link>
                <FooterNewsletter />
              </div>
              <div className="footerLinks">
                <div>
                  <strong>Product</strong>
                  <Link href="/registry">Extension Registry</Link>
                  <Link href="/detections">Recent Detections</Link>
                  <Link href="/monitor">Release Monitoring</Link>
                  <Link href="/workspace">Team Workspace</Link>
                  <Link href="/ide">GuardRails IDE</Link>
                  <Link href="/pricing">Pricing</Link>
                  <Link href="/status">Product Status</Link>
                </div>
                <div>
                  <strong>Resources</strong>
                  <Link href="/analyze">Choose an analysis path</Link>
                  <Link href="/cli">Local CLI</Link>
                  <Link href="/research">How analysis works</Link>
                  <Link href="/benchmark">Validation and limits</Link>
                  <Link href="/solutions/developers">For developers</Link>
                  <Link href="/solutions/engineering-teams">For teams</Link>
                </div>
                <div>
                  <strong>Company</strong>
                  <Link href="/about">About GuardRails</Link>
                  <Link href="/#sarvam-ai">Sarvam AI program</Link>
                  <Link href="/contact">Contact</Link>
                  <Link href="/changelog">Changelog</Link>
                  <Link href="/faq">FAQ</Link>
                  <Link href="/integrations">Integrations</Link>
                  <Link href="/badge">Publisher Badge</Link>
                  <Link href="/privacy">Privacy policy</Link>
                  <Link href="/terms">Terms of Service</Link>
                  <Link href="/security">Security</Link>
                </div>
              </div>
            </div>
            <div className="footerBottom">
              <span>© GuardRails</span>
              {socialLinks.length > 0 ? (
                <span className="footerSocial">
                  {socialLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      rel="me noopener noreferrer"
                      target="_blank"
                    >
                      {link.label}
                    </a>
                  ))}
                </span>
              ) : null}
              <Link href="/privacy#analytics">Analytics settings</Link>
              <span>
                Extension behavior, before install and after every update.
              </span>
            </div>
          </footer>
        </div>
        <Analytics />
        <CookieConsent />
        <FeedbackWidget />
      </body>
    </html>
  );
}
