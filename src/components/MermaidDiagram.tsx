import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "transparent",
    primaryColor: "#1f2937",
    primaryTextColor: "#e5e7eb",
    primaryBorderColor: "#22d3ee",
    lineColor: "#7c3aed",
    secondaryColor: "#312e81",
    tertiaryColor: "#0f172a",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  securityLevel: "strict",
});

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    setError(null);
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to render diagram");
      });
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
        <p className="font-medium">Diagram render error</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs opacity-80">{error}</pre>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">View source</summary>
          <pre className="mt-2 overflow-auto rounded bg-background/40 p-2 font-mono text-xs">{chart}</pre>
        </details>
      </div>
    );
  }

  return <div ref={ref} className="flex w-full justify-center overflow-auto [&_svg]:max-w-full" />;
}
