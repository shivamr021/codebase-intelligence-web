export const API_BASE =
  import.meta.env.VITE_API_BASE_URL;

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

export interface CheckResponse {
  indexed: boolean;
  chunks: number;
}

export function repoNameFromUrl(url: string): string {
  return url
    .replace(/\/$/, "")
    .split("/")
    .pop()!
    .replace(/\.git$/, "");
}

// Sends every call to the backend; never requests `undefined/...`.
function request(path: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE) {
    return Promise.reject(
      new Error("VITE_API_BASE_URL is not set. Set it to the backend URL and rebuild.")
    );
  }
  return fetch(`${API_BASE}${path}`, init).catch(() => {
    throw new Error("Cannot reach the backend. Check that it is running and try again.");
  });
}

// FastAPI sends `detail` as a string, or as a list of `{ msg }` items on 422.
function detailMessage(body: string): string | null {
  try {
    const { detail } = JSON.parse(body);
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) => item?.msg)
        .filter((msg): msg is string => typeof msg === "string" && msg !== "");
      if (msgs.length) return msgs.join("; ");
    }
  } catch {
    // Not JSON (for example an HTML error page): fall back to the generic text.
  }
  return null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`API error ${res.status}:`, text || res.statusText);

    if (res.status === 429) {
      throw new Error("Too many requests. Please try again shortly.");
    }

    const detail = detailMessage(text);
    if (detail) {
      throw new Error(detail);
    }

    if (res.status === 404) {
      throw new Error("Not found. The requested resource is unavailable.");
    }

    if (res.status >= 500) {
      throw new Error(
        "The service is temporarily unavailable. Please try again."
      );
    }

    throw new Error(
      "Request failed. Please check your input and try again."
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  ingest: (github_url: string) =>
    request("/api/v1/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ github_url }),
    }).then(handle<IngestResponse>),

  ask: (repo_name: string, question: string) =>
    request("/api/v1/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_name, question }),
    }).then(handle<AskResponse>),

  bugs: (repo_name: string) =>
    request(
      `/api/v1/bugs?repo_name=${encodeURIComponent(repo_name)}`
    ).then(handle<BugsResponse>),

  graph: (repo_name: string) =>
    request(
      `/api/v1/graph?repo_name=${encodeURIComponent(repo_name)}`
    ).then(handle<GraphResponse>),

  diagram: (repo_name: string) =>
    request(
      `/api/v1/diagram?repo_name=${encodeURIComponent(repo_name)}`
    ).then(handle<DiagramResponse>),

  check: (repo_name: string) =>
    request(
      `/api/v1/check?repo_name=${encodeURIComponent(repo_name)}`
    ).then(handle<CheckResponse>),
};