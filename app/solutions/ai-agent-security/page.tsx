import type { Metadata } from "next";
import SolutionPage from "../SolutionPage";
import { solutions } from "../data";

export const metadata: Metadata = {
  title: "For AI-agent security",
  description:
    "Inspect explicit permission for files, commands, network destinations, secrets, tools, and delegation before the native agent runtime exists.",
  alternates: { canonical: "/solutions/ai-agent-security" },
};

export default function Page() {
  return <SolutionPage solution={solutions.agents} />;
}
