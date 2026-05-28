/**
 * MermaidDiagram.tsx
 *
 * Key fixes vs previous version:
 *   1. securityLevel: "loose" — "strict" sandboxes the SVG in an iframe,
 *      which strips all theme CSS variables and makes text invisible.
 *   2. theme: "base" with explicit themeVariables — the "dark" preset conflicts
 *      with our custom variables; "base" is a clean slate we fully control.
 *   3. SVG gets explicit CSS injected after render to guarantee text color —
 *      defence against any remaining DOMPurify stripping of style attrs.
 *   4. Unique re-init on each chart change via mermaid.initialize() call
 *      inside the effect, so config is always fresh.
 */

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import DOMPurify from "dompurify";

const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "loose" as const,   // CRITICAL: "strict" breaks text visibility
  theme: "base" as const,
  themeVariables: {
    // Backgrounds
    background: "#0f172a",
    mainBkg: "#1e293b",
    nodeBorder: "#22d3ee",
    clusterBkg: "#0f2233",
    clusterBorder: "#334155",
    // Text
    primaryTextColor: "#e2e8f0",
    nodeTextColor: "#e2e8f0",
    labelTextColor: "#e2e8f0",
    edgeLabelBackground: "#1e293b",
    titleColor: "#22d3ee",
    // Lines
    lineColor: "#7c3aed",
    primaryBorderColor: "#22d3ee",
    secondaryBorderColor: "#334155",
    // Node fills
    primaryColor: "#1e293b",
    secondaryColor: "#1e3a5f",
    tertiaryColor: "#0f172a",
    // Font
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "13px",
  },
};

// CSS injected into the rendered SVG to guarantee visibility
// (backup in case DOMPurify strips inline styles)
const SVG_OVERRIDE_CSS = `
  .node rect, .node circle, .node ellipse, .node polygon, .node path {
    fill: #1e293b !important;
    stroke: #22d3ee !important;
  }
  .node .label, .nodeLabel, text, tspan {
    fill: #e2e8f0 !important;
    color: #e2e8f0 !important;
  }
  .edgePath path {
    stroke: #7c3aed !important;
  }
  .edgeLabel {
    background-color: #1e293b !important;
    color: #e2e8f0 !important;
  }
  .cluster rect {
    fill: #0f2233 !important;
    stroke: #334155 !important;
  }
  .cluster text, .cluster .label {
    fill: #94a3b8 !important;
  }
  .label foreignObject {
    overflow: visible !important;
  }
`;

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderKey] = useState(() => Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!chart?.trim() || !containerRef.current) return;

    let cancelled = false;

    const render = async () => {
      try {
        setError(null);

        // Re-initialize every time so config is always applied
        mermaid.initialize(MERMAID_CONFIG);

        const id = `mermaid-${renderKey}-${Date.now()}`;
        const { svg } = await mermaid.render(id, chart.trim());

        if (cancelled || !containerRef.current) return;

        // Inject our override CSS into the SVG string before sanitizing
        const svgWithStyles = svg.replace(
          "</style>",
          `${SVG_OVERRIDE_CSS}</style>`
        ).replace(
          "<style>",
          `<style>`
        ) || `<svg><style>${SVG_OVERRIDE_CSS}</style>${svg.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>`;

        // Use loose DOMPurify config to keep style elements
        const clean = DOMPurify.sanitize(svgWithStyles, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["style"],
          ADD_ATTR: ["style", "class"],
          FORCE_BODY: false,
        });

        containerRef.current.innerHTML = clean;

        // Post-render: force text color on all text nodes as final guarantee
        containerRef.current.querySelectorAll("text, tspan").forEach((el) => {
          (el as HTMLElement).style.fill = "#e2e8f0";
          (el as HTMLElement).style.color = "#e2e8f0";
        });

      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to render diagram";
          setError(msg);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [chart, renderKey]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
        <p className="font-medium text-red-400">Diagram render error</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs opacity-80 text-slate-300">
          {error}
        </pre>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            View raw Mermaid source
          </summary>
          <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-300 border border-slate-700">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-auto rounded-lg border border-border/40 bg-[#0a1628]"
      style={{
        maxHeight: "75vh",
      }}
    >
      <div
        ref={containerRef}
        className="
        mermaid-wrapper
        flex
        justify-center
        items-start
        p-4
      "
      />
    </div>
  );
}
