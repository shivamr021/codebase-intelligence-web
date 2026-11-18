import DOMPurify from "dompurify";

// Mermaid output carries chart text an attacker can influence (file names,
// LLM-written labels). Keep only SVG markup: no scripts, no on* handlers, no
// foreignObject HTML, and no javascript: links.
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
