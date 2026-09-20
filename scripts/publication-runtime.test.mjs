import { describe, expect, it } from "vitest";
import { publicationRuntimeMismatch } from "./publication-runtime.mjs";

const metadata = {
  profile: "deep",
  intelligence_snapshot: {
    dynamic_sandbox: {
      status: "executed",
      execution: "controlled-bubblewrap",
      executed: true,
      runtime_policy: "capability-gated-v1",
      external_syscall_trace: false,
      external_syscall_trace_available: true,
    },
  },
};
const requiredMetadata = {
  ...metadata,
  intelligence_snapshot: {
    dynamic_sandbox: {
      ...metadata.intelligence_snapshot.dynamic_sandbox,
      external_syscall_trace: true,
    },
  },
};

describe("publication runtime contract", () => {
  it("accepts an explicitly non-executable artifact", () => {
    expect(publicationRuntimeMismatch({
      profile: metadata.profile,
      metadata,
      analysisCoverage: {
        providers: {
          dynamic_sandbox: {
            status: "not-applicable",
            executed: false,
            required: false,
            policy: "capability-gated-v1",
            external_syscall_trace: false,
          },
        },
      },
    })).toBeNull();
  });

  it("accepts a required runtime provider only after controlled completion", () => {
    expect(publicationRuntimeMismatch({
      profile: metadata.profile,
      metadata: requiredMetadata,
      analysisCoverage: {
        providers: {
          dynamic_sandbox: {
            status: "completed",
            execution: "controlled-bubblewrap",
            executed: true,
            required: true,
            policy: "capability-gated-v1",
            external_syscall_trace: true,
          },
        },
      },
    })).toBeNull();
  });

  it("rejects static-only and failed runtime evidence", () => {
    expect(publicationRuntimeMismatch({
      profile: "standard",
      metadata: requiredMetadata,
      analysisCoverage: {},
    })).toContain("deep runtime-enabled");
    expect(publicationRuntimeMismatch({
      profile: metadata.profile,
      metadata: requiredMetadata,
      analysisCoverage: {
        providers: {
          dynamic_sandbox: {
            status: "failed",
            execution: "controlled-bubblewrap",
            executed: true,
            required: true,
            policy: "capability-gated-v1",
            external_syscall_trace: true,
          },
        },
      },
    })).toContain("did not complete");
  });
});
