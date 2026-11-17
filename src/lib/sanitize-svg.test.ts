import { describe, expect, it } from "vitest";

// Dynamic import: sanitize-svg.ts is new in F4 and must not break api/component test files.
async function sanitize(svg: string): Promise<DocumentFragment> {
  const { sanitizeSvg } = await import("./sanitize-svg");
  const t = document.createElement("template"); // inert: nothing in it runs or loads
  t.innerHTML = sanitizeSvg(svg);
  return t.content;
}
const texts = (f: DocumentFragment) => [...f.querySelectorAll("svg text")].map((e) => e.textContent);
const attrs = (f: DocumentFragment) => [...f.querySelectorAll("*")].flatMap((e) => [...e.attributes]);

describe("F4 sanitizeSvg", () => {
  // Break: strip-all, or an HTML-only profile that drops <svg>/<text>.
  it.each([
    ['<svg xmlns="http://www.w3.org/2000/svg"><g class="node"><text>main.py</text></g></svg>', ["main.py"]],
    ['<svg><g class="cluster"><text><tspan>src/lib/api.ts</tspan></text></g><g class="node"><text>cli.py</text></g></svg>', ["src/lib/api.ts", "cli.py"]],
  ])("middle: keeps label text %#", async (svg, want) => {
    expect(texts(await sanitize(svg))).toEqual(want);
  });

  // Break: pass-through keeps a real <b>; strip-all loses "x".
  // HTML parsing lifts <b> out of <svg>, so the text is checked on the whole output.
  it.each([
    ["<svg><g><text><b>x</b> &amp; y</text></g></svg>"],
    ['<svg><g class="edgeLabel"><text>see <b>x</b> &amp; y</text></g></svg>'],
  ])("edge: label markup <b>x</b> & y stays text only %#", async (svg) => {
    const f = await sanitize(svg);
    expect(f.querySelectorAll("b")).toHaveLength(0);
    expect(f.textContent).toContain("x & y");
  });

  // Break: pass-through keeps the payload; every row also needs its benign label, so strip-all fails too.
  it.each([
    ["script + onload", '<svg onload="alert(1)"><script>alert(2)</script><g><text>A</text></g></svg>', ["A"]],
    ["script + on* handlers", '<svg><g onclick="alert(1)"><text onmouseover="alert(2)">B</text></g><script href="x.js"></script></svg>', ["B"]],
    ["click href javascript:", '<svg><a xlink:href="javascript:alert(1)"><text>A</text></a></svg>', ["A"]],
    ["mixed-case javascript:", '<svg><a href=" JaVaScript:alert(1)"><text>B</text></a></svg>', ["B"]],
    ["foreignObject img onerror", "<svg><foreignObject><img src=x onerror=alert(1)></foreignObject><text>A</text></svg>", ["A"]],
    ["foreignObject div img", '<svg><g><foreignObject width="100" height="20"><div><img src="x" onerror="alert(1)">main.py</div></foreignObject></g><text>B</text></svg>', ["B"]],
  ])("bad: %s leaves no script, img, on* or javascript:", async (_route, svg, want) => {
    const f = await sanitize(svg);
    expect(f.querySelectorAll("script, img")).toHaveLength(0);
    expect(attrs(f).map((a) => a.name).filter((n) => /^on/i.test(n))).toEqual([]);
    expect(attrs(f).filter((a) => /^\s*javascript:/i.test(a.value)).map((a) => a.name)).toEqual([]);
    expect(texts(f)).toEqual(want);
  });
});
