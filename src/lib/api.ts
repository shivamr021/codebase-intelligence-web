export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "https://codebase-intelligence-system.up.railway.app";
export const API_DOCS_URL = `${API_BASE}/docs`;

export interface IngestResponse {
  status: string;
  repo_name: string;
  files_indexed: number;
  chunks_stored: number;
  graph_ready: boolean;
  message: string;
}

export interface AskResponse {
  status: string;
  repo_name: string;
  question: string;
  answer: string;
  chunks_used: number;
}

export interface BugItem {
  file: string;
  line: number;
  severity: string;
  issue: string;
  suggestion: string;
}

export interface BugsResponse {
  status: string;
  repo_name: string;
  bugs: BugItem[];
  total: number;
}

export interface GraphResponse {
  status: string;
  repo_name: string;
  html: string;
  stats: Record<string, unknown>;
}

export interface DiagramResponse {
  status: string;
  repo_name: string;
  summary: string;
  mermaid: string;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Log raw details for debugging without leaking to UI
    res
      .text()
      .catch(() => "")
      .then((text) => {
        console.error(`API error ${res.status}:`, text || res.statusText);
      });
    if (res.status === 429) throw new Error("Too many requests. Please try again shortly.");
    if (res.status === 404) throw new Error("Not found. The requested resource is unavailable.");
    if (res.status >= 500) throw new Error("The service is temporarily unavailable. Please try again.");
    throw new Error("Request failed. Please check your input and try again.");
  }
  return res.json() as Promise<T>;
}

export const api = {
  ingest: (github_url: string) =>
    fetch(`${API_BASE}/api/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ github_url }),
    }).then(handle<IngestResponse>),

  ask: (repo_name: string, question: string) =>
    fetch(`${API_BASE}/api/v1/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_name, question }),
    }).then(handle<AskResponse>),

  bugs: (repo_name: string) =>
    fetch(`${API_BASE}/api/v1/bugs?repo_name=${encodeURIComponent(repo_name)}`).then(handle<BugsResponse>),

  graph: (repo_name: string) =>
    fetch(`${API_BASE}/api/v1/graph?repo_name=${encodeURIComponent(repo_name)}`).then(handle<GraphResponse>),

  diagram: (repo_name: string) =>
    fetch(`${API_BASE}/api/v1/diagram?repo_name=${encodeURIComponent(repo_name)}`).then(handle<DiagramResponse>),
};
