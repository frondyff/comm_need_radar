import { pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://api.vercel.com";

function normalizeDeploymentReference(reference) {
  if (!/^https?:\/\//i.test(reference)) return reference;
  return new URL(reference).hostname;
}

export async function getDeployment(
  reference,
  {
    token = process.env.VERCEL_TOKEN,
    orgId = process.env.VERCEL_ORG_ID,
    fetchImpl = fetch,
    apiBase = DEFAULT_API_BASE,
  } = {}
) {
  if (!reference) throw new Error("A deployment ID or URL is required.");
  if (!token) throw new Error("VERCEL_TOKEN is required.");
  if (!orgId) throw new Error("VERCEL_ORG_ID is required.");

  const normalizedReference = normalizeDeploymentReference(reference);
  const endpoint = new URL(
    `/v13/deployments/${encodeURIComponent(normalizedReference)}`,
    apiBase
  );
  endpoint.searchParams.set("teamId", orgId);
  const response = await fetchImpl(endpoint, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error?.message || `Vercel returned HTTP ${response.status}`);
  }
  return {
    id: body.id,
    url: body.url ? `https://${body.url}` : null,
    readyState: body.readyState ?? body.status ?? null,
    target: body.target ?? null,
    projectId: body.projectId ?? body.project?.id ?? null,
    releaseSha: body.meta?.releaseSha ?? body.meta?.gitCommitSha ?? null,
  };
}

export function assertDeploymentState(deployment, { expectedId, expectedState, projectId } = {}) {
  if (expectedId && deployment.id !== expectedId) {
    throw new Error(`Expected deployment ${expectedId}, received ${deployment.id}.`);
  }
  if (expectedState && deployment.readyState !== expectedState) {
    throw new Error(
      `Expected deployment state ${expectedState}, received ${deployment.readyState}.`
    );
  }
  if (projectId && deployment.projectId !== projectId) {
    throw new Error(`Expected project ${projectId}, received ${deployment.projectId}.`);
  }
  return deployment;
}

export async function waitForDeployment(reference, expectedState, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 300_000);
  const intervalMs = Number(options.intervalMs ?? 5_000);
  const startedAt = Date.now();
  let deployment;

  while (Date.now() - startedAt < timeoutMs) {
    deployment = await getDeployment(reference, options);
    if (deployment.readyState === expectedState) return deployment;
    if (["ERROR", "CANCELED", "BLOCKED"].includes(deployment.readyState)) {
      throw new Error(
        `Deployment ${deployment.id} entered terminal state ${deployment.readyState}.`
      );
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${reference} to reach ${expectedState}; last state was ${deployment?.readyState}.`
  );
}

async function main() {
  const [command, reference, expected] = process.argv.slice(2);
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (command === "get") {
    const deployment = await getDeployment(reference);
    console.log(JSON.stringify(assertDeploymentState(deployment, { projectId })));
    return;
  }
  if (command === "wait") {
    const deployment = await waitForDeployment(reference, expected || "READY");
    console.log(JSON.stringify(assertDeploymentState(deployment, { projectId })));
    return;
  }
  if (command === "assert") {
    const deployment = await getDeployment(reference);
    console.log(
      JSON.stringify(
        assertDeploymentState(deployment, { expectedId: expected, projectId })
      )
    );
    return;
  }
  throw new Error("Usage: vercel-release-state.mjs get|wait|assert <deployment> [expected]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
