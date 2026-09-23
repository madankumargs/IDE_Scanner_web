export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingCategory =
  | "command_execution" | "network_access" | "filesystem_access" | "environment_access"
  | "dynamic_execution" | "obfuscation" | "prompt_injection" | "credential_pattern"
  | "credential_exfiltration" | "suspicious_url" | "instruction_manipulation"
  | "manifest_risk" | "tool_description_mismatch";

export interface Finding {
  severity: Severity;
  category: FindingCategory;
  title: string;
  description: string;
  file: string;
  line?: number;
  snippet?: string;
  remediation: string;
}

export interface ArtifactScanResult {
  findings: Finding[];
  scannedFiles: number;
  linesAnalyzed: number;
  checksRun: number;
  partial: boolean;
  scanWarnings: string[];
}

export interface SourceFile { path: string; name: string; content: string; }

export type ArtifactKind = "skill" | "plugin" | "mcp" | "npm" | "unknown";
