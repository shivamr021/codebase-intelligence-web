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

import { useEffect, useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { api, type DiagramResponse } from "@/lib/api";
import { MermaidDiagram } from "./MermaidDiagram";

function cleanSummary(raw: string): string {
  // Strip leading "SUMMARY:" prefix the LLM sometimes includes literally
  return raw.replace(/^SUMMARY:\s*/i, "").trim();
}

export function ArchitectureTab({ repoName }: { repoName: string }) {
  const [data, setData]       = useState<DiagramResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .diagram(repoName)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [repoName]);

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
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-400">
        {error}
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
            Dependency Graph
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
