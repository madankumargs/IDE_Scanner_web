const baseUrl = (process.env.GUARDRAILS_DEPLOYMENT_URL || "https://abscissa.dev").replace(/\/$/, "");
const paths = ["/", "/registry", "/status"];

async function request(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

for (const path of paths) {
  const response = await request(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${path} returned ${contentType || "no content type"}, not HTML.`);
  }
  const body = await response.text();
  if (!body.includes("GuardRails")) {
    throw new Error(`${path} did not return the GuardRails application shell.`);
  }
  console.log(`Verified ${baseUrl}${path}`);
}
