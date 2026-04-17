import type { LogLine } from "../types";

export function parseLogLine(line: string): LogLine | null {
  // Epoch CLI format: LEVEL  TIMESTAMP +OFFSET rest...
  const logRegex = /^([A-Z]+)\s+([0-9-T:.]+)\s+([+][0-9ms]+)\s+(.*)$/;
  const match = line.match(logRegex);

  if (!match) return null;

  const [_, level, timestamp, offset, rest] = match;
  const metadata: Record<string, string> = {};

  // Extract key=value pairs
  const kvRegex = /([a-zA-Z0-9_-]+)=("[^"]*"|'[^']*'|[^ ]+)/g;
  let kvMatch;
  while ((kvMatch = kvRegex.exec(rest)) !== null) {
    let value = kvMatch[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[kvMatch[1]] = value;
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
  return line.message.includes("START_GENERATE");
}

export function isEndGenerate(line: LogLine): boolean {
  return line.message.includes("END_GENERATE");
}
