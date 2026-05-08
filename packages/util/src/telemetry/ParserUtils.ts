import type { LogLine } from "./types";

export function parseLogLine(line: string): LogLine | null {
  // Epoch CLI format: LEVEL  TIMESTAMP +OFFSET rest...
  const logRegex = /^([A-Z]+)\s+([0-9-T:.]+)\s+([+][0-9ms]+)\s+(.*)$/;
  const match = line.match(logRegex);

  if (!match) return null;

  const [_, level, timestamp, offset, rest] = match;
  const metadata: Record<string, string> = {};

  // Extract key=value pairs
  // Enhanced to handle JSON objects and quoted strings with spaces inside them
  // We use a more careful approach to avoid gobbling up multiple KV pairs
  const kvRegex = /([a-zA-Z0-9_-]+)=({.*?}|\[.*?\]|"[^"]*"|'[^']*'|[^ ]+)/g;
  
  let kvMatch;
  while ((kvMatch = kvRegex.exec(rest)) !== null) {
    let key = kvMatch[1];
    let value = kvMatch[2].trim();
    
    // Clean up quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  // Fallback for contextLimit if it's in the message but not caught by regex
  if (!metadata.contextLimit && rest.includes("contextLimit=")) {
    const limitMatch = rest.match(/contextLimit=([0-9]+)/);
    if (limitMatch) metadata.contextLimit = limitMatch[1];
  }

  return {
    timestamp,
    level,
    module: metadata.service || "unknown",
    message: rest,
    metadata,
    raw: line,
  };
}

export function isStartGenerate(line: LogLine): boolean {
  return line.metadata?.event === "START_GENERATE" || line.message.includes("event=START_GENERATE");
}

export function isEndGenerate(line: LogLine): boolean {
  return line.metadata?.event === "END_GENERATE" || line.message.includes("event=END_GENERATE");
}

export function isContextLimitReached(line: LogLine): boolean {
  return line.message.includes("Context limit reached");
}

export function extractMetrics(line: LogLine): any {
  // 1. Try metadata field
  if (line.metadata?.metrics) {
    try {
      return JSON.parse(line.metadata.metrics);
    } catch (e) {}
  }
  
  // 2. Try parsing message as JSON (if it looks like the whole event was stringified)
  if (line.message.startsWith("{") && line.message.endsWith("}")) {
    try {
      const parsed = JSON.parse(line.message);
      if (parsed.metrics) return parsed.metrics;
    } catch (e) {}
  }

  // 3. Last ditch: grep from message
  if (line.message.includes("metrics=")) {
    const metricsMatch = line.message.match(/metrics=({.*?})/);
    if (metricsMatch) {
      try {
        return JSON.parse(metricsMatch[1]);
      } catch (e) {}
    }
  }

  return null;
}

export function getSemanticToolName(tool: string, input: any): string {
  if (tool === "mcpx" && input) {
    const server = input.server;
    const mcpxTool = input.tool;
    if (server && mcpxTool) {
      return `mcpx [${server}.${mcpxTool}]`;
    }
  }

  if (tool === "bash" && typeof input?.command === "string") {
    const cmd = input.command;
    if (cmd.includes("spec sc_")) {
      const match = cmd.match(/spec (sc_[a-z_]+)/);
      if (match) return match[1];
    }
    if (cmd.includes("map pm_")) {
      const match = cmd.match(/map (pm_[a-z_]+)/);
      if (match) return match[1];
    }
    if (cmd.includes("gt_exec")) return "gt_exec";
  }
  return tool;
}
