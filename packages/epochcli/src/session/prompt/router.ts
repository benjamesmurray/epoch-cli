import { generateText } from "ai"
import { Provider } from "@/provider/provider"

export type RulePackID =
  | "debugging_pack"
  | "refactoring_pack"
  | "new_feature_pack"
  | "code_review_pack"
  | "context_mgmt_pack"
  | "core_interaction_pack"

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
    const lowerInput = input.toLowerCase()
    const packs = new Set<RulePackID>()

    // Debugging heuristics
    if (
      lowerInput.includes("error") ||
      lowerInput.includes("bug") ||
      lowerInput.includes("fix") ||
      lowerInput.includes("fail") ||
      lowerInput.includes("stack trace") ||
      lowerInput.includes("exception")
    ) {
      packs.add("debugging_pack")
    }

    // Refactoring heuristics
    if (
      lowerInput.includes("refactor") ||
      lowerInput.includes("clean up") ||
      lowerInput.includes("optimize") ||
      lowerInput.includes("improve") ||
      lowerInput.includes("restructure")
    ) {
      packs.add("refactoring_pack")
    }

    // New Feature heuristics
    if (
      lowerInput.includes("create") ||
      lowerInput.includes("implement") ||
      lowerInput.includes("add") ||
      lowerInput.includes("new feature") ||
      lowerInput.includes("generate")
    ) {
      packs.add("new_feature_pack")
    }

    // Code Review heuristics
    if (
      lowerInput.includes("review") ||
      lowerInput.includes("explain") ||
      lowerInput.includes("how does") ||
      lowerInput.includes("what does")
    ) {
      packs.add("code_review_pack")
    }

    // Context Management heuristics
    if (
      lowerInput.includes("summarize") ||
      lowerInput.includes("revert") ||
      lowerInput.includes("undo") ||
      lowerInput.includes("forget")
    ) {
      packs.add("context_mgmt_pack")
    }

    // Always include core interaction
    packs.add("core_interaction_pack")

    return Array.from(packs)
  }

  /**
   * Deterministically identifies the appropriate agent persona based on the continuity report state.
   * Eliminates the need for LLM prediction by directly reading the workflow phase.
   */
  static async identifyAgent(
    input: string,
    currentAgent: string,
    continuityReport?: string,
  ): Promise<"build" | "plan" | "explore"> {
    if (!continuityReport) {
      // No explicit state tracking; default to build for execution capability
      // or maintain current agent if provided
      const normalizedCurrent = currentAgent.toLowerCase()
      if (normalizedCurrent === "plan" || normalizedCurrent === "explore") {
        return normalizedCurrent
      }
      return "build"
    }

    const reportLower = continuityReport.toLowerCase()

    // Check for explicit workflow phase indicators in the TOON document
    // These strings match the typical output of the spec continuity generator
    if (
      reportLower.includes("phase: 'requirements'") ||
      reportLower.includes("phase: requirements") ||
      reportLower.includes("phase: 'design'") ||
      reportLower.includes("phase: design") ||
      reportLower.includes("phase: 'tasks'") ||
      reportLower.includes("phase: tasks")
    ) {
      // If we are actively reviewing a planning document but haven't approved it yet
      return "plan"
    }

    if (
      reportLower.includes("phase: 'implementation'") ||
      reportLower.includes("phase: implementation") ||
      reportLower.includes("phase: 'build'") ||
      reportLower.includes("phase: build") ||
      reportLower.includes("tasks ready") ||
      reportLower.includes("scaffolding the build")
    ) {
      return "build"
    }

    // Default to maintaining current state or defaulting to build if ambiguous
    const normalizedCurrent = currentAgent.toLowerCase()
    if (normalizedCurrent === "plan" || normalizedCurrent === "explore" || normalizedCurrent === "build") {
      return normalizedCurrent as "build" | "plan" | "explore"
    }

    return "build"
  }

  /**
   * Uses the Clerk model (4B) to identify relevant behavioral rule packs.
   */
  static async identifyRulePacks(transcript: string, clerkModel: any): Promise<RulePackID[]> {
    const { text } = await generateText({
      model: clerkModel,
      system: `You are the Conversational Supervisor for Gemini CLI. 
Review the provided conversation transcript (User, Agent, and Tool interactions) to identify the relevant behavioral rule packs for the NEXT turn.

Available Rule Packs:
- debugging_pack: Focuses on root cause analysis, stack trace isolation, and bug fixing discipline. Use if errors or bugs are reported.
- refactoring_pack: Focuses on execution planning, architectural consistency, and performance metrics. Use if optimization or cleanup is requested.
- new_feature_pack: Focuses on directory structure validation, null-safety, and persistent state logging. Use if adding new logic or files.
- code_review_pack: Focuses on vulnerability explanation, trade-off analysis, and security flagging. Use for explanations or code analysis.
- context_mgmt_pack: Focuses on context summarization, contradiction detection, and task hand-offs. Use if context window is getting full or tasks are being transitioned.

Return ONLY a comma-separated list of the relevant rule pack IDs. Always include core_interaction_pack as the baseline.`,
      prompt: transcript,
      abortSignal: AbortSignal.timeout(60000),
      maxRetries: 0,
    })

    const packs = new Set<RulePackID>()
    const identified = text.toLowerCase()

    if (identified.includes("debugging")) packs.add("debugging_pack")
    if (identified.includes("refactoring")) packs.add("refactoring_pack")
    if (identified.includes("new_feature")) packs.add("new_feature_pack")
    if (identified.includes("code_review")) packs.add("code_review_pack")
    if (identified.includes("context_mgmt")) packs.add("context_mgmt_pack")

    packs.add("core_interaction_pack")
    return Array.from(packs)
  }

  /**
   * Uses the Clerk model (4B) to determine if the next turn requires "high" or "low" thinking effort.
   */
  static async identifyThinkingEffort(transcript: string, clerkModel: any): Promise<"high" | "low"> {
    const { text } = await generateText({
      model: clerkModel,
      system: `You are the Conversational Supervisor. 
Determine the required "Thinking Effort" for the NEXT turn based on the complexity of the task.

- "high": Complex reasoning, architecture design, multi-file refactoring, difficult debugging, or new feature implementation. Use this if the task requires deep logical chaining or structural changes.
- "low": Simple questions, boilerplate generation, single-file edits, status checks, or conversational responses. Use this for low-complexity tasks to maximize efficiency.

Return ONLY "high" or "low". Default to "low" for ambiguous cases.`,
      prompt: transcript,
      abortSignal: AbortSignal.timeout(60000),
      maxRetries: 0,
    })

    return text.trim().toLowerCase().includes("high") ? "high" : "low"
  }
}
