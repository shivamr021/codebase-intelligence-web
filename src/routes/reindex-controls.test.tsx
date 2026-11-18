import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
type Call = { path: string; method: string; body: unknown };
const [URL_A, URL_B, CHECK, INGEST] = ["https://github.com/tiangolo/fastapi", "https://github.com/acme/widgets", "/api/v1/check", "/api/v1/ingest"];
const CACHED = { indexed: true, compatible: true, chunks: 16, files_indexed: 12 };
const INGESTED = { status: "success", repo_name: "fastapi", files_indexed: 48, chunks_stored: 310, graph_ready: true, message: "Indexed 48 files" };
// Fake backend at the fetch boundary; matched by path (api.ts:1-2 may give "undefined/").
function fakeBackend(reply: (path: string) => [number, unknown] | Promise<[number, unknown]>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.slice(url.indexOf("/api/")).split("?")[0];
    calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    const [status, body] = await reply(path);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }));
  return calls;
}
const [flow, ingests] = [(cs: Call[]) => cs.map((c) => [c.method, c.path, c.body]), (cs: Call[]) => cs.filter((c) => c.path === INGEST)];
// Seam A: index Route in a memory router; __root.tsx:102 RootShell renders <html>, so mount on document.
async function analyse(url: string) {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: ["/"] }) });
  await router.load().then(() => render(<RouterProvider router={router} />, { container: document as unknown as HTMLElement }));
  const user = userEvent.setup();
  await user.type(await screen.findByPlaceholderText(URL_A), url);
  await user.click(screen.getByRole("button", { name: /analyse/i }));
  return user;
}
// Header stat value (index.tsx:635-641: label div, then value div).
const stat = async (label: string) => (await screen.findByText(label)).nextElementSibling?.textContent;
const reindex = () => screen.getByRole("button", { name: /re-index/i });
const cached = async (url = URL_A) => { const user = await analyse(url); await stat("Chunks"); return user; };
beforeEach(() => void (Element.prototype.scrollIntoView = vi.fn()));

describe("F3 re-index controls: middle", () => {
  // Guard (existing): break index.tsx:129 to `if (false)` → POST /ingest is sent.
  it.each([16, 120])("indexed and compatible (%i chunks) calls only /check", async (chunks) => {
    const calls = fakeBackend((p) => [200, p === CHECK ? { ...CACHED, chunks } : INGESTED]);
    await analyse(URL_A);
    const shown = await stat("Chunks");
    expect(flow(calls)).toEqual([["GET", CHECK, null]]);
    expect(shown).toBe(String(chunks));
  });
  // New. Breaks: no Re-index button; force missing/false; header keeps the cached values.
  it.each([[URL_A, 310, "Indexed 48 files"], [URL_B, 77, "Indexed 9 files"]] as const)(
    "Re-index on %s sends POST /ingest force:true and updates header", async (url, chunks_stored, message) => {
      const calls = fakeBackend((p) => [200, p === CHECK ? CACHED : { ...INGESTED, chunks_stored, message }]);
      const user = await analyse(url);
      expect(await stat("Chunks")).toBe("16");
      await user.click(reindex());
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(flow(ingests(calls))).toEqual([["POST", INGEST, { github_url: url, force: true }]]);
      expect(await stat("Chunks")).toBe(String(chunks_stored));
    });
});
describe("F3 re-index controls: edges", () => {
  // New. Break: index.tsx:129 reads only `indexed`, so an old collection is served from cache.
  it.each([16, 900])("compatible:false (%i chunks) re-indexes with force on its own", async (chunks) => {
    const calls = fakeBackend((p) => [200, p === CHECK ? { ...CACHED, chunks, compatible: false } : INGESTED]);
    await analyse(URL_A);
    const shown = await stat("Chunks");
    expect(flow(calls)).toEqual([["GET", CHECK, null], ["POST", INGEST, { github_url: URL_A, force: true }]]);
    expect(shown).toBe("310");
  });
  // Guard (existing): break index.tsx:129 to `check.indexed && (check as any).compatible` → POST /ingest.
  it.each([[{ indexed: true, chunks: 16 }], [{ indexed: true, chunks: 16, files_indexed: 12 }]])(
    "old backend without compatible field %j counts as compatible", async (reply) => {
      const calls = fakeBackend((p) => [200, p === CHECK ? reply : INGESTED]);
      await analyse(URL_A);
      const shown = await stat("Chunks");
      expect(flow(calls)).toEqual([["GET", CHECK, null]]);
      expect(shown).toBe("16");
    });
  // New. Breaks: no New repo button; results kept; input keeps the old URL or is not focused.
  it.each([URL_A, URL_B])("New repo after %s clears results and focuses empty input", async (url) => {
    const calls = fakeBackend(() => [200, CACHED]);
    await (await cached(url)).click(screen.getByRole("button", { name: /new repo/i }));
    const input = screen.getByPlaceholderText(URL_A);
    expect(screen.queryByText("Chunks")).toBeNull();
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(calls).toHaveLength(1);
  });
});
describe("F3 re-index controls: bad", () => {
  // New. Breaks: no Re-index button; error swallowed; results cleared on failure (like index.tsx:114).
  it.each([
    [500, "<html><h1>500 Internal Server Error</h1></html>", /temporarily unavailable/],
    [400, { detail: "Could not download repo tiangolo/fastapi: HTTP 404." }, /Could not download repo tiangolo\/fastapi: HTTP 404\./],
  ])("failed re-index (%i) shows the error and keeps old results", async (status, body, shownError) => {
    const calls = fakeBackend((p) => (p === CHECK ? [200, CACHED] : [status, body]));
    await (await cached()).click(reindex());
    expect(await screen.findByText(shownError)).toBeInTheDocument();
    expect(ingests(calls)).toHaveLength(1);
    expect(await stat("Chunks")).toBe("16");
  });
  // New. Break: button stays enabled with no in-flight guard → second POST /ingest.
  it.each(["dblClick", "tripleClick"] as const)("%s on Re-index sends one request", async (how) => {
    let release!: () => void; // holds POST /ingest open while the extra clicks land
    const held = new Promise<[number, unknown]>((r) => (release = () => r([200, INGESTED])));
    const calls = fakeBackend((p) => (p === CHECK ? [200, CACHED] : held));
    await (await cached())[how](reindex());
    release();
    expect(await screen.findByText("Indexed 48 files")).toBeInTheDocument();
    expect(ingests(calls)).toHaveLength(1);
  });
});
