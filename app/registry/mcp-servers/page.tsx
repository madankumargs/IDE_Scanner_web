import type { Metadata } from "next";
import ArtifactRegistryPage from "@/app/registry/ArtifactRegistryPage";
export const metadata: Metadata = { title: "MCP Server Registry", description: "Review MCP tools and declared access before connection." };
export default function McpServersPage() { return <ArtifactRegistryPage kind="MCP Servers" artifactKind="mcp" title={<>Make every tool<br/>surface explicit.</>} description="Search MCP servers and inspect tool descriptions, network access, filesystem scope, and exact versions." placeholder="GitHub repository or npm package" />; }
