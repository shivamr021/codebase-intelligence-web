import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchitectureTab } from "./ArchitectureTab";
import { BugReportTab } from "./BugReportTab";
import { GraphTab } from "./GraphTab";
import { QATab } from "./QATab";

// Seam A: the app's own QueryClient (router.tsx:6), the real Radix Tabs (unmounts hidden
// panels, index.tsx:535-569), React 19 StrictMode, and fetch faked at the network edge.
const BODY: Record<string, (repo: string) => unknown> = {
  "/api/v1/bugs": (repo) => ({ status: "success", repo_name: repo, total: 1, bugs: [
    { file: "app/main.py", line: 12, severity: "high", issue: `Unchecked input in ${repo}`, suggestion: "Validate it" }] }),
  "/api/v1/graph": (repo) => ({ status: "success", repo_name: repo, html: "<html><head></head><body>g</body></html>",
    stats: { nodes: 7, edges: 9, cycles: [], most_depended_on: [["core/config.py", 4]] } }),
  "/api/v1/diagram": (repo) => ({ status: "success", repo_name: repo, summary: `SUMMARY: Overview of ${repo}`, mermaid: "" }),
};
let hits: string[] = []; // "<path> <repo>" per request the fake server received
let failing = false; // true: every request answers 500 with a non-JSON body

beforeEach(() => {
  [hits, failing] = [[], false];
  vi.useFakeTimers();
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input), "http://x.invalid");
    const path = Object.keys(BODY).find((p) => url.pathname.endsWith(p));
    const repo = url.searchParams.get("repo_name") ?? "";
    hits.push(`${path} ${repo}`);
    if (failing || !path) return new Response("Internal Server Error", { status: 500 });
    return new Response(JSON.stringify(BODY[path](repo)), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => vi.useRealTimers());

const count = (path: string, repo = "octocat--alpha") => hits.filter((h) => h === `${path} ${repo}`).length;
// Advance past react-query's default retry delays (1s + 2s + 4s) so a retry loop shows in the count.
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
const open = async (tab: string) => { fireEvent.mouseDown(screen.getByRole("tab", { name: tab })); await settle(); };
const appClient = async () =>
  ((await import("@/router")).getRouter().options.context as { queryClient: QueryClient }).queryClient;

// Same values, labels and order as index.tsx:495-569.
const PANELS = [["qa", "Q&A Chat", QATab], ["graph", "Dependency Graph", GraphTab], ["bugs", "Bug Report", BugReportTab], ["arch", "Architecture", ArchitectureTab]] as const;
const Page = ({ client, repo }: { client: QueryClient; repo: string }) => (
  <StrictMode><QueryClientProvider client={client}><Tabs defaultValue="qa">
    <TabsList>{PANELS.map(([v, label]) => <TabsTrigger key={v} value={v}>{label}</TabsTrigger>)}</TabsList>
    {PANELS.map(([v, , Tab]) => <TabsContent key={v} value={v}><Tab repoName={repo} /></TabsContent>)}
  </Tabs></QueryClientProvider></StrictMode>
);
const TABS = [["Bug Report", "/api/v1/bugs", "Unchecked input in octocat--alpha"], ["Dependency Graph", "/api/v1/graph", "core/config.py"],
  ["Architecture", "/api/v1/diagram", "Overview of octocat--alpha"]] as const;

describe("F7 fetch once: middle", () => {
  // Break: the useEffect fetch (BugReportTab.tsx:34-50, GraphTab.tsx:10-22, ArchitectureTab.tsx:28-38)
  // runs twice under StrictMode, so opening a tab sends 2.
  it.each(TABS)("opening %s sends 1 request and shows its data", async (tab, path, text) => {
    render(<Page client={await appClient()} repo="octocat--alpha" />);
    await open(tab);
    expect({ requests: count(path), shown: screen.queryByText(text) !== null }).toEqual({ requests: 1, shown: true });
  });
});

describe("F7 fetch once: edges", () => {
  // Break: Radix unmounts the hidden panel, so the remount fetches again; a staleTime of 0
  // (the `new QueryClient()` default) also refetches on remount.
  it.each(TABS)("%s away and back totals 1 request and shows its data again", async (tab, path, text) => {
    render(<Page client={await appClient()} repo="octocat--alpha" />);
    await open(tab);
    await open("Q&A Chat");
    await open(tab);
    expect({ requests: count(path), shown: screen.queryByText(text) !== null }).toEqual({ requests: 1, shown: true });
  });

  // Break: deps `[repoName]` (BugReportTab.tsx:50) refetch A on return; a query key without the
  // repo shows A's rows for B and sends 0 for B.
  it("repo switch A→B→A sends 1 per repo and shows each repo's rows", async () => {
    const client = await appClient();
    const { rerender } = render(<Page client={client} repo="octocat--alpha" />);
    await open("Bug Report");
    rerender(<Page client={client} repo="octocat--beta" />);
    await settle();
    const betaShown = screen.queryByText("Unchecked input in octocat--beta") !== null;
    rerender(<Page client={client} repo="octocat--alpha" />);
    await settle();
    const alphaShown = screen.queryByText("Unchecked input in octocat--alpha") !== null;
    expect({ alpha: count("/api/v1/bugs"), beta: count("/api/v1/bugs", "octocat--beta"), all: hits.length, betaShown, alphaShown })
      .toEqual({ alpha: 1, beta: 1, all: 2, betaShown: true, alphaShown: true });
  });
});

describe("F7 fetch once: bad", () => {
  // Break: the default `retry: 3` loop (router.tsx:6) sends 4, StrictMode sends 2, the error is
  // hidden, or no Retry exists (none today); a Retry that refetches twice or loops sends more than 2.
  it("failed bugs request shows the error once; Retry sends exactly 1 more", async () => {
    failing = true;
    render(<Page client={await appClient()} repo="octocat--alpha" />);
    await open("Bug Report");
    const retry = () => screen.queryByRole("button", { name: /retry/i });
    const state = () => ({ requests: count("/api/v1/bugs"), error: screen.queryByText(/temporarily unavailable/) !== null, retry: retry() !== null });
    expect(state()).toEqual({ requests: 1, error: true, retry: true });
    fireEvent.click(retry()!);
    await settle();
    expect(state()).toEqual({ requests: 2, error: true, retry: true });
  });
});
