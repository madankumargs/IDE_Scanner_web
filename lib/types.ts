export type Verdict = "clean" | "review" | "suspicious" | "malicious";
export type VerdictState = "safe" | "safe_with_notes" | "needs_review" | "suspicious" | "confirmed_malicious";
export type Decision = "allow" | "review" | "block" | "incomplete";
export type PublicOutcome = "clear" | "expected_capability" | "explained_preventive_chain" | "investigate" | "preventive_block" | "confirmed_threat" | "incomplete";

export type InventoryExtension = {
  type: string;
  path: string;
  extension_id: string;
  name: string;
  display_name: string;
  publisher: string;
  version: string;
  description: string;
  icon_path?: string;
  modified_at: number | null;
};

export type InventoryResponse = {
  total_extensions: number;
  extensions: InventoryExtension[];
};

export type LocalScannerUnavailable = {
  error: string;
  code: "LOCAL_SCANNER_UNAVAILABLE";
  detail?: string;
};

export type FindingSummary = {
  finding_id: string;
  rule_id: string;
  category: string;
  severity: string;
  effective_severity?: string;
  evidence_type?: string;
  confidence: number;
  evidence_summary: string;
  file_refs: string[];
  recommendation: string;
};

export type ExtensionSummary = {
  instance_id?: string;
  extension_id: string;
  name: string;
  publisher: string;
  version: string;
  source: string;
  install_path?: string;
  display_name?: string;
  description?: string;
  icon_data_url?: string;
  severity: string;
  verdict: Verdict;
  verdict_reason?: string;
  malware_score: number;
  risk_score: number;
  context_score?: number;
  grade?: string;
  verdict_state?: VerdictState;
  verdict_label?: string;
  dependency_count?: number;
  activation_summary?: string;
  detail_ref?: string;
  icon_ref?: string;
  from_cache?: boolean;
  scan_incomplete?: boolean;
  analysis_status?: "complete" | "incomplete" | "failed";
  skipped_reason?: string;
  decision?: Decision;
  decision_reason?: string;
  public_outcome?: PublicOutcome;
  decision_basis?: string;
  evidence_confidence?: string;
  provenance?: Record<string, unknown>;
  capability_assessment?: Record<string, unknown>;
  score_schema_version?: string;
  artifact_sha256?: string;
  coverage_percent?: number;
  baseline_changed?: boolean;
  score_details?: {
    basis?: string;
    confidence?: string;
    components?: Record<string, number>;
    counts?: Record<string, number>;
    suppressors?: Array<{ id: string; reason: string; reduction?: number }>;
  };
  collector_details?: Record<string, unknown>;
  finding_count: number;
  top_findings: FindingSummary[];
};

export type BundleExtensionSummary = Omit<ExtensionSummary, "top_findings"> & {
  top_findings: string[];
};

export type ScannerFinding = FindingSummary & {
  evidence_refs?: string[];
  score?: number;
  evidence_type?: string;
  evidence?: Record<string, unknown>;
  evidence_class?: string;
  actionability?: "contextual" | "low" | "review" | "investigate" | "block";
};

export type Recommendation = {
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  action: string;
};

