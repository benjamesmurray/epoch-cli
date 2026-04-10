import { describe, expect, it } from "bun:test";
import { TestEvaluator } from "../src/TestEvaluator";
import * as path from "path";
import * as fs from "fs/promises";

describe("TestEvaluator", () => {
  it("should return false if directory does not exist", async () => {
    const result = await TestEvaluator.evaluate("/tmp/does/not/exist/ever");
    expect(result).toBe(false);
  });

  it("should return true for passing tests", async () => {
    const testDir = path.join(process.cwd(), "temp_pass");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "test.test.ts"), `
      import { test, expect } from "bun:test";
      test("pass", () => expect(1).toBe(1));
    `);

    const result = await TestEvaluator.evaluate(testDir);
    expect(result).toBe(true);

    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should return false for failing tests", async () => {
    const testDir = path.join(process.cwd(), "temp_fail");
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "test.test.ts"), `
      import { test, expect } from "bun:test";
      test("fail", () => expect(1).toBe(2));
    `);

    const result = await TestEvaluator.evaluate(testDir);
    expect(result).toBe(false);

    await fs.rm(testDir, { recursive: true, force: true });
  });
});
