type Input = {
  extensionId: string;
  version: string;
  fullAnalysisHref?: string;
  scanned: boolean;
  signedIn: boolean;
};

export function publicAnalysisAction({ extensionId, version, fullAnalysisHref, scanned, signedIn }: Input) {
  const versionHref = `/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}`;
  const accountHref = `/account?next=${encodeURIComponent(fullAnalysisHref || versionHref)}`;

  if (scanned && fullAnalysisHref && signedIn) {
    return { href: fullAnalysisHref, label: "Open full report and monitoring", requiresSignIn: false };
  }

  return scanned
    ? { href: accountHref, label: "Sign in for full report and monitoring", requiresSignIn: true }
    : { href: accountHref, label: "Sign in to request a Deep Scan", requiresSignIn: true };
}
