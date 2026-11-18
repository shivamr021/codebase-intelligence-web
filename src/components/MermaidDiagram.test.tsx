import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "./MermaidDiagram";

// mermaid cannot lay out in jsdom: fake it at its import. The fake always
// returns a real SVG, so any render of an empty chart would show up in the DOM.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><style></style><g class="node"><text>main.py</text></g></svg>',
    })),
  },
}));

describe("F4 MermaidDiagram", () => {
  // Guard (existing): break the empty-chart check at MermaidDiagram.tsx:86 to render anyway.
  it.each([[""], ["   \n  "]])("empty chart %j renders nothing", async (chart) => {
    const { container } = render(<MermaidDiagram chart={chart} />);
    await act(async () => {}); // let the async render effect settle
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("");
  });
});
