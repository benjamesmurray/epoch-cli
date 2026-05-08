/**
 * StreamingMonitor detects repetitive patterns in a stream of tokens.
 * It is primarily used to catch "thinking loops" where an LLM repeats the same
 * phrases or thoughts indefinitely.
 */
export class StreamingMonitor {
  private buffer: string = ""
  private readonly bufferLimit: number
  private readonly minMatchLength: number
  private readonly maxOccurrences: number

  constructor(
    options: {
      bufferLimit?: number
      minMatchLength?: number
      maxOccurrences?: number
    } = {},
  ) {
    this.bufferLimit = options.bufferLimit ?? 1000
    this.minMatchLength = options.minMatchLength ?? 20
    this.maxOccurrences = options.maxOccurrences ?? 3
  }

  /**
   * Appends a new chunk of text and checks for loops.
   * Returns true if a loop is detected.
   */
  public push(chunk: string): boolean {
    this.buffer += chunk

    // Maintain buffer size
    if (this.buffer.length > this.bufferLimit) {
      this.buffer = this.buffer.slice(-this.bufferLimit)
    }

    return this.detectLoop()
  }

  /**
   * Returns the substring that was detected as repeating.
   */
  public getOffendingText(): string | undefined {
    // Re-run detection logic to find the specific suffix
    for (let len = Math.floor(this.buffer.length / this.maxOccurrences); len >= this.minMatchLength; len--) {
      const suffix = this.buffer.slice(-len)
      let isRepeating = true
      for (let i = 1; i < this.maxOccurrences; i++) {
        const prevChunk = this.buffer.slice(-len * (i + 1), -len * i)
        if (prevChunk !== suffix) {
          isRepeating = false
          break
        }
      }
      if (isRepeating) {
        return suffix.trim()
      }
    }
    return undefined
  }

  private detectLoop(): boolean {
    if (this.buffer.length < this.minMatchLength * this.maxOccurrences) {
      return false
    }

    // Check if the current buffer ends with a repeating sequence S+S+S
    // We iterate through possible lengths of S
    for (let len = this.minMatchLength; len <= Math.floor(this.buffer.length / this.maxOccurrences); len++) {
      const suffix = this.buffer.slice(-len)

      let isRepeating = true
      for (let i = 1; i < this.maxOccurrences; i++) {
        const prevChunk = this.buffer.slice(-len * (i + 1), -len * i)
        if (prevChunk !== suffix) {
          isRepeating = false
          break
        }
      }

      if (isRepeating) {
        return true
      }
    }

    return false
  }
}
