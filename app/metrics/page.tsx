import type { Metadata } from "next";
import { getActiveRuleCatalog } from "@/lib/activeRuleCatalog";
import MetricsCatalog from "./MetricsCatalog";

export const metadata: Metadata = {
  alternates: { canonical: "/metrics" },
};

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  return <MetricsCatalog catalog={await getActiveRuleCatalog()} />;
}
