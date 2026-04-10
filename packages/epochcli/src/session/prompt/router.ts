export type RulePackID = 
  | "debugging_pack"
  | "refactoring_pack"
  | "new_feature_pack"
  | "code_review_pack"
  | "context_mgmt_pack"
  | "core_interaction_pack";

/**
 * Service for classifying user intent to select appropriate behavioral rule packs.
 */
export class RuleRouter {
  /**
   * Classifies the user's input and returns a list of relevant rule pack IDs.
   * Uses heuristic keyword matching for fast, lightweight classification.
   * 
   * @param input The user's prompt or intent description.
   * @returns An array of RulePackID.
   */
  static classify(input: string): RulePackID[] {
    const lowerInput = input.toLowerCase();
    const packs = new Set<RulePackID>();

    // Debugging heuristics
    if (
      lowerInput.includes("error") ||
      lowerInput.includes("bug") ||
      lowerInput.includes("fix") ||
      lowerInput.includes("fail") ||
      lowerInput.includes("stack trace") ||
      lowerInput.includes("exception")
    ) {
      packs.add("debugging_pack");
    }

    // Refactoring heuristics
    if (
      lowerInput.includes("refactor") ||
      lowerInput.includes("clean up") ||
      lowerInput.includes("optimize") ||
      lowerInput.includes("improve") ||
      lowerInput.includes("restructure")
    ) {
      packs.add("refactoring_pack");
    }

    // New Feature heuristics
    if (
      lowerInput.includes("create") ||
      lowerInput.includes("implement") ||
      lowerInput.includes("add") ||
      lowerInput.includes("new feature") ||
      lowerInput.includes("generate")
    ) {
      packs.add("new_feature_pack");
    }

    // Code Review heuristics
    if (
      lowerInput.includes("review") ||
      lowerInput.includes("explain") ||
      lowerInput.includes("how does") ||
      lowerInput.includes("what does")
    ) {
      packs.add("code_review_pack");
    }

    // Context Management heuristics
    if (
      lowerInput.includes("summarize") ||
      lowerInput.includes("revert") ||
      lowerInput.includes("undo") ||
      lowerInput.includes("forget")
    ) {
      packs.add("context_mgmt_pack");
    }

    // Always include core interaction
    packs.add("core_interaction_pack");

    return Array.from(packs);
  }
}
