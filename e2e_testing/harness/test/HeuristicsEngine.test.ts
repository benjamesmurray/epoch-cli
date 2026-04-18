import { describe, expect, it } from "bun:test";
import { HeuristicsEngine, LoopException } from "../src/HeuristicsEngine";

describe("HeuristicsEngine", () => {
  it("should detect infinite tool loops", () => {
    const engine = new HeuristicsEngine("test-run", 3);
    const line = '{"name": "pm_query", "arguments": {"query": "Test"}}';
    
    engine.processLine(line);
    engine.processLine(line);
    
    expect(() => engine.processLine(line)).toThrow(LoopException);
  });

  it("should not trigger on different tool calls", () => {
    const engine = new HeuristicsEngine("test-run", 3);
    
    engine.processLine('{"name": "pm_query", "arguments": {"query": "Test"}}');
    engine.processLine('{"name": "pm_query", "arguments": {"query": "Test"}}');
    engine.processLine('{"name": "pm_query", "arguments": {"query": "OtherTest"}}');
    
    // Should not throw
    expect(true).toBe(true);
  });

  it("should detect expected tool usage", () => {
    const engine = new HeuristicsEngine("test-run");
    engine.processLine("Agent executed tool sc_init");
    engine.processLine('{"name": "sc_todo_start", "arguments": {"id": "1.1"}}');
    
    expect(engine.detectSpecCliUsage(["sc_init", "sc_todo_start"])).toBe(true);
    expect(engine.detectSpecCliUsage(["sc_plan"])).toBe(false);
  });

  it("should detect pretty-printed tool invocations", () => {
    const engine = new HeuristicsEngine("test-run");
    engine.processLine('⚙ spec_sc_init {"mode":"one-shot","name":"eventbus"}');
    expect(engine.getUsedTools()).toContain("spec_sc_init");
  });

  it("should detect infinite tool loops with pretty-printed lines", () => {
    const engine = new HeuristicsEngine("test-run", 2);
    const line = '⚙ spec_sc_init {"mode":"one-shot"}';
    engine.processLine(line);
    expect(() => engine.processLine(line)).toThrow(LoopException);
  });

  it("should track json repairs", () => {
    const engine = new HeuristicsEngine("test-run");
    engine.processLine('{"metrics": {"json_repaired":true}}');
    expect(engine.jsonRepairs).toBe(1);
  });
});