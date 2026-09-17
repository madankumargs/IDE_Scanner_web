type GithubDispatchConfig = {
  token: string;
  owner: string;
  repository: string;
};

export async function dispatchGithubDeepScan(
  config: GithubDispatchConfig,
  jobId: string,
): Promise<Response> {
  return fetch(
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/actions/workflows/deep-scan.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "guardrails-web",
      },
      body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );
}
