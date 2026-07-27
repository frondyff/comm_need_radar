import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDeploymentState,
  getDeployment,
  waitForDeployment,
} from "./vercel-release-state.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("getDeployment returns the release fields without exposing credentials", async () => {
  let authorization;
  let requestedURL;
  const deployment = await getDeployment("https://comm-need-radar.vercel.app/", {
    token: "test-token",
    orgId: "team_test",
    fetchImpl: async (url, options) => {
      requestedURL = url;
      authorization = options.headers.authorization;
      return response({
        id: "dpl_current",
        url: "comm-current.vercel.app",
        readyState: "READY",
        target: "production",
        projectId: "prj_test",
        meta: { releaseSha: "abc123" },
      });
    },
  });

  assert.equal(authorization, "Bearer test-token");
  assert.equal(
    requestedURL.pathname,
    "/v13/deployments/comm-need-radar.vercel.app"
  );
  assert.deepEqual(deployment, {
    id: "dpl_current",
    url: "https://comm-current.vercel.app",
    readyState: "READY",
    target: "production",
    projectId: "prj_test",
    releaseSha: "abc123",
  });
  assert.equal(JSON.stringify(deployment).includes("test-token"), false);
});

test("assertDeploymentState rejects alias races and wrong projects", () => {
  const deployment = {
    id: "dpl_new",
    readyState: "READY",
    projectId: "prj_expected",
  };
  assert.throws(
    () => assertDeploymentState(deployment, { expectedId: "dpl_old" }),
    /Expected deployment dpl_old/
  );
  assert.throws(
    () => assertDeploymentState(deployment, { projectId: "prj_other" }),
    /Expected project prj_other/
  );
});

test("waitForDeployment stops on blocked deployments", async () => {
  await assert.rejects(
    waitForDeployment("dpl_blocked", "READY", {
      token: "test-token",
      orgId: "team_test",
      intervalMs: 1,
      timeoutMs: 20,
      fetchImpl: async () =>
        response({
          id: "dpl_blocked",
          url: "blocked.vercel.app",
          readyState: "BLOCKED",
          projectId: "prj_test",
        }),
    }),
    /terminal state BLOCKED/
  );
});
