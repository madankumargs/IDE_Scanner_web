import type { Metadata } from "next";
import ArtifactRegistryPage from "@/app/registry/ArtifactRegistryPage";
export const metadata: Metadata = { title: "Plugin Registry", description: "Review plugin capabilities and source before use." };
export default function PluginsPage() { return <ArtifactRegistryPage kind="Plugins" title={<>Know what your<br/>plugins can do.</>} description="Search plugins and inspect their declared capabilities, source, and exact analyzed version." placeholder="GitHub plugin repository or name" />; }
