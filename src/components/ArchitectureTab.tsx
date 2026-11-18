/**
 * ArchitectureTab.tsx
 *
 * Changes vs previous:
 *   1. Strips the leading "SUMMARY:" prefix from the summary text —
 *      the LLM includes it literally, frontend should not show it.
 *   2. Diagram container is taller and has a dark background matching
 *      what MermaidDiagram renders onto.
 *   3. Added a "copy mermaid source" button for devs who want the raw syntax.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type DiagramResponse } from "@/lib/api";
import { MermaidDiagram } from "./MermaidDiagram";

function cleanSummary(raw: string): string {
  // Strip leading "SUMMARY:" prefix the LLM sometimes includes literally
  return raw.replace(/^SUMMARY:\s*/i, "").trim();
}

export function ArchitectureTab({ repoName }: { repoName: string }) {
  const [copied, setCopied]   = useState(false);

  // Cached per repo for the session: the LLM diagram runs once, and failures are retried only by hand.
  const query = useQuery({
    queryKey: ["diagram", repoName],
    queryFn: () => api.diagram(repoName),
    staleTime: Infinity,
    retry: false,
  });
  const data: DiagramResponse | undefined = query.data;
  const loading = query.isPending;
  const error = query.error?.message ?? null;

  const handleCopy = () => {
    if (!data?.mermaid) return;
    navigator.clipboard.writeText(data.mermaid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Generating architecture diagram…
      </div>
    );

  if (error)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-400">
        {error}
        <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
          Retry
        </Button>
      </div>
    );

  if (!data) return null;

  const summary = cleanSummary(data.summary);

  return (
    <div className="space-y-5">
      {/* Summary card */}
      {summary && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
            Overview
          </h3>
          <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
        </div>
      )}

      {/* Diagram card */}
      <div className="rounded-lg border border-border bg-[#0a1628] overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
            Architecture diagram
          </h3>
          <button
            onClick={handleCopy}
            title="Copy Mermaid source"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied
              ? <><Check className="h-3.5 w-3.5 text-green-400" /> Copied</>
              : <><Copy className="h-3.5 w-3.5" /> Copy source</>
            }
          </button>
        </div>

        {/* Diagram — full width, enough height for complex repos */}
        <div className="p-6" style={{ minHeight: "480px" }}>
          <MermaidDiagram chart={data.mermaid} />
        </div>
      </div>
    </div>
  );
}
