import { describe, expect, it } from "bun:test";
import { AgentRunner } from "../src/AgentRunner";
import * as path from "path";
import * as fs from "fs/promises";

describe("AgentRunner", () => {
  it("should execute a successful command", async () => {
    const runner = new AgentRunner(["echo", "hello"], process.cwd(), 5000);
    const result = await runner.run();
    
    expect(result.status).toBe("Success");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should timeout a hanging command", async () => {
    // sleep 2 is a command that will hang for 2 seconds
    const runner = new AgentRunner(["sleep", "2"], process.cwd(), 100);
    const result = await runner.run();
    
    expect(result.status).toBe("Killed_Timeout");
    expect(result.errorMessage).toContain("timed out");
  });

  it("should detect loops and kill", async () => {
    // Create a dummy node script that prints loop pattern
    const dummyScript = path.join(process.cwd(), "dummy.js");
    await fs.writeFile(dummyScript, `
      setInterval(() => {
        console.log('{"name": "pm_query", "arguments": {"query": "Test"}}');
      }, 10);
    `);

    const runner = new AgentRunner(["bun", dummyScript], process.cwd(), 5000);
    const result = await runner.run();
    
    await fs.unlink(dummyScript);

    expect(result.status).toBe("Killed_Loop");
    expect(result.errorMessage).toContain("Infinite loop detected");
  });
});