export type ExtensionDetail = Omit<ExtensionSummary, "top_findings"> & {
  source: string;
  description: string;
  repository: string;
  verdict_reason: string;
  grade: string;
  score_details: NonNullable<ExtensionSummary["score_details"]> | Record<string, unknown>;
  score_explanation: string[];
  recommendations: Recommendation[];
  findings: ScannerFinding[];
  evidence: Record<string, {
    file?: string;
    line?: number | null;
    summary?: string;
    evidence_class?: string;
    raw?: unknown;
  }>;
  manifest: Record<string, unknown>;
  dependencies: Record<string, string>;
  dependency_inventory?: Array<{ name: string; version: string; relationship: "direct" | "transitive"; ecosystem: string; advisories?: unknown[] }>;
  artifact_inventory: Record<string, unknown>;
  security_dimensions?: Record<string, { score: number; status: "strong" | "attention" | "weak" | "unknown"; basis: string; deductions: Array<Record<string, unknown>> }>;
  capabilities: Record<string, unknown>;
  artifact_identity?: {
    extension_id?: string;
    version?: string;
    sha256?: string;
    source?: string;
    signature?: Record<string, unknown>;
  };
  analysis_coverage?: {
    status?: "complete" | "incomplete" | "failed" | "pending";
    coverage_percent?: number;
    discovered_files?: number;
    declared_entrypoints?: string[];
    resolved_entrypoints?: string[];
    missing_entrypoints?: string[];
    executable_candidates?: string[];
    analyzed_executable_files?: string[];
    read_failures?: string[];
    oversized_files?: string[];
    limitations?: string[];
    providers?: Record<string, {
      status?: string;
      finding_count?: number;
      error_count?: number;
      ruleset_hash?: string;
      required?: boolean;
    }>;
  };
  baseline_diff?: {
    baseline_changed?: boolean;
    artifact_changed?: boolean;
    analysis_changed?: boolean;
    previous_version?: string;
    current_version?: string;
    changes?: string[];
    added_findings?: string[];
    removed_findings?: string[];
    added_capabilities?: string[];
    removed_capabilities?: string[];
    added_dependencies?: string[];
    removed_dependencies?: string[];
    added_risky_artifacts?: string[];
    removed_risky_artifacts?: string[];
  };
};

export type ReportMetadata = {
  schema_version: string;
  scan_id: string;
  created_at: string;
  scanner_version: string;
  ruleset_version: string;
  profile: string;
  source: string;
  total_extensions: number;
  completed_extensions: number;
  incomplete_extensions: number;
  scanner_build?: string;
  policy_version?: string;
  intelligence_snapshot?: Record<string, unknown>;
};

export type ScannerBundleSummary = {
  summary: {
    total_extensions: number;
    clean: number;
    review: number;
    suspicious: number;
    malicious: number;
    max_risk_score: number;
    max_malware_score: number;
    max_context_score?: number;
    posture_status: string;
    decision_counts?: Record<Decision, number>;
    analysis_status_counts?: Record<string, number>;
    incomplete?: number;
  };
  top_risk_extensions: BundleExtensionSummary[];
  finding_counts: Record<string, number>;
  severity_counts: Record<string, number>;
  category_counts: Record<string, number>;
  evidence_class_counts?: Record<string, number>;
  version_deltas?: Array<Record<string, unknown>>;
};

export type RuleMetadata = {
  rule_id: string;
  title: string;
  category: string;
  evidence_class: string;
  default_severity: string;
  description: string;
  recommendation: string;
  false_positive_notes?: string;
  benchmark_tags?: string[];
};

export type MarketplaceSearchResult = {
  extension_id: string;
  display_name: string;
  publisher: string;
  publisher_display_name: string;
  publisher_verified: boolean;
  short_description: string;
  version: string;
  last_updated: string;
  install_count: number;
  rating_average: number;
  rating_count: number;
  icon_url: string;
  registry?: "vs-marketplace" | "openvsx";
  download_url?: string;
};

export type DiscoveryMatchReason = "exact_identity" | "exact_name" | "matching" | "related";

export type PublisherDiscoveryResult = {
  publisher: string;
  display_name: string;
  verified: boolean;
  registry: "vs-marketplace" | "openvsx";
  matched_extensions: number;
};

/**
 * Additive discovery contract. `results` remains available on the marketplace
 * endpoint for older clients; new clients use these explicit groups so a fuzzy
 * match can never become an implicit scan target.
 */
export type DiscoveryResult = MarketplaceSearchResult & {
  normalized_identity: string;
  source: "registry" | "cache";
  match_reason: DiscoveryMatchReason;
  icon_state: "published" | "fallback";
};

export type DiscoveryResponse = {
  query: string;
  normalized_query?: string;
  exact_match: DiscoveryResult | null;
  matching_extensions: DiscoveryResult[];
  related_extensions: DiscoveryResult[];
  matching_publishers: PublisherDiscoveryResult[];
  results: MarketplaceSearchResult[];
  source: "registry" | "registry-cache";
  cached?: boolean;
};

