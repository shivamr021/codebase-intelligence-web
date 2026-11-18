// Retrieval citation markers such as `【4†L10-L20】` that the model copies into its answers.
const MARKER_RE = /【[^】]*】/g;

// Removes the markers only; the words around them stay exactly as sent.
export function stripMarkers(answer: string): string {
  return answer.replace(MARKER_RE, "");
}
