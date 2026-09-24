import type { Metadata } from "next";
import ArtifactRegistryPage from "@/app/registry/ArtifactRegistryPage";
export const metadata: Metadata = { title: "Skills Registry", description: "Inspect skill instructions before they run." };
export default function SkillsPage() { return <ArtifactRegistryPage kind="Skills" artifactKind="skill" title={<>Read the instructions<br/>before they run.</>} description="Search skills and inspect their instructions, tool scope, and exact source before granting authority." placeholder="GitHub skill repository or name" />; }
