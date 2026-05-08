import { describe, it, expect } from "bun:test"
import { StreamingMonitor } from "../../../src/session/llm/monitor"

describe("StreamingMonitor", () => {
  it("should not detect loops in normal text", () => {
    const monitor = new StreamingMonitor()
    expect(monitor.push("This is a normal sentence.")).toBe(false)
    expect(monitor.push("It does not have any long repeating patterns.")).toBe(false)
    expect(monitor.push("The quick brown fox jumps over the lazy dog.")).toBe(false)
  })

  it("should detect simple repeating loops", () => {
    const monitor = new StreamingMonitor({ minMatchLength: 5, maxOccurrences: 3 })
    const pattern = "Repeat me! "
    expect(monitor.push(pattern)).toBe(false)
    expect(monitor.push(pattern)).toBe(false)
    expect(monitor.push(pattern)).toBe(true)
    expect(monitor.getOffendingText()).toBe(pattern.trim())
  })

  it("should respect the minimum match length", () => {
    const monitor = new StreamingMonitor({ minMatchLength: 10, maxOccurrences: 3 })
    const shortPattern = "abc "
    expect(monitor.push(shortPattern)).toBe(false)
    expect(monitor.push(shortPattern)).toBe(false)
    expect(monitor.push(shortPattern)).toBe(false)
    expect(monitor.push(shortPattern)).toBe(false)

    const longPattern = "This is a long pattern "
    expect(monitor.push(longPattern)).toBe(false)
    expect(monitor.push(longPattern)).toBe(false)
    expect(monitor.push(longPattern)).toBe(true)
  })

  it("should detect loops even if they are pushed in small chunks", () => {
    const monitor = new StreamingMonitor({ minMatchLength: 10, maxOccurrences: 3 })
    const pattern = "Thinking about the next step... "
    const fullText = pattern + pattern + pattern

    for (let i = 0; i < fullText.length - 1; i++) {
      expect(monitor.push(fullText[i])).toBe(false)
    }
    expect(monitor.push(fullText[fullText.length - 1])).toBe(true)
  })

  it("should return the longest repeating suffix as offending text", () => {
    const monitor = new StreamingMonitor({ minMatchLength: 5, maxOccurrences: 2 })
    const pattern = "Longer pattern that repeats"
    monitor.push(pattern)
    monitor.push(pattern)
    expect(monitor.getOffendingText()).toBe(pattern)
  })
})
