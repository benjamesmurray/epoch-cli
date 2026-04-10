/**
 * Payload defining the three distinct zones of the Positional Prompt Architecture.
 */
export interface ZoneStructuredPayload {
  /**
   * Zone 1 (Head): Immediate context and persistence. High attention.
   * Typically contains correction persistence, current task state, and critical project symbols.
   */
  zone1_critical_rules: string[];

  /**
   * Zone 2 (Body): Behavioral rules, tool definitions, and broad context. Lower attention (middle).
   * Typically contains rule packs, tool schemas, and general file context.
   */
  zone2_context_files: string[];

  /**
   * Zone 3 (Tail): Fact repetition and local cursor context. High attention.
   * Typically contains reiteration of critical facts and the exact line of code being edited.
   */
  zone3_active_cursor: string[];
}

/**
 * Utility for assembling the system prompt into three distinct zones to optimize LLM performance
 * by exploiting the U-shaped attention curve.
 */
export class PromptBuilder {
  /**
   * Assembles the prompt payload into a single, structured string.
   * 
   * @param payload The content for the three prompt zones.
   * @returns The assembled system prompt.
   */
  static build(payload: ZoneStructuredPayload): string {
    const parts: string[] = [];

    // Assemble Zone 1
    const zone1Content = payload.zone1_critical_rules.filter(Boolean).join("\n\n");
    if (zone1Content) {
      parts.push("=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===");
      parts.push(zone1Content);
    }

    // Assemble Zone 2
    const zone2Content = payload.zone2_context_files.filter(Boolean).join("\n\n");
    if (zone2Content) {
      if (parts.length > 0) parts.push(""); // Spacing
      parts.push("=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===");
      parts.push(zone2Content);
    }

    // Assemble Zone 3
    const zone3Content = payload.zone3_active_cursor.filter(Boolean).join("\n\n");
    if (zone3Content) {
      if (parts.length > 0) parts.push(""); // Spacing
      parts.push("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
      parts.push(zone3Content);
    }

    return parts.join("\n");
  }
}
