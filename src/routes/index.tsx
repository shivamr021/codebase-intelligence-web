import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Loader2,
  Github,
  ScanSearch,
  MessageSquareCode,
  Network,
  Bug,
  GitBranch,
  CheckCircle2,
  ArrowRight,
  FileCode2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  api,
  API_DOCS_URL,
  repoNameFromUrl,
  type IngestResponse,
} from "@/lib/api";

import { QATab } from "@/components/QATab";
import { BugReportTab } from "@/components/BugReportTab";
import { ArchitectureTab } from "@/components/ArchitectureTab";
import { GraphTab } from "@/components/GraphTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Codebase Intelligence — Understand any GitHub repo in seconds",
      },
      {
        name: "description",
        content:
          "AI-powered codebase analysis. Ask questions, visualize dependencies, surface bugs, and map architecture for any public GitHub repository — with citations.",
      },
      {
        property: "og:title",
        content: "Codebase Intelligence",
      },
      {
        property: "og:description",
        content:
          "AI-powered codebase analysis for any GitHub repo.",
      },
    ],
  }),

  component: Index,
});

const FEATURE_TAGS = [
  "Q&A Chat",
  "Dependency Graph",
  "Bug Reports",
  "Arch Diagram",
];

function Index() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [loadingLabel, setLoadingLabel] = useState(
    "Indexing repository"
  );

  const [error, setError] = useState<string | null>(
    null
  );

  const [result, setResult] =
    useState<IngestResponse | null>(null);

  const analyse = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const trimmed = url.trim();

    if (!trimmed || loading) return;

    if (trimmed.length > 300) {
      setError(
        "URL is too long. Please enter a valid GitHub repository URL."
      );
      return;
    }

    const GITHUB_RE =
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\/.*)?$/;

    if (!GITHUB_RE.test(trimmed)) {
      setError(
        "Please enter a valid public GitHub repository URL (https://github.com/owner/repo)."
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const repoName =
        repoNameFromUrl(trimmed);

      // STEP 1 — check existing repo
      setLoadingLabel(
        "Checking repository"
      );

      const check =
        await api.check(repoName);

      // already indexed → skip ingestion
      if (check.indexed) {
        setResult({
          status: "cached",
          repo_name: repoName,
          files_indexed: 0,
          chunks_stored: check.chunks,
          graph_ready: true,
          message: `Repository already indexed (${check.chunks} chunks found)`,
        });

        requestAnimationFrame(() => {
          document
            .getElementById("results")
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
        });

        return;
      }

      // STEP 2 — normal ingest
      setLoadingLabel(
        "Indexing repository"
      );

      const res =
        await api.ingest(trimmed);

      setResult(res);

      requestAnimationFrame(() => {
        document
          .getElementById("results")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      });

    } catch (err) {
      setError(
        (err as Error).message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">

          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 shadow-[0_0_20px_oklch(0.745_0.142_184/0.25)]">
              <ScanSearch className="h-4 w-4 text-primary" />
            </div>

            <span className="text-sm font-semibold tracking-tight">
              Codebase
              <span className="text-muted-foreground">
                .Intel
              </span>
            </span>
          </div>

          <nav className="flex items-center gap-5 text-xs font-medium text-muted-foreground">
            <a
              href="#features"
              className="transition-colors hover:text-foreground"
            >
              Features
            </a>

            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              API Docs
              <ArrowRight className="h-3 w-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 grid-bg" />

          <div
            className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "oklch(0.745 0.142 184 / 0.12)",
              filter: "blur(120px)",
            }}
          />

          <div className="absolute inset-0 bg-hero" />
        </div>

        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">

          {/* STATUS BADGE */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.05] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary/90 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>

            AI-powered static analysis · LLM-backed
          </div>

          {/* HEADLINE */}
          <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
            Understand any codebase
            <br />
            <span className="text-gradient">
              in seconds, not weeks.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            Paste a GitHub repo. We&apos;ll embed the code,
            map dependencies, surface bugs, and let you ask
            anything in plain English —
            <span className="text-foreground/90">
              {" "}
              with citations.
            </span>
          </p>

          {/* INPUT */}
          <form
            onSubmit={analyse}
            className="group relative mx-auto mt-10 w-full max-w-2xl"
          >
            <div
              className="absolute -inset-1 rounded-2xl opacity-30 blur transition duration-500 group-focus-within:opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, oklch(0.745 0.142 184), oklch(0.78 0.16 210))",
              }}
            />

            <div className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-[oklch(0.18_0.025_260/0.85)] p-2 shadow-elevated backdrop-blur-xl">

              <div className="pl-3 pr-1 text-muted-foreground">
                <Github className="h-5 w-5" />
              </div>

              <Input
                value={url}
                onChange={(e) =>
                  setUrl(e.target.value)
                }
                placeholder="https://github.com/tiangolo/fastapi"
                disabled={loading}
                className="h-12 flex-1 border-0 bg-transparent font-mono text-sm text-foreground shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 md:text-base"
              />

              <Button
                type="submit"
                disabled={loading || !url.trim()}
                className="h-11 gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground shadow-[0_0_24px_oklch(0.745_0.142_184/0.45)] transition-all hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analysing
                  </>
                ) : (
                  <>
                    <ScanSearch className="h-4 w-4" />
                    Analyse
                  </>
                )}
              </Button>
            </div>
          </form>

          {error && (
            <div className="mx-auto mt-5 max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-destructive-foreground">
              {error}
            </div>
          )}

          {loading && (
            <LoadingState
              label={loadingLabel}
            />
          )}
        </div>
      </section>

      {/* RESULTS */}
      {result && (
        <section
          id="results"
          className="relative mx-auto max-w-7xl px-6 pb-24"
        >
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-card/60 p-4 backdrop-blur">

            <div className="grid h-9 w-9 place-items-center rounded-lg border border-primary/25 bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="truncate font-mono text-sm font-medium">
                {result.repo_name}
              </div>

              <div className="truncate text-xs text-muted-foreground">
                {result.message}
              </div>
            </div>

            <Stat
              label="Files"
              value={result.files_indexed}
            />

            <Stat
              label="Chunks"
              value={result.chunks_stored}
            />

            <Stat
              label="Graph"
              value={
                result.graph_ready
                  ? "Ready"
                  : "—"
              }
            />
          </div>

          <Tabs
            defaultValue="qa"
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-card/60 backdrop-blur md:grid-cols-4">

              <TabsTrigger
                value="qa"
                className="gap-2"
              >
                <MessageSquareCode className="h-4 w-4" />
                Q&A Chat
              </TabsTrigger>

              <TabsTrigger
                value="graph"
                className="gap-2"
              >
                <Network className="h-4 w-4" />
                Dependency Graph
              </TabsTrigger>

              <TabsTrigger
                value="bugs"
                className="gap-2"
              >
                <Bug className="h-4 w-4" />
                Bug Report
              </TabsTrigger>

              <TabsTrigger
                value="arch"
                className="gap-2"
              >
                <GitBranch className="h-4 w-4" />
                Architecture
              </TabsTrigger>
            </TabsList>

            <div className="mt-6 rounded-2xl border border-white/10 bg-card/40 p-6 shadow-elevated backdrop-blur">

              <TabsContent
                value="qa"
                className="mt-0"
              >
                <QATab
                  repoName={result.repo_name}
                />
              </TabsContent>

              <TabsContent
                value="graph"
                className="mt-0"
              >
                <GraphTab
                  repoName={result.repo_name}
                />
              </TabsContent>

              <TabsContent
                value="bugs"
                className="mt-0"
              >
                <BugReportTab
                  repoName={result.repo_name}
                />
              </TabsContent>

              <TabsContent
                value="arch"
                className="mt-0"
              >
                <ArchitectureTab
                  repoName={result.repo_name}
                />
              </TabsContent>
            </div>
          </Tabs>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-muted/30 px-3 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>

      <div className="font-mono text-sm font-semibold">
        {value}
      </div>
    </div>
  );
}

const STEPS = [
  "Cloning repository",
  "Parsing source files",
  "Generating embeddings",
  "Building dependency graph",
  "Synthesising architecture",
];

function LoadingState({
  label,
}: {
  label: string;
}) {
  const isChecking =
    label.toLowerCase().startsWith("check");

  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-xl border border-white/10 bg-card/60 p-5 text-left shadow-elevated backdrop-blur">

      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />

        {isChecking
          ? "Checking if this repository is already indexed…"
          : `${label}… this may take a minute`}
      </div>

      {!isChecking && (
        <ul className="space-y-2 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className="flex items-center gap-2"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-primary"
                style={{
                  animation: `pulse 1.4s ease-in-out ${
                    i * 0.2
                  }s infinite`,
                }}
              />

              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}