import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type DiagramResponse } from "@/lib/api";
import { MermaidDiagram } from "./MermaidDiagram";

export function ArchitectureTab({ repoName }: { repoName: string }) {
  const [data, setData] = useState<DiagramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .diagram(repoName)
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
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Generating architecture diagram…
      </div>
    );

  if (error)
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</div>
    );

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Summary</h3>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.summary}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <MermaidDiagram chart={data.mermaid} />
      </div>
    </div>
  );
}
