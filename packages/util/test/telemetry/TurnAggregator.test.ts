import { describe, it, expect } from "bun:test";
import { TurnAggregator } from "../../src/telemetry/TurnAggregator";

describe("TurnAggregator", () => {
  it("aggregates a simple turn from JSON events", () => {
    const aggregator = new TurnAggregator();
    
    // Start Turn
    const turn1 = aggregator.processJSON({
      timestamp: 1000,
      event: "START_GENERATE",
      phase: "Phase 1",
      activeAgent: "plan",
      contextLimit: 16000
    });
    expect(turn1).toBeNull(); // Still in progress

    // End Turn
    const turn2 = aggregator.processJSON({
      timestamp: 2000,
      event: "END_GENERATE",
      metrics: {
        promptTokens: 100,
        completionTokens: 50,
        tps: 50,
        ttftMs: 200
      }
    });

    expect(turn2).not.toBeNull();
    expect(turn2?.id).toBe(1);
    expect(turn2?.phase).toBe("Phase 1");
    expect(turn2?.activeAgent).toBe("plan");
    expect(turn2?.promptTokens).toBe(100);
    expect(turn2?.completionTokens).toBe(50);
    expect(turn2?.totalTokens).toBe(150);
    expect(turn2?.contextLimit).toBe(16000);
    expect(turn2?.contextFullness).toBe(150 / 16000);
  });

  it("handles multiple sequential turns", () => {
    const aggregator = new TurnAggregator();
    
    // Turn 1
    aggregator.processJSON({ event: "START_GENERATE" });
    const res1 = aggregator.processJSON({ event: "END_GENERATE", metrics: { promptTokens: 1000 } });
    expect(res1?.id).toBe(1);
    expect(res1?.totalTokens).toBe(1000);

    // Turn 2
    aggregator.processJSON({ event: "START_GENERATE" });
    const res2 = aggregator.processJSON({ event: "END_GENERATE", metrics: { promptTokens: 2000 } });
    expect(res2?.id).toBe(2);
    expect(res2?.totalTokens).toBe(2000);
  });

  it("detects epoch transition from Logfmt strings", () => {
    const aggregator = new TurnAggregator();
    
    aggregator.processLine("INFO  2026-04-23T12:00:00 +0ms event=START_GENERATE phase=Phase2");
    
    // Simulate context limit reached
    aggregator.processLine("INFO  2026-04-23T12:00:01 +0ms sessionID=123 reason=Input Overflow tokens=19000 Context limit reached. Initiating automatic Epoch transition.");
    
    const turn = aggregator.processLine("INFO  2026-04-23T12:00:02 +0ms event=END_GENERATE metrics={ \"promptTokens\": 500 }");
    
    expect(turn?.isEpochTransition).toBe(true);
    expect(turn?.totalTokens).toBe(500); // Should reset currentEpochTokens on transition
  });

  it("parses tool events", () => {
     const aggregator = new TurnAggregator();
     aggregator.processJSON({ event: "START_GENERATE" });
     aggregator.processJSON({ 
       event: "TOOL_START", 
       callID: "call_1", 
       tool: "bash", 
       input: { command: "spec sc_status" } 
     });
     aggregator.processJSON({ 
       event: "TOOL_END", 
       callID: "call_1", 
       tool: "bash", 
       status: "completed",
       output: "Active project: my-task"
     });
     const turn = aggregator.processJSON({ event: "END_GENERATE" });
     
     expect(turn).not.toBeNull();
     expect(turn?.tools.length).toBe(1);
     expect(turn?.tools[0].name).toBe("sc_status"); // Semantic mapping
     expect(turn?.tools[0].status).toBe("completed");
     expect(turn?.tools[0].output).toBe("Active project: my-task");
  });
});
