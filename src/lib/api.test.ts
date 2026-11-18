import { describe, expect, it, vi } from "vitest";

type Api = (typeof import("./api"))["api"];

// Fake backend at the network boundary: every request URL is recorded here.
function fakeBackend(status: number, body: string) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(url), new Response(body, { status }))));
  return calls;
}

// api.ts reads VITE_API_BASE_URL at module load, so re-import after each stub.
// `null` means unset: a default parameter would swallow an explicit `undefined`.
async function loadApi(base: string | null = "http://api.test") {
  vi.stubEnv("VITE_API_BASE_URL", base ?? undefined);
  vi.resetModules();
  return import("./api");
}

const ingest = (a: Api) => a.ingest("https://github.com/octocat/x");
const bugs = (a: Api) => a.bugs("owner--repo");

describe("F1 api client: middle", () => {
  // Breaks: 400 → "Request failed…" (api.ts:88-90); 502 → `status >= 500` branch first (:82-86);
  // 404 → "Not found…" (:78-80), the fix that covers 400/502 only.
  it.each([
    [400, ingest, "Could not download repo octocat/x: HTTP 404."],
    [400, ingest, "Could not download repo a/private: HTTP 403."],
    [502, bugs, "LLM error: empty reply from model"],
    [502, bugs, "Bug scan failed: [LLM Error] rate limited upstream"],
    [404, (a: Api) => a.graph("owner--repo"), "No graph found for 'owner--repo'. Run POST /api/v1/ingest first."],
    [404, (a: Api) => a.diagram("octocat--hello"), "No diagram found for 'octocat--hello'. Run POST /api/v1/ingest first."],
  ])("%i with string detail surfaces it: %#", async (status, call, detail) => {
    fakeBackend(status, JSON.stringify({ detail }));
    await expect(call((await loadApi()).api)).rejects.toThrow(detail);
  });

  // Guard (existing): break `return res.json()` (api.ts:93) to `return {}`.
  it.each([
    ['{"indexed":true,"chunks":16}', { indexed: true, chunks: 16 }],
    ['{"indexed":false,"chunks":0}', { indexed: false, chunks: 0 }],
  ])("check 200 returns parsed body %s", async (body, want) => {
    const calls = fakeBackend(200, body);
    await expect((await loadApi()).api.check("owner--repo")).resolves.toEqual(want);
    expect(calls).toEqual(["http://api.test/api/v1/check?repo_name=owner--repo"]);
  });
});

describe("F1 api client: edges", () => {
  // Break: today generic "Request failed…"; a naive String(detail) gives "[object Object]".
  it.each([
    [[{ type: "missing", loc: ["body", "github_url"], msg: "Field required", input: {} }], ["Field required"]],
    [
      [
        { type: "string_type", loc: ["body", "repo_name"], msg: "Input should be a valid string", input: 7 },
        { type: "missing", loc: ["body", "question"], msg: "Field required", input: {} },
      ],
      ["Input should be a valid string", "Field required"],
    ],
  ])("ask 422 list detail gives readable message %#", async (detail, msgs) => {
    fakeBackend(422, JSON.stringify({ detail }));
    const err: Error = await (await loadApi()).api.ask("owner--repo", "q?").catch((e) => e);
    for (const m of msgs) expect(err.message).toContain(m);
    expect(err.message).not.toContain("[object Object]");
  });

  // Guard (existing, kept on purpose): delete the 429 branch (api.ts:74-76).
  it.each([['{"error":"Rate limit exceeded: 10 per 1 minute"}'], ["Too Many Requests"]])(
    "ingest 429 keeps the retry message (%s)",
    async (body) => {
      fakeBackend(429, body);
      await expect(ingest((await loadApi()).api)).rejects.toThrow("Too many requests. Please try again shortly.");
    },
  );

  // Guard (existing): break api.ts:83-85 to throw the raw body.
  it.each([
    ["<html><body><h1>500 Internal Server Error</h1></body></html>", "<h1>"],
    ['Traceback (most recent call last):\n  File "/app/main.py", line 3', "Traceback"],
  ])("diagram 500 non-JSON body gives generic message %#", async (body, leak) => {
    fakeBackend(500, body);
    const err: Error = await (await loadApi()).api.diagram("owner--repo").catch((e) => e);
    expect(err.message).toMatch(/temporarily unavailable/);
    expect(err.message).not.toContain(leak);
  });

  // New: `.replace(".git", "")` (api.ts:62) strips ".git" mid-name.
  // Guard (existing, last 2 rows): drop that replace.
  it.each([
    ["https://github.com/octocat/octocat.github.io", "octocat.github.io"],
    ["https://github.com/acme/my.gitops", "my.gitops"],
    ["https://github.com/octocat/repo.git/", "repo"],
    ["https://github.com/a/tools.git", "tools"],
  ])("repoNameFromUrl(%s) is %s", async (url, want) => {
    expect((await loadApi()).repoNameFromUrl(url)).toBe(want);
  });
});

describe("F1 api client: bad config and dead backend", () => {
  // Break: today API_BASE is undefined and the request goes to "undefined/api/v1/…".
  // Either the import or the call may reject; neither may hit the network.
  it.each([["ingest", ingest], ["bugs", bugs]] as const)(
    "unset VITE_API_BASE_URL: %s names the variable, sends nothing",
    async (_n, call) => {
      const calls = fakeBackend(200, "{}");
      await expect((async () => call((await loadApi(null)).api))()).rejects.toThrow("VITE_API_BASE_URL is not set");
      expect(calls).toEqual([]);
    },
  );

  // Break: today the raw browser TypeError ("Failed to fetch") reaches the UI.
  it.each([["Failed to fetch"], ["NetworkError when attempting to fetch resource."]])(
    "rejected fetch (%s) says Cannot reach the backend",
    async (raw) => {
      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError(raw))));
      await expect((await loadApi()).api.check("owner--repo")).rejects.toThrow("Cannot reach the backend");
    },
  );
});
