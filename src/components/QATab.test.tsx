import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QATab } from "./QATab";

// Seam B: the real QATab; fetch faked at /api/v1/ask with the full AskResponse (api.ts:15-21).
async function ask(answer: string) {
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (!new URL(String(input), "http://x.invalid").pathname.endsWith("/api/v1/ask")) return new Response("", { status: 404 });
    const { repo_name, question } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ status: "success", repo_name, question, answer, chunks_used: 3 }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const view = render(<QATab repoName="octocat--hello" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Where is it?" } });
  fireEvent.click(screen.getByRole("button", { name: /ask/i }));
  await screen.findByText(/3 chunks used/);
  return view.container;
}

describe("F5 markdown answers: middle", () => {
  // Break: today's plain-text render (QATab.tsx:88) shows the ** and backticks, with no strong or code.
  it.each([
    ["Use **bounded retries** and call `fetch_repo()` once.", "bounded retries", "fetch_repo()"],
    ["**Note:** set `GROQ_MAX_TOKENS` first.", "Note:", "GROQ_MAX_TOKENS"],
  ])("%j renders strong and code", async (answer, bold, code) => {
    const c = await ask(answer);
    expect({ strong: c.querySelector("strong")?.textContent, code: c.querySelector("code")?.textContent, rawMarks: /\*\*|`/.test(c.textContent ?? "") })
      .toEqual({ strong: bold, code, rawMarks: false });
  });

  // Break: no fenced-block support, so the ``` fence shows as text and no `pre` exists.
  it.each([
    ['Set it:\n```python\nEMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"\n```\nDone.', 'EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"'],
    ["```ts\nexport const API_BASE = import.meta.env.VITE_API_BASE_URL;\n```", "export const API_BASE = import.meta.env.VITE_API_BASE_URL;"],
  ])("fenced block %# renders as pre", async (answer, code) => {
    const c = await ask(answer);
    expect({ pre: c.querySelector("pre")?.textContent?.trim(), fence: (c.textContent ?? "").includes("```") }).toEqual({ pre: code, fence: false });
  });
});

describe("F5 markdown answers: edges", () => {
  // Break: no marker strip, so 【4†L10-L20】 shows; a strip that eats the words around it fails the literal.
  it.each([
    ["The embedding model is set in config.py【4†L10-L20】.", "The embedding model is set in config.py."],
    ["Chunks are capped at 1000【12†L3-L9】 per repo【2†L1-L4】.", "Chunks are capped at 1000 per repo."],
  ])("marker in %j is removed", async (answer, want) => {
    await ask(answer);
    expect(screen.getByText(/^(The embedding|Chunks are)/).textContent).toBe(want);
  });

  // Guard (existing): break the citation regex (QATab.tsx:16). Chip row only (QATab.tsx:90-101):
  // after F5 the same path also renders as content `code`, which is excluded here.
  it.each([
    ["Set it in `core/config.py`, read it in `src/lib/api.ts`, call `fetch_repo()`.", ["core/config.py", "src/lib/api.ts"]],
    ["See `app/main.py`, then `app/main.py` again and `README.md`.", ["app/main.py", "README.md"]],
  ])("citation chips for %j", async (answer, chips) => {
    await ask(answer);
    const first = screen.queryAllByText(chips[0]).find((el) => !el.closest("code"));
    const row = first?.parentElement ? Array.from(first.parentElement.children, (el) => el.textContent) : [];
    expect(row).toEqual(chips);
  });

  // Guard (existing, passes on QATab.tsx:88): break :88 to `{m.content.toUpperCase()}`; a renderer
  // that drops or rewrites plain words fails the exact text.
  it.each([["The retriever returns the top 5 chunks."], ["Ingest first, then ask: the index has 16 chunks (2 files)."]])("plain text %j stays unchanged", async (answer) => {
    await ask(answer);
    const found = screen.queryByText(new RegExp(`^${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
    expect(found?.textContent).toBe(answer);
  });
});

describe("F5 markdown answers: bad", () => {
  // Guard (existing; React escapes text at QATab.tsx:88): break :87-88 to dangerouslySetInnerHTML. Dropping raw HTML also fails.
  it.each([
    ["Inline <script>alert(1)</script> found.", "<script>alert(1)</script>"],
    ["Before\n<script>fetch('//evil.test')</script>\nAfter", "<script>fetch('//evil.test')</script>"],
  ])("%j shows the script as text, no script element", async (answer, payload) => {
    const c = await ask(answer);
    expect({ scripts: c.querySelectorAll("script").length, shown: (c.textContent ?? "").includes(payload) }).toEqual({ scripts: 0, shown: true });
  });

  // Guard (existing): break :87-88 to inject `<a href="$2">` → javascript: href. Safe-link control is red today; strip-all fails it.
  it.each([
    ["Click [x](javascript:alert(1)) or [docs](https://example.com).", "https://example.com"],
    ["[y](JavaScript:alert(document.domain)) then [z](https://example.com/a)", "https://example.com/a"],
  ])("%j leaves no javascript: link and keeps the safe one", async (answer, safe) => {
    const c = await ask(answer);
    const hrefs = Array.from(c.querySelectorAll("a"), (a) => (a.getAttribute("href") ?? "").trim());
    expect({ unsafe: hrefs.filter((h) => /^javascript:/i.test(h)), all: hrefs }).toEqual({ unsafe: [], all: [safe] });
  });
});