export type ImportedReportBundle = {
  id: string;
  name: string;
  importedAt: number;
  metadata: ReportMetadata;
  summary: ScannerBundleSummary;
  leaderboard: { extensions: BundleExtensionSummary[] };
  posture: Record<string, unknown>;
  rules: { ruleset_version?: string; rules: RuleMetadata[] };
  details: Record<string, ExtensionDetail>;
};

export type PostureMetric = {
  id: string;
  status: "success" | "warning" | "failure" | "skipped";
  reason: string;
  evidence: Record<string, unknown>;
  client: string;
  category: string;
  score: number;
  weight: number;
  recommendation: string;
};

export type PostureSummary = {
  status: "success" | "warning" | "failure" | "skipped";
  score: number;
  max_metric_score: number;
  weighted_score: number;
  counts: Record<"failure" | "warning" | "success" | "skipped", number>;
  clients: string[];
  total_metrics: number;
  top_findings: Array<{
    id: string;
    client: string;
    status: string;
    score: number;
    reason: string;
    recommendation: string;
  }>;
};

export type ReportSummary = {
  summary: {
    total_extensions: number;
    max_malware_score: number;
    max_risk_score: number;
    posture_score?: number;
    posture_status?: string;
    by_verdict: Record<string, number>;
    by_severity: Record<string, number>;
  };
  human_summary: string[];
  posture_summary?: PostureSummary;
  posture?: PostureMetric[];
  version_deltas?: Array<{
    extension_id: string;
    previous_version?: string;
    current_version?: string;
    changes: Record<string, unknown>;
  }>;
  top_risk_extensions: ExtensionSummary[];
  action_counts: Record<Verdict, number>;
  finding_counts: {
    by_rule: Record<string, number>;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
  };
};

export type BenchmarkResult = {
  schema_version: string;
  total: number;
  correct: number;
  accuracy: number;
  false_positive: number;
  false_negative: number;
  malicious_recall: number;
  rows: Array<{
    extension_id: string;
    expected_verdict: Verdict;
    actual_verdict: Verdict | "missing";
    ok: boolean;
    reason: string;
    risk_score: number | null;
    malware_score: number | null;
    top_findings: string[];
  }>;
  scanner_summary: Record<string, unknown>;
};

export type BenchmarkBundleRow = {
  extension_id: string;
  version: string;
  label: string;
  exposure_types: string[];
  expected_findings: string[];
  ide_scanner_findings: string[];
  matched_findings: string[];
  matched: boolean;
  outcome: "true_positive" | "false_positive" | "false_negative" | "true_negative" | "not_scanned";
  severity: string;
  verdict: Verdict | "missing";
  risk_score: number | null;
  malware_score: number | null;
  evidence: Array<{
    rule_id?: string;
    severity?: string;
    summary?: string;
    file_refs?: string[];
  }>;
  not_reported_by_compared_tools: string[];
  reference: string;
};

export type BenchmarkBundle = {
  id: string;
  name: string;
  importedAt: number;
  metadata: {
    schema_version: string;
    benchmark_id: string;
    created_at: string;
    dataset_id: string;
    dataset_source: string;
    scanner_version: string;
    ruleset_version: string;
    scan_id: string;
    total_extensions: number;
  };
  leaderboard: { extensions: BenchmarkBundleRow[] };
  benchmark_summary: {
    dataset_id: string;
    source: string;
    total_extensions: number;
    evaluated_extensions: number;
    not_scanned: number;
    credential_extension_count: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    true_negatives: number;
    precision: number;
    recall: number;
    unique_signals: number;
  };
  rule_coverage: {
    rules: Array<{
      rule_id: string;
      expected: number;
      detections: number;
      false_positives: number;
      precision: number;
      recall: number;
    }>;
  };
  comparisons: Record<string, unknown>;
  extensions: Record<string, BenchmarkBundleRow>;
};

export type ScanJobPublic = {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  createdAt: number;
  updatedAt: number;
  error: string | null;
  summary: ReportSummary | null;
  source?: "local" | "agent";
  agent?: {
    schema_version?: string;
    generated_at?: number;
    hostname?: string;
    platform?: string;
    platform_release?: string;
    machine?: string;
    python?: string;
  };
};
