import type { Metadata } from "next";
import SkillsFullReportClient from "@/app/skills/SkillsFullReportClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Skills report",
  description: "Detailed evidence for an exact public Skill snapshot.",
  alternates: { canonical: "/skills/report" },
};

export default function SkillsReportPage() {
  return <SkillsFullReportClient/>;
}
