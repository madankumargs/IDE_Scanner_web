import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, Download, PackageSearch, Star } from "lucide-react";
import ExtensionIcon from "@/app/ExtensionIcon";
import { listPublisherExtensions } from "@/lib/marketplace";
import type { MarketplaceSearchResult } from "@/lib/types";
import styles from "./publisher.module.css";

export const dynamic = "force-dynamic";

export default async function PublisherPage({ params }: { params: Promise<{ publisher: string }> }) {
  const { publisher: encodedPublisher } = await params;
  const publisher = decodeURIComponent(encodedPublisher);
  let extensions: MarketplaceSearchResult[] = [];
  let unavailable = false;
  try {
    extensions = await listPublisherExtensions(publisher);
  } catch {
    unavailable = true;
  }
  const identity = extensions[0];
  const installs = extensions.reduce((sum, item) => sum + item.install_count, 0);
  return <main className={styles.page}>
    <Link className={styles.back} href={`/registry?q=${encodeURIComponent(publisher)}`}><ArrowLeft/> Back to search</Link>
    <header className={styles.hero}>
      <div className={styles.monogram}>{publisher.slice(0, 2).toUpperCase()}</div>
      <div><span>Publisher profile</span><h1>{identity?.publisher_display_name || publisher}{identity?.publisher_verified ? <BadgeCheck aria-label="Verified Marketplace publisher"/> : null}</h1><p>@{publisher} · VS Marketplace</p></div>
      <aside><span><PackageSearch/><b>{extensions.length}</b><small>extensions returned</small></span><span><Download/><b>{compact(installs)}</b><small>combined installs</small></span></aside>
    </header>
    <section className={styles.boundary}><BadgeCheck/><p><strong>Publisher verification confirms marketplace identity—not extension safety.</strong> Rankings below use Marketplace installs only. Open an exact release for GuardRails evidence.</p></section>
    <section className={styles.catalog}>
      <header><div><span>Published extensions</span><h2>Inspect every release from this publisher.</h2></div><p>Popularity helps discovery. It never replaces exact-package analysis.</p></header>
      {unavailable ? <div className={styles.state}><h3>Publisher catalog is temporarily unavailable.</h3><p>Return to registry search or try again later. This does not mean the publisher has no extensions.</p></div> : extensions.length ? <div className={styles.grid}>{extensions.map((item, index) => <Link href={`/extensions/${encodeURIComponent(item.extension_id)}`} className={styles.card} key={item.extension_id}><span className={styles.rank}>#{index + 1} by installs</span><ExtensionIcon iconUrl={item.icon_url} publisher={item.publisher} name={item.display_name}/><div><h3>{item.display_name}</h3><code>{item.extension_id}</code><p>{item.short_description || "No Marketplace description supplied."}</p></div><footer><span><Download/> {compact(item.install_count)}</span><span><Star/> {item.rating_count ? `${item.rating_average.toFixed(1)} · ${compact(item.rating_count)} ratings` : "Not rated"}</span><strong>Inspect <ArrowRight/></strong></footer></Link>)}</div> : <div className={styles.state}><h3>No exact publisher results were returned.</h3><p>Check the publisher spelling or search for a known extension identity.</p></div>}
    </section>
  </main>;
}

function compact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
