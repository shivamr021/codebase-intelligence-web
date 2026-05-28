import { useEffect, useState } from "react";
import { Loader2, Network, GitFork, RotateCw } from "lucide-react";
import { api, type GraphResponse } from "@/lib/api";

export function GraphTab({ repoName }: { repoName: string }) {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .graph(repoName)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [repoName]);

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Building dependency graph…
      </div>
    );

  if (error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</div>
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
