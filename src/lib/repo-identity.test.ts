import { createElement } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

// Head tags only: jsdom never loads the font stylesheet, so React 19 suspends the commit forever.
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<object>()), HeadContent: () => null, Scripts: () => null }));

// F8 seam B: the real index Route; fetch (the backend) is faked. /check says indexed:true (the cached
// branch, index.tsx:129-137) and carries B8's repo_name. Requests are matched by path (api.ts:2).
let reqs: { path: string; params: Record<string, string>; body: Record<string, string> | null }[];
let nameFor: (params: Record<string, string>) => string;
const named = (path: string) => reqs.filter((r) => r.path === path).map((r) => r.body?.repo_name ?? r.params.repo_name);

beforeEach(() => {
  reqs = [];
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; index.tsx:142 calls it
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const u = new URL(String(input), "http://x");
    const path = u.pathname.replace(/^.*(\/api\/v1\/)/, "$1");
    const params = Object.fromEntries(u.searchParams);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    reqs.push({ path, params, body });
    const repo_name = path.endsWith("/check") ? nameFor(params) : (params.repo_name ?? body?.repo_name);
    const replies: Record<string, [number, object]> = {
      "/api/v1/check": [200, { indexed: true, chunks: 42, compatible: true, files_indexed: 7, graph_ready: true, repo_name }],
      "/api/v1/graph": [200, { status: "success", repo_name, html: "<p>g</p>", stats: { nodes: 1, edges: 0 } }],
      "/api/v1/bugs": [200, { status: "success", repo_name, bugs: [], total: 0 }],
      "/api/v1/diagram": [404, { detail: `No diagram found for '${repo_name}'. Run POST /api/v1/ingest first.` }],
      "/api/v1/ask": [200, { status: "success", repo_name, question: body?.question, answer: "ok", chunks_used: 1 }],
    };
    const [status, reply] = replies[path] ?? [500, { detail: "unexpected" }];
    return new Response(JSON.stringify(reply), { status });
  }));
});

async function submit(url: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }), context: { queryClient: new QueryClient() } });
  render(createElement(RouterProvider, { router } as never));
  await userEvent.type(await screen.findByPlaceholderText("https://github.com/tiangolo/fastapi"), url);
  await userEvent.click(screen.getByRole("button", { name: /analyse/i }));
  await screen.findByRole("tab", { name: /q&a chat/i });
}

describe("F8 owner-aware names: middle", () => {
  // Break: the cached branch keeps the browser name (index.tsx:132 `repo_name: repoName,`).
  // Row 2: a plain browser join of owner--repo ("Tiangolo--FastAPI.git") fails too.
  it.each([
    ["https://github.com/tiangolo/fastapi", "tiangolo--fastapi"],
    ["https://github.com/Tiangolo/FastAPI.git", "tiangolo--fastapi"],
  ])("after /check for %s, every later call uses %s", async (url, want) => {
    nameFor = () => want;
    await submit(url);
    await userEvent.type(screen.getByPlaceholderText("Ask a question about the code…"), "Where is auth?");
    await userEvent.click(screen.getByRole("button", { name: /^ask$/i }));
    for (const tab of [/dependency graph/i, /bug report/i, /architecture/i])
      await userEvent.click(screen.getByRole("tab", { name: tab }));
    await waitFor(() => expect([named("/api/v1/diagram").length, named("/api/v1/ask").length]).toEqual([1, 1]));
    const later = ["ask", "graph", "bugs", "diagram"].map((p) => [p, named(`/api/v1/${p}`)]);
    expect(later).toEqual([["ask", [want]], ["graph", [want]], ["bugs", [want]], ["diagram", [want]]]);
  });
});

describe("F8 owner-aware names: edges", () => {
  // Break: /check still sends a browser-derived repo_name (api.ts:57-63, :126-129); row 3 is mangled
  // to "octocathub.io" by `.replace(".git", "")` (api.ts:62).
  it.each([
    "https://github.com/tiangolo/fastapi.git/",
    "https://github.com/tiangolo/fastapi",
    "https://github.com/octocat/octocat.github.io",
  ])("%s sends /check with github_url only", async (url) => {
    nameFor = () => "tiangolo--fastapi";
    await submit(url);
    expect(reqs.filter((r) => r.path === "/api/v1/check").map((r) => r.params)).toEqual([{ github_url: url }]);
  });
});

describe("F8 owner-aware names: bad", () => {
  // Break: the owner is dropped (api.ts:57-63), so a/fastapi and b/fastapi share "fastapi".
  // The fake answers like B8: owner--repo keyed by github_url; a name-only check just echoes it.
  it("a/fastapi and b/fastapi get different repo_name in later calls", async () => {
    const byUrl: Record<string, string> = {
      "https://github.com/a/fastapi": "a--fastapi",
      "https://github.com/b/fastapi": "b--fastapi",
    };
    nameFor = (p) => byUrl[p.github_url] ?? p.repo_name;
    const graphNames: string[][] = [];
    for (const url of Object.keys(byUrl)) {
      reqs = [];
      await submit(url);
      await userEvent.click(screen.getByRole("tab", { name: /dependency graph/i }));
      await waitFor(() => expect(named("/api/v1/graph")).toHaveLength(1));
      graphNames.push(named("/api/v1/graph"));
      cleanup();
    }
    expect(graphNames).toEqual([["a--fastapi"], ["b--fastapi"]]);
  });
});
