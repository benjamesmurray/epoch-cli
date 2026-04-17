import { parseLogLine } from "./ParserUtils";
import type { LogLine } from "../types";

export async function* readLogs(filePath: string): AsyncGenerator<LogLine> {
  const file = Bun.file(filePath);
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let remaining = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = (remaining + chunk).split("\n");
    remaining = lines.pop() || "";

    for (const line of lines) {
      const parsed = parseLogLine(line);
      if (parsed) yield parsed;
    }
  }

  if (remaining) {
    const parsed = parseLogLine(remaining);
    if (parsed) yield parsed;
  }
}
