import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

// Head tags only: jsdom never loads the font stylesheet, so React 19 suspends the commit forever.
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<object>()), HeadContent: () => null, Scripts: () => null }));

// F6 seam A: the real index Route in a memory-history router; only fetch (the backend) is faked.
let reqs: { path: string; method: string }[];
let indexed: boolean;
const FASTAPI = "https://github.com/tiangolo/fastapi";
const HELLO = "https://github.com/octocat/Hello-World";
const count = (path: string) => reqs.filter((r) => r.path === path).length;

beforeEach(() => {
  reqs = [];
  indexed = true;
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; index.tsx:142 calls it
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    // API_BASE is read at load (api.ts:2), so match by path only.
    const path = new URL(String(input), "http://x").pathname.replace(/^.*(\/api\/v1\/)/, "$1");
    reqs.push({ path, method: init?.method ?? "GET" });
    const body = path.endsWith("/check")
      ? { indexed, chunks: indexed ? 42 : 0, compatible: true, files_indexed: indexed ? 7 : 0, graph_ready: indexed, repo_name: "tiangolo--fastapi" }
      : { status: "success", repo_name: "tiangolo--fastapi", files_indexed: 7, chunks_stored: 42, graph_ready: true, message: "Indexed 7 files" };
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }), context: { queryClient: new QueryClient() } });
  render(<RouterProvider router={router} />);
  return router;
}
const at = (url: string) => `/?repo=${encodeURIComponent(url)}`;
const input = () => screen.findByPlaceholderText("https://github.com/tiangolo/fastapi");
const analyse = () => screen.getByRole("button", { name: /analyse/i });

describe("F6 repo in the URL: middle", () => {
  // Break: analyse() (index.tsx:86-177) never navigates, so search stays {}.
  it.each([FASTAPI, HELLO])("submit sets ?repo=%s", async (url) => {
    const router = renderAt("/");
    await userEvent.type(await input(), url);
    await userEvent.click(analyse());
    await screen.findByRole("tab", { name: /q&a chat/i });
    await waitFor(() => expect(router.state.location.search).toEqual({ repo: url }));
  });

  // Break: Index (index.tsx:72-84) starts empty and never reads ?repo, so no /check and no results.
  it.each([FASTAPI, HELLO])("reload of ?repo=%s restores results via /check, no ingest", async (url) => {
    renderAt(at(url));
    await screen.findByRole("tab", { name: /q&a chat/i });
    expect(screen.getByText("42")).toBeInTheDocument(); // chunks from the fake /check reply
    expect([count("/api/v1/check"), count("/api/v1/ingest")]).toEqual([1, 0]);
  });
});

describe("F6 repo in the URL: edges", () => {
  // Break: New repo (F3) resets state but leaves ?repo, so a reload brings the old repo back.
  // Precondition (results restored from ?repo) stops a no-param page from passing vacuously.
  it.each([FASTAPI, HELLO])("New repo clears ?repo=%s", async (url) => {
    const router = renderAt(at(url));
    await screen.findByRole("tab", { name: /q&a chat/i });
    await userEvent.click(screen.getByRole("button", { name: /new repo/i }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByRole("tab", { name: /q&a chat/i })).toBeNull();
  });
});

describe("F6 repo in the URL: bad", () => {
  // Break: ?repo skips the GITHUB_RE / length checks (index.tsx:95-110) or is ignored silently.
  const INVALID = "Please enter a valid public GitHub repository URL (https://github.com/owner/repo).";
  it.each([
    ["not-a-url", "not-a-url", INVALID],
    ["gitlab", "https://gitlab.com/a/b", INVALID],
    ["301 chars", `https://github.com/a/${"x".repeat(280)}`, "URL is too long. Please enter a valid GitHub repository URL."],
  ])("?repo=<%s> shows the validation error, calls no API", async (_label, bad, msg) => {
    renderAt(at(bad));
    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(reqs).toEqual([]);
  });

  // Break: ?repo ignored (input empty), or an unindexed repo auto-ingests on load (drive-by Groq spend).
  it.each([FASTAPI, HELLO])("unindexed ?repo=%s prefills, waits for Analyse, then 1 ingest", async (url) => {
    indexed = false;
    renderAt(at(url));
    expect(await screen.findByDisplayValue(url)).toBeInTheDocument();
    await waitFor(() => expect(count("/api/v1/check")).toBe(1));
    await waitFor(() => expect(analyse()).toBeEnabled());
    await new Promise((r) => setTimeout(r, 0)); // 0 ms yield, not a sleep: lets a chained auto-ingest fire
    expect(count("/api/v1/ingest")).toBe(0);
    await userEvent.click(analyse());
    await screen.findByRole("tab", { name: /q&a chat/i });
    expect(reqs.filter((r) => r.path === "/api/v1/ingest")).toEqual([{ path: "/api/v1/ingest", method: "POST" }]);
  });
});
