import type { ModelMessage } from "ai"

/**
 * Payload defining the four distinct zones of the Positional Prompt Architecture.
 */
export interface ZoneStructuredPayload {
  /**
   * Zone 1 (Head): Immediate context and persistence. High attention.
   * Typically contains persona, operational facts, and current task state.
   */
  zone1_critical_rules: string[]

  /**
   * Zone 2 (Body): Behavioral rules and broad context. Lower attention (middle).
   * Typically contains rule packs and general interaction context.
   */
  zone2_context_files: string[]

  /**
   * Zone 3 (Tail): Project-specific anchors and fact repetition. High attention.
   * Typically contains stack conventions and active cursor context.
   */
  zone3_active_cursor: string[]

  /**
   * Zone 4 (Guidelines): High-priority project intent and style guidelines.
   * Typically contains snippets from AGENTS.md or .cursorrules.
   */
  zone4_guidelines: string[]
}

/**
 * Utility for assembling the system prompt into four distinct zones to optimize LLM performance
 * by exploiting the U-shaped attention curve.
 */
export class PromptBuilder {
  /**
   * Assembles the prompt payload into a single, structured string.
   *
   * @param payload The content for the zones.
   * @returns The assembled system prompt.
   */
  static build(payload: ZoneStructuredPayload): string {
    const parts: string[] = []

    // Assemble Zone 1
    const zone1Content = payload.zone1_critical_rules.filter(Boolean).join("\n\n")
    if (zone1Content) {
      parts.push(`=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===\n\n${zone1Content}`)
    }

    // Assemble Zone 2
    const zone2Content = payload.zone2_context_files.filter(Boolean).join("\n\n")
    if (zone2Content) {
      if (parts.length > 0) parts.push("") // Spacing
      parts.push(`=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===\n\n${zone2Content}`)
    }

    // Assemble Zone 3
    const zone3Content = payload.zone3_active_cursor.filter(Boolean).join("\n\n")
    if (zone3Content) {
      if (parts.length > 0) parts.push("") // Spacing
      parts.push(`=== ZONE 3: PROJECT-SPECIFIC RULES & CURSOR CONTEXT ===\n\n${zone3Content}`)
    }

    // Assemble Zone 4
    const zone4Content = payload.zone4_guidelines.filter(Boolean).join("\n\n")
    if (zone4Content) {
      if (parts.length > 0) parts.push("") // Spacing
      parts.push(`=== ZONE 4: PROJECT GUIDELINES (AGENTS.md) ===\n\n${zone4Content}`)
    }

    return parts.join("\n")
  }

  /**
   * Assembles the prompt payload into a structured message array.
   *
   * @param payload The content for the four prompt zones.
   * @param options Optional configuration for thinking mode and model specific tokens.
   * @returns An array of ModelMessage objects.
   */
  static buildMessages(
    payload: ZoneStructuredPayload,
    options?: { thinkingEffort?: "high" | "low"; isSmallReasoningModel?: boolean },
  ): ModelMessage[] {
    const messages: ModelMessage[] = []

    // Zone 1: System Role
    let zone1Content = payload.zone1_critical_rules.filter(Boolean).join("\n\n")
    if (zone1Content) {
      if (options?.isSmallReasoningModel) {
        const thinkingToken = options.thinkingEffort ? "<|think|>" : ""
        const effortInstruction = options.thinkingEffort
          ? `\n\nTHINKING EFFORT: ${options.thinkingEffort.toUpperCase()}. ${
              options.thinkingEffort === "low"
                ? "Maintain extreme efficiency and minimize thinking tokens by approximately 20%."
                : "Prioritize depth of reasoning and logical chaining over token efficiency."
            }`
          : ""
        zone1Content = `${thinkingToken}${zone1Content}${effortInstruction}`
      }
      messages.push({ role: "system", content: `=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===\n\n${zone1Content}` })
    }

    // Zone 2: System Role (Body)
    const zone2Content = payload.zone2_context_files.filter(Boolean).join("\n\n")
    if (zone2Content) {
      messages.push({
        role: "system",
        content: `=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===\n\n${zone2Content}`,
      })
    }

    // Zone 3: System Role (Tail)
    const zone3Content = payload.zone3_active_cursor.filter(Boolean).join("\n\n")
    if (zone3Content) {
      messages.push({
        role: "system",
        content: `=== ZONE 3: PROJECT-SPECIFIC RULES & CURSOR CONTEXT ===\n\n${zone3Content}`,
      })
    }

    // Zone 4: System Role (Guidelines)
    const zone4Content = payload.zone4_guidelines.filter(Boolean).join("\n\n")
    if (zone4Content) {
      messages.push({
        role: "system",
        content: `=== ZONE 4: PROJECT GUIDELINES (AGENTS.md) ===\n\n${zone4Content}`,
      })
    }

    return messages
  }
}
