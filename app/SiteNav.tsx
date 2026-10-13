"use client";

import Link from "next/link";
import HeaderAccount from "./HeaderAccount";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Activity, ArrowUpRight, BellRing, BookOpen, Bot, Boxes, Building2, ChevronDown, CircleHelp, Code2, FlaskConical, History, Menu, ShieldCheck, TerminalSquare, Users, X } from "lucide-react";

type NavItem = readonly [string, string, string, ComponentType];

// A deliberately small top row; everything secondary lives in one grouped menu.
const topLinks: readonly (readonly [string, string])[] = [
  ["/registry", "Registry"],
  ["/monitor", "Monitor"],
  ["/docs", "Docs"],
  ["/pricing", "Pricing"],
];

const moreGroups: readonly { label: string; items: readonly NavItem[] }[] = [
  { label: "Product", items: [
    ["/workspace", "Team Workspace", "Assign decisions and preserve the evidence", Users],
    ["/cli", "Local CLI", "Inspect extensions installed on your machine", TerminalSquare],
    ["/ide", "GuardRails IDE", "Preview explicit authority for agents and tools", ShieldCheck],
    ["/registry/mcp", "MCP Registry", "Inspect servers before an agent connects", Boxes],
    ["/monitor", "Release Monitoring", "Review only meaningful permission changes", BellRing],
  ] },
  { label: "Solutions", items: [
    ["/solutions/developers", "Developers", "Know what runs inside your editor", Code2],
    ["/solutions/engineering-teams", "Engineering teams", "Keep release review attached to ownership", Users],
    ["/solutions/security-teams", "Security teams", "Turn changes into defensible decisions", Building2],
    ["/solutions/ai-agent-security", "AI-agent security", "Contain tools without ambient authority", Bot],
  ] },
  { label: "Trust", items: [
    ["/research", "How analysis works", "Evidence boundaries and practical guidance", BookOpen],
    ["/benchmark", "Validation", "Published tests, coverage, and limitations", FlaskConical],
    ["/faq", "FAQ", "Direct answers with methodology links", CircleHelp],
    ["/changelog", "Changelog", "What shipped, dated honestly", History],
    ["/status", "Status", "Live service health and incident history", Activity],
  ] },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<"more" | "mobile" | null>(null);
  const root = useRef<HTMLElement>(null);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const menuLink = ([href, label, detail, Icon]: NavItem, inMenu = false) => <Link role={inMenu ? "menuitem" : undefined} href={href} key={`${href}-${label}`} onClick={() => setOpen(null)}><Icon/><span><strong>{label}</strong><small>{detail}</small></span><ArrowUpRight/></Link>;
  const moreActive = moreGroups.some((group) => group.items.some(([href]) => active(href)));
  return <nav className="primaryNav guardrailsNav" aria-label="Primary navigation" ref={root}>
    <button className="mobileNavToggle" aria-expanded={open === "mobile"} aria-label={open === "mobile" ? "Close navigation" : "Open navigation"} onClick={() => setOpen(open === "mobile" ? null : "mobile")}>{open === "mobile" ? <X/> : <Menu/>}</button>
    <div className="desktopNav">
      {topLinks.map(([href, label]) => <Link key={href} className={active(href) ? "active" : ""} href={href}>{label}</Link>)}
      <div className="navMenu">
        <button className={moreActive ? "active" : ""} aria-expanded={open === "more"} aria-controls="more-menu" onClick={() => setOpen(open === "more" ? null : "more")}>More<ChevronDown/></button>
        <div id="more-menu" role="menu" aria-label="More" className={`navPopover groupedNavPopover ${open === "more" ? "isOpen" : ""}`}>
          {moreGroups.map((group) => <div className="mobileNavGroup" key={group.label}><span>{group.label}</span>{group.items.map((item) => menuLink(item, true))}</div>)}
        </div>
      </div>
    </div>
    <div className={`mobileNavPanel ${open === "mobile" ? "isOpen" : ""}`}>
      <div className="mobileNavGroup"><span>Explore</span>
        {menuLink(["/registry", "Extension Registry", "Inspect exact releases before installation", Boxes])}
        {menuLink(["/docs", "Docs and API", "Gate releases in CI and from AI agents", BookOpen])}
        {menuLink(["/pricing", "Pricing", "Plans and product availability", History])}
      </div>
      <div className="mobileNavGroup"><span>Account</span><HeaderAccount /></div>
      {moreGroups.map((group) => <div className="mobileNavGroup" key={group.label}><span>{group.label}</span>{group.items.map((item) => menuLink(item))}</div>)}
    </div>
  </nav>;
}
