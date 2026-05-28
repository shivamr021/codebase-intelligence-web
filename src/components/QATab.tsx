import { useState } from "react";
import { Loader2, SendHorizontal, FileCode2, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  chunks?: number;
  citations?: string[];
}

// Extract `file/path.ext` style citations from answer text
function extractCitations(answer: string): string[] {
  const matches = answer.match(/`([^`\n]+\.[a-zA-Z0-9]{1,8})`/g) ?? [];
  const set = new Set(matches.map((m) => m.replace(/`/g, "")));
  return Array.from(set);
}

export function QATab({ repoName }: { repoName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await api.ask(repoName, q);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.answer,
          chunks: res.chunks_used,
          citations: extractCitations(res.answer),
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[600px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-full border border-border bg-card p-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Ask anything about the codebase</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Try: "Where is authentication handled?" or "How does the routing work?"
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="flex gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                m.role === "user"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </div>
            <div className="flex-1 space-y-2 overflow-hidden">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {m.role === "user" ? "You" : "Assistant"}
                {m.chunks !== undefined && (
                  <span className="ml-2 text-muted-foreground/70">· {m.chunks} chunks used</span>
                )}
              </div>
              <div className="prose prose-invert max-w-none whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                {m.content}
              </div>
              {m.citations && m.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {m.citations.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground"
                    >
                      <FileCode2 className="h-3 w-3 text-primary" />
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Searching codebase…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2 border-t border-border pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the code…"
          disabled={loading}
          className="flex-1 bg-muted/40"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          <SendHorizontal className="h-4 w-4" />
          Ask
        </Button>
      </form>
    </div>
  );
}
