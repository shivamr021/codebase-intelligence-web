import { useContext, useState } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import { Loader2, Network, GitFork, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type GraphResponse } from "@/lib/api";

export function GraphTab({ repoName }: { repoName: string }) {
  // The app's QueryClientProvider when present; a private client keeps the tab usable when mounted alone.
  const shared = useContext(QueryClientContext);
  const [own] = useState(() => (shared ? undefined : new QueryClient()));

  // Cached per repo for the session; failures are retried only by hand.
  const query = useQuery(
    {
      queryKey: ["graph", repoName],
      queryFn: () => api.graph(repoName),
      staleTime: Infinity,
      retry: false,
    },
    shared ?? own,
  );
  const data: GraphResponse | undefined = query.data;
  const loading = query.isPending;
  const error = query.error?.message ?? null;

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Building dependency graph…
      </div>
    );

  if (error)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {error}
        <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          Retry
        </Button>
      </div>
    );

  if (!data) return null;

  const stats = data.stats ?? {};
  const nodes = (stats as any).nodes;
  const edges = (stats as any).edges;
  const cycles = (stats as any).cycles;
  const mostDep = (stats as any).most_depended_on;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Network className="h-4 w-4" />} label="Nodes" value={nodes} />
        <StatCard icon={<GitFork className="h-4 w-4" />} label="Edges" value={edges} />
        <StatCard icon={<RotateCw className="h-4 w-4" />} label="Cycles" value={Array.isArray(cycles) ? cycles.length : cycles} />
        <StatCard
          icon={<Network className="h-4 w-4" />}
          label="Most depended on"
          value={
            Array.isArray(mostDep) && mostDep.length
              ? typeof mostDep[0] === "string"
                ? mostDep[0]
                : mostDep[0]?.file
                  ? `${mostDep[0].file} (${mostDep[0].imported_by ?? 0})`
                  : (mostDep[0]?.[0] ?? "—")
              : "—"
          }
          mono
        />
      </div>

      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        style={{ height: "max(500px, calc(100vh - 320px))" }}
      >
        <iframe
          title="Dependency graph"
          srcDoc={injectFullSize(data.html)}
          className="h-full w-full border-0 bg-white"
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}

function injectFullSize(html: string): string {
  // CSP restricts the iframe to inline/self resources only — blocks external
  // network calls (connect-src 'none') so a compromised backend cannot exfiltrate
  // data or load remote payloads, while still allowing vis.js inline scripts.
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';">`;
  const css = `<style>
    html, body { margin:0; padding:0; height:100%; width:100%; background:#0b1220; overflow:hidden; }
    #mynetwork, .card, .vis-network, div[id^="mynetwork"] {
      width: 100vw !important;
      height: 100vh !important;
      border: 0 !important;
      background: transparent !important;
    }
    .card { box-shadow:none !important; }
  </style>`;
  const head = `${csp}${css}`;
  if (html.includes("</head>")) return html.replace("</head>", `${head}</head>`);
  if (html.includes("<head>")) return html.replace("<head>", `<head>${head}`);
  return head + html;
}

function StatCard({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className={`mt-2 truncate text-2xl font-semibold ${mono ? "font-mono text-base" : ""}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
