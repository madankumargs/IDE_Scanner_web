export function publicationRuntimeMismatch({ profile, metadata, analysisCoverage }) {
  if (String(profile || "") !== "deep") return "canonical report is not from the deep runtime-enabled profile";
  const intelligence = objectValue(metadata?.intelligence_snapshot);
  const dynamicRuntime = objectValue(intelligence.dynamic_sandbox);
  if (dynamicRuntime.status !== "executed"
    || dynamicRuntime.execution !== "controlled-bubblewrap"
    || dynamicRuntime.runtime_policy !== "capability-gated-v1"
    || dynamicRuntime.executed !== true
    || dynamicRuntime.external_syscall_trace_available !== true) {
    return "canonical report lacks controlled runtime execution and external syscall tracing capability";
  }
  const coverage = objectValue(analysisCoverage);
  const dynamicProvider = objectValue(objectValue(coverage.providers).dynamic_sandbox);
  if (dynamicProvider.required === true) {
    if (dynamicProvider.status !== "completed"
      || dynamicProvider.executed !== true
      || dynamicProvider.execution !== "controlled-bubblewrap"
      || dynamicProvider.policy !== "capability-gated-v1"
      || dynamicProvider.external_syscall_trace !== true
      || dynamicRuntime.external_syscall_trace !== true) {
      return "required dynamic runtime coverage did not complete with validated external syscall evidence";
    }
    return null;
  }
  if (dynamicProvider.required === false) {
    if (dynamicProvider.status !== "not-applicable"
      || dynamicProvider.executed !== false
      || dynamicProvider.policy !== "capability-gated-v1"
      || dynamicProvider.external_syscall_trace !== false
      || dynamicRuntime.external_syscall_trace !== false) {
      return "non-executable runtime coverage is not explicitly capability-gated as not applicable";
    }
    return null;
  }
  return "canonical report lacks explicit dynamic runtime provider coverage";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
