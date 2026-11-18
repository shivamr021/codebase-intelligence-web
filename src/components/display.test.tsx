import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { GraphTab } from "./GraphTab";
const [URL_A, CACHED] = ["https://github.com/tiangolo/fastapi", { indexed: true, compatible: true, chunks: 16, files_indexed: 12 }] as const;
const asDoc = { container: document as unknown as HTMLElement };
// Fake backend at the fetch boundary; replies by path (api.ts:1-2 may give "undefined/").
const fakeBackend = (reply: (path: string) => [number, unknown]) =>
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const [status, body] = reply(url.slice(url.indexOf("/api/")).split("?")[0]);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }));
// Stat cards: label div, then value div (GraphTab.tsx:113-119, index.tsx:635-641).
const statValue = async (label: string) => (await screen.findByText(label)).nextElementSibling?.textContent;
beforeEach(() => void (Element.prototype.scrollIntoView = vi.fn()));
// Seam A: index Route in a memory router; __root.tsx:102 renders <html>, so mount on document.
async function openIndex() {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: ["/"] }) });
  await router.load();
  render(<RouterProvider router={router} />, asDoc);
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText(URL_A);
  return async (url: string) => {
    await user.clear(input).then(() => user.type(input, url));
    await user.click(screen.getByRole("button", { name: /analyse/i }));
  };
}
// Seam B, also a document root: a div root first marks the document, and React then skips the
// event listeners of a later document-mounted route root (Analyse never submits).
async function mostDependedOn(most_depended_on: unknown) {
  const stats = { nodes: 12, edges: 20, cycles: [], ...(most_depended_on === undefined ? {} : { most_depended_on }) };
  fakeBackend(() => [200, { status: "success", repo_name: "fastapi", html: "<html><head></head><body></body></html>", stats }]);
  render(<html><body><GraphTab repoName="fastapi" /></body></html>, asDoc);
  return statValue("Most depended on");
}

describe("F2 display: middle", () => {
  // New. Break: GraphTab.tsx:57 reads `mostDep[0]?.[0]` (tuple) → object shape shows "—".
  it.each([
    [[{ file: "config.py", imported_by: 8 }], "config.py (8)"],
    [[{ file: "src/lib/api.ts", imported_by: 3 }, { file: "main.py", imported_by: 1 }], "src/lib/api.ts (3)"],
  ])("most_depended_on %j shows %s", async (data, want) => expect(await mostDependedOn(data)).toBe(want));
  // New. Break: index.tsx:133 hardcodes `files_indexed: 0` for a cached repo.
  it.each([12, 48])("cached repo shows %i files from /check", async (files_indexed) => {
    fakeBackend(() => [200, { ...CACHED, files_indexed }]);
    await (await openIndex())(URL_A);
    expect(await statValue("Files")).toBe(String(files_indexed));
  });
});
describe("F2 display: edges", () => {
  // Guard (existing): break GraphTab.tsx:58 fallback "—" → 0; the card then shows "0".
  it.each([[[]], [undefined]])("most_depended_on %j shows —", async (data) => expect(await mostDependedOn(data)).toBe("—"));
  // Guard (existing): break GraphTab.tsx:56 (`mostDep[0]` → `"—"`); legacy string list loses its name.
  it.each([[["config.py"], "config.py"], [["core/db.py", "main.py"], "core/db.py"]])(
    "legacy string list %j shows %s", async (data, want) => expect(await mostDependedOn(data)).toBe(want));
  // New. Break: index.tsx:133 `files_indexed: 0` shows a false "0" for an old backend.
  it.each([[{ indexed: true, chunks: 16 }], [{ indexed: true, compatible: true, chunks: 5 }]])(
    "/check %j without files_indexed shows —", async (reply) => {
      fakeBackend(() => [200, reply]);
      await (await openIndex())(URL_A);
      expect(await statValue("Files")).toBe("—");
    });
});
describe("F2 display: bad", () => {
  // New. Break: index.tsx:105-110 returns on a bad URL before `setResult(null)` (:114), so the old repo stays.
  it.each(["not-a-url", "https://gitlab.com/acme/widgets"])("invalid URL %s after a result clears it", async (bad) => {
    fakeBackend(() => [200, CACHED]);
    const analyse = await openIndex();
    await analyse(URL_A).then(() => statValue("Chunks"));
    await analyse(bad);
    expect(await screen.findByText(/valid public GitHub repository URL/)).toBeInTheDocument();
    expect(screen.queryByText("Chunks")).toBeNull();
  });
  // Guard (existing): break index.tsx:114 (drop `setResult(null)`) → the first repo's result stays.
  it.each([
    [500, "<html><h1>500 Internal Server Error</h1></html>", /temporarily unavailable/],
    [429, '{"error":"Rate limit exceeded: 10 per 1 minute"}', /Too many requests/],
  ])("failed /check (%i) shows the error with no stale result", async (status, body, shown) => {
    let n = 0;
    fakeBackend(() => (n++ === 0 ? [200, CACHED] : [status, body]));
    const analyse = await openIndex();
    await analyse(URL_A).then(() => statValue("Chunks"));
    await analyse("https://github.com/acme/widgets");
    expect(await screen.findByText(shown)).toBeInTheDocument();
    expect(screen.queryByText("Chunks")).toBeNull();
  });
});
