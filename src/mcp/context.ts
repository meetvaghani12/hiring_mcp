/** Per-request context handed to every MCP tool handler. */
export interface ToolContext {
  candidateId: string;
}

/** Wrap a plain object as an MCP text-content tool result (JSON string). */
export function jsonResult(obj: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(obj) }],
  };
}

/** Wrap a human-readable error as an MCP error result. */
export function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
