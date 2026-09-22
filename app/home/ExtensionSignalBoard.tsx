import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  FileCode2,
  FolderOpen,
  Globe2,
  ScanSearch,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import BrandMark from "@/app/BrandMark";
import ExtensionIcon from "@/app/ExtensionIcon";
import type { PublicInventoryItem } from "@/lib/productData";
import styles from "./extensionSignalBoard.module.css";

type Props = {
  items: PublicInventoryItem[];
  total: number;
};

const surfaces = [
  { key: "process_execution", label: "Commands", icon: Terminal },
  { key: "network", label: "Network", icon: Globe2 },
  { key: "filesystem", label: "Files", icon: FolderOpen },
  { key: "ide_contributions", label: "Editor", icon: FileCode2 },
] as const;

export default function ExtensionSignalBoard({ items, total }: Props) {
  const featured = items.find((item) => item.extension_id.toLowerCase() === "openai.chatgpt") || items[0];
  const rows = items.filter((item) => item.scan_id !== featured?.scan_id).slice(0, 3);
  const observed = new Set(
    Array.isArray(featured?.capability_assessment?.observed)
      ? featured.capability_assessment.observed.map(String)
      : [],
  );

  if (!featured) {
    return (
      <div className={styles.board} aria-label="GuardRails public registry status">
        <BoardHeader empty />
        <div className={styles.empty}>
          <span className={styles.emptyMark}><ScanSearch /></span>
          <strong>Check an extension to see its evidence here.</strong>
          <span>Public release reports appear in this panel as scans complete. Start with any Marketplace or Open VSX extension.</span>
          <Link href="/registry">Browse the registry <ArrowUpRight /></Link>
        </div>
        <BoardFooter total={total} />
      </div>
    );
  }

  return (
    <div className={styles.board} aria-label="GuardRails extension evidence preview">
      <BoardHeader />
      <div className={styles.featured}>
        <div className={styles.featuredIdentity}>
          <ExtensionIcon
            iconUrl={featured.icon_url}
            publisher={featured.publisher}
            name={featured.display_name}
            size="lg"
          />
          <div>
            <span className={styles.label}>Release</span>
            <h2>{featured.display_name}</h2>
            <p>{featured.publisher} · @{featured.version}</p>
          </div>
        </div>
        <div className={`${styles.decision} ${styles[featured.decision]}`}>
          {featured.decision === "allow" ? <CheckCircle2 /> : <ShieldAlert />}
          <span>{decisionLabel(featured.decision)}</span>
        </div>
      </div>
      <div className={styles.featuredFacts}>
        <span><b>{featured.coverage_percent}%</b> evidence coverage</span>
        <span><b>{featured.severity}</b> severity</span>
        <span><b>{featured.provenance_tier}</b> provenance</span>
      </div>
      <div className={styles.surfaceGrid}>
        {surfaces.map(({ key, label, icon: Icon }) => {
          const active = observed.has(key);
          return (
            <div className={`${styles.surface} ${active ? styles.active : ""}`} key={key}>
              <Icon />
              <span>{label}</span>
              <small>{active ? "Observed" : "Not observed"}</small>
            </div>
          );
        })}
      </div>
      {rows.length ? (
        <div className={styles.feed}>
          <div className={styles.feedHeader}><span>More from the public feed</span><span>Recent releases</span></div>
          {rows.map((item) => (
            <Link className={styles.feedRow} href={`/extensions/${encodeURIComponent(item.extension_id)}`} key={item.scan_id}>
              <ExtensionIcon iconUrl={item.icon_url} publisher={item.publisher} name={item.display_name} size="sm" />
              <span><strong>{item.display_name}</strong><small>{item.publisher} · @{item.version}</small></span>
              <b className={`${styles.feedDecision} ${styles[item.decision]}`}>{decisionLabel(item.decision)}</b>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      ) : null}
      <BoardFooter total={total} />
    </div>
  );
}

function BoardHeader({ empty = false }: { empty?: boolean }) {
  return (
    <header className={styles.header}>
      <span className={styles.brand}><BrandMark compact /><b>GuardRails</b></span>
      <span className={styles.live}><i /> {empty ? "Public registry" : "Live public registry"}</span>
    </header>
  );
}

function BoardFooter({ total }: { total: number }) {
  return (
    <footer className={styles.footer}>
      <span><ScanSearch /> {total ? `${total.toLocaleString()} releases in the public view` : "Public releases appear here as scans complete"}</span>
      <Link href="/registry">Open registry <ArrowUpRight /></Link>
    </footer>
  );
}

function decisionLabel(decision: PublicInventoryItem["decision"]) {
  return decision === "allow" ? "Analyzed" : decision === "block" ? "Flagged" : decision === "review" ? "Review" : "Pending";
}
