import { useEffect, useState, useMemo } from "react";
import { Loader2, AlertTriangle, AlertCircle, Info, FileCode2 } from "lucide-react";
import { api, type BugItem } from "@/lib/api";

const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

const severityStyles: Record<string, { label: string; chip: string; icon: typeof AlertTriangle }> = {
  high: {
    label: "High",
    chip: "border-severity-high/40 bg-severity-high/10 text-severity-high",
    icon: AlertTriangle,
  },
  medium: {
    label: "Medium",
    chip: "border-severity-medium/40 bg-severity-medium/10 text-severity-medium",
    icon: AlertCircle,
  },
  low: {
    label: "Low",
    chip: "border-severity-low/40 bg-severity-low/10 text-severity-low",
    icon: Info,
  },
};

function getStyle(sev: string) {
  return severityStyles[sev.toLowerCase()] ?? severityStyles.low;
}

export function BugReportTab({ repoName }: { repoName: string }) {
  const [bugs, setBugs] = useState<BugItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .bugs(repoName)
      .then((r) => {
        if (!cancelled) setBugs(r.bugs);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [repoName]);

  const sorted = useMemo(
    () =>
      bugs
        ? [...bugs].sort(
            (a, b) =>
              (severityOrder[a.severity.toLowerCase()] ?? 9) -
              (severityOrder[b.severity.toLowerCase()] ?? 9),
          )
        : [],
    [bugs],
  );

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    sorted.forEach((b) => {
      const k = b.severity.toLowerCase();
      if (k in c) c[k]++;
    });
    return c;
  }, [sorted]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Scanning for bugs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {error}
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center text-muted-foreground">
        No issues detected.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {(["high", "medium", "low"] as const).map((s) => {
          const st = severityStyles[s];
          const Icon = st.icon;
          return (
            <div
              key={s}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${st.chip}`}
            >
              <Icon className="h-4 w-4" />
              {counts[s]} {st.label}
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => {
              const st = getStyle(b.severity);
              const Icon = st.icon;
              return (
                <tr
                  key={i}
                  className="border-b border-border/60 align-top last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${st.chip}`}
                    >
                      <Icon className="h-3 w-3" /> {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-1.5 font-mono text-xs text-foreground/90">
                      <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        {b.file}
                        <span className="text-muted-foreground">:{b.line}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-foreground/90">{b.issue}</td>
                  <td className="px-4 py-4 text-muted-foreground">{b.suggestion}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
