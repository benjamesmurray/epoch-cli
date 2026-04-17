import { describe, test, expect } from "bun:test";
import { parseLogLine, isStartGenerate, isEndGenerate } from "../src/analyzer/ParserUtils";
import { TurnAggregator } from "../src/analyzer/TurnAggregator";

describe("ParserUtils", () => {
  test("should parse a valid log line", () => {
    const line = "INFO  2026-04-16T21:19:21 +0ms service=session.prompt step=0 sessionID=ses_123 loop";
    const parsed = parseLogLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.level).toBe("INFO");
    expect(parsed?.timestamp).toBe("2026-04-16T21:19:21");
    expect(parsed?.metadata?.sessionID).toBe("ses_123");
  });

  test("should handle missing metadata", () => {
    const line = "DEBUG 2026-04-16T21:19:22 +2ms message without metadata";
    const parsed = parseLogLine(line);
    expect(parsed?.metadata).toEqual({});
  });

  test("should correctly identify START_GENERATE", () => {
    const line = "DEBUG 2026-04-16T21:19:23 +2ms event=START_GENERATE sessionID=123";
    const parsed = parseLogLine(line)!;
    expect(isStartGenerate(parsed)).toBe(true);
  });
});

describe("TurnAggregator", () => {
  test("should group lines into turns", () => {
    const aggregator = new TurnAggregator();
    const l1 = parseLogLine("DEBUG 2026-04-16T21:19:23 +2ms event=START_GENERATE sessionID=123")!;
    const l2 = parseLogLine("INFO  2026-04-16T21:19:24 +0ms processing turn content")!;
    const l3 = parseLogLine("DEBUG 2026-04-16T21:19:25 +1ms event=END_GENERATE")!;

    expect(aggregator.processLine(l1)).toBeNull(); // Still gathering
    expect(aggregator.processLine(l2)).toBeNull(); // Still gathering
    const turn = aggregator.processLine(l3);
    
    expect(turn).not.toBeNull();
    expect(turn?.id).toBe(1);
    expect(turn?.lines.length).toBe(3);
    expect(turn?.endTime).toBe("2026-04-16T21:19:25");
  });
});
