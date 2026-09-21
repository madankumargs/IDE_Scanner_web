import type { Metadata } from "next";
import GuardRailsWorkbench from "./GuardRailsWorkbench";

export const metadata: Metadata = {
  title: "GuardRails IDE permission control plane",
  description: "Inspect explicit, expiring authority for extensions, agents, and tools without mistaking a browser prototype for an OS sandbox.",
  alternates: { canonical: "/ide" },
};

export default function GuardRailsIdePage() {
  return <GuardRailsWorkbench />;
}
