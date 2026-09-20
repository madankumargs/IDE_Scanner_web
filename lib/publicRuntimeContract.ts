type ValueMap = Record<string, unknown>;

/**
 * Public/benchmark evidence is allowed to publish only after the scanner has
 * either executed the capability-gated runtime or explicitly determined that
 * the artifact does not require execution. This is intentionally shared by
 * both callback backends so D1 and Supabase cannot drift.
 */
export function publicRuntimeError(metadata: ValueMap, analysisCoverage: ValueMap): string | null {
  if (String(metadata.profile || "") !== "deep") return "Public scans require the deep runtime-enabled profile.";
  const intelligence = objectValue(metadata.intelligence_snapshot);
  const dynamicRuntime = objectValue(intelligence.dynamic_sandbox);
  if (dynamicRuntime.status !== "executed"
    || dynamicRuntime.execution !== "controlled-bubblewrap"
    || dynamicRuntime.runtime_policy !== "capability-gated-v1"
    || dynamicRuntime.executed !== true
    || dynamicRuntime.external_syscall_trace_available !== true) {
    return "Public scans require controlled runtime execution and external syscall tracing capability.";
  }
  const dynamicProvider = objectValue(objectValue(analysisCoverage.providers).dynamic_sandbox);
  if (dynamicProvider.required === true) {
    if (dynamicProvider.status !== "completed"
      || dynamicProvider.executed !== true
      || dynamicProvider.execution !== "controlled-bubblewrap"
      || dynamicProvider.policy !== "capability-gated-v1"
      || dynamicProvider.external_syscall_trace !== true
      || dynamicRuntime.external_syscall_trace !== true) {
      return "Public scans require completed controlled runtime coverage with external syscall evidence for executable capabilities.";
    }
    return null;
  }
  if (dynamicProvider.required === false) {
    if (dynamicProvider.status !== "not-applicable"
      || dynamicProvider.executed !== false
      || dynamicProvider.policy !== "capability-gated-v1"
      || dynamicProvider.external_syscall_trace !== false
      || dynamicRuntime.external_syscall_trace !== false) {
      return "Public scans require an explicit capability-gated runtime decision.";
    }
    return null;
  }
  return "Public scans require explicit dynamic runtime provider coverage.";
}

function objectValue(value: unknown): ValueMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ValueMap : {};
}
