import type { ArtifactKind, Finding, SourceFile } from "../types";
import { checkCommandExecution } from "./commandExecution"; import { checkNetworkAccess } from "./networkAccess"; import { checkFilesystemAccess } from "./filesystemAccess"; import { checkEnvironmentAccess } from "./environmentAccess"; import { checkDynamicExecution } from "./dynamicExecution"; import { checkObfuscation } from "./obfuscation"; import { checkPromptInjection } from "./promptInjection"; import { checkCredentialPatterns } from "./credentialPatterns"; import { checkCredentialExfiltration } from "./credentialExfiltration"; import { checkSuspiciousUrls } from "./suspiciousUrls"; import { checkInstructionManipulation } from "./instructionManipulation"; import { checkManifestRisk } from "./manifestRisk"; import { checkToolDescriptionMismatch } from "./toolDescriptionMismatch";
export interface CheckOptions { kind?: ArtifactKind; }
export function runAllChecks(files: SourceFile[], options: CheckOptions = {}): { findings: Finding[]; checksRun: number } {
  const result: Finding[] = []; let checksRun = 0;
  for (const file of files) {
    const checks = [checkCommandExecution(file), checkNetworkAccess(file), checkFilesystemAccess(file), checkEnvironmentAccess(file), checkDynamicExecution(file), checkObfuscation(file), checkPromptInjection(file), checkCredentialPatterns(file), checkSuspiciousUrls(file), checkManifestRisk(file), checkToolDescriptionMismatch(file)];
    if (options.kind === "skill" || options.kind === "plugin" || options.kind === "unknown") checks.push(checkInstructionManipulation(file));
    const credentialIndexes = [...checkCredentialPatterns(file), ...checkEnvironmentAccess(file)].map(f => Math.max(0, file.content.indexOf(f.snippet || "")));
    checks.push(checkCredentialExfiltration(file, credentialIndexes)); checksRun += checks.length; result.push(...checks.flat());
  }
  const seen = new Set<string>(); return { checksRun, findings: result.filter(f => { const key = `${f.file}:${f.line ?? 0}:${f.category}`; if (seen.has(key)) return false; seen.add(key); return true; }) };
}
export * from "./commandExecution"; export * from "./networkAccess"; export * from "./filesystemAccess"; export * from "./environmentAccess"; export * from "./dynamicExecution"; export * from "./obfuscation"; export * from "./promptInjection"; export * from "./credentialPatterns"; export * from "./credentialExfiltration"; export * from "./suspiciousUrls"; export * from "./instructionManipulation"; export * from "./manifestRisk"; export * from "./toolDescriptionMismatch";
