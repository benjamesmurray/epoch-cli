import { describe, expect, test } from "bun:test"
import { LLM } from "../../src/session/llm"

describe("session.llm.normalizeMcpxArguments", () => {
  test("extracts flags correctly", () => {
    const args = {
      flags: { name: "my-project", recursive: "true" }
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.name).toBe("my-project")
    expect(result.recursive).toBe("true")
  })

  test("extracts -- flags from args array", () => {
    const args = {
      args: ["--name", "my-project", "--recursive=true"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.name).toBe("my-project")
    expect(result.recursive).toBe("true")
  })

  test("extracts key=value pairs from args array", () => {
    const args = {
      args: ["name=my-project", "recursive=true"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.name).toBe("my-project")
    expect(result.recursive).toBe("true")
  })

  test("captures positional arguments", () => {
    const args = {
      args: ["Smart Home IoT Controller"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result._positional).toEqual(["Smart Home IoT Controller"])
    expect(result._primaryPositional).toBe("Smart Home IoT Controller")
  })

  test("heuristic: maps single positional to primary when name/path missing", () => {
    const args = {
      args: ["/path/to/file"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result._primaryPositional).toBe("/path/to/file")
  })

  test("does not set _primaryPositional when multiple positional exist", () => {
    const args = {
      args: ["pos1", "pos2"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result._positional).toEqual(["pos1", "pos2"])
    expect(result._primaryPositional).toBeUndefined()
  })

  test("does not set _primaryPositional when name is present", () => {
    const args = {
      args: ["pos1"],
      flags: { name: "named" }
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.name).toBe("named")
    expect(result._primaryPositional).toBeUndefined()
  })

  test("handles mixed flags and positional", () => {
    const args = {
      args: ["--verbose", "my-project", "key=val"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.verbose).toBe("my-project") // --verbose takes next as value in the loop
    expect(result.key).toBe("val")
  })

  test("handles mixed flags and positional correctly (no-value flag)", () => {
    // Current implementation: if startsWith("--"), it expects next to be value if no '='
    // Let's test a case where we have a flag and then a positional
    const args = {
      args: ["--recursive", "Smart Home"]
    }
    const result = LLM.normalizeMcpxArguments(args)
    expect(result.recursive).toBe("Smart Home")
  })
})
