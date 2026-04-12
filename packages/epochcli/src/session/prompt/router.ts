import { generateText } from "ai";
import { Provider } from "@/provider/provider";

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

  /**
   * Uses the Clerk model (4B) to identify the appropriate agent persona based on user intent.
   */
  static async identifyAgent(input: string, clerkModel: any, groundTruths?: string): Promise<"build" | "plan" | "explore"> {
    if (input.includes("ONE-SHOT")) {
      return "plan";
    }

    const { text } = await generateText({
      model: clerkModel,
      system: `You are the Conversational Supervisor for Gemini CLI. 
Review the provided conversation transcript (User, Agent, and Tool interactions) to determine the most appropriate agent persona for the NEXT turn.

Agent Personas:
- "plan": High-level requirements, design, architecture, or implementation planning (using Spec CLI tools like sc_plan, sc_init). Stay in "plan" until all planning documents are completed and approved.
- "build": Implementation, coding, bug fixes, or testing. Shift to "build" ONLY when planning is demonstrably finished (e.g., sc_todo_start was called and the agent is ready to write source code).
- "explore": Read-only exploration, searching, or understanding the codebase. Use this if the user asks questions or the agent needs to research without making changes.

Decision Logic:
1. Identify the CURRENT active persona from the last few turns.
2. Maintain PERSONA INERTIA: Do not shift personas unless there is a clear semantic signal that the phase has changed.
3. If the agent calls "object_to_supervisor", HONOUR their request immediately unless it is obviously nonsensical.
4. Planning tools (sc_plan, sc_init) are strong signals for "plan".
5. Implementation tools (write, sc_todo_start) are strong signals for "build".
6. If the agent is trying to write code but is in "plan" mode (and thus restricted), shift them to "build".

${groundTruths ? `Project Operational Rules:\n${groundTruths}\n\n` : ''}Return ONLY the name of the agent in lowercase.`,
      prompt: input,
      abortSignal: AbortSignal.timeout(15000),
      maxRetries: 0,
    });

    const identified = text.trim().toLowerCase();
    if (identified.includes("plan")) return "plan";
    if (identified.includes("explore")) return "explore";
    return "build";
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
      abortSignal: AbortSignal.timeout(15000),
      maxRetries: 0,
    });

    const packs = new Set<RulePackID>();
    const identified = text.toLowerCase();
    
    if (identified.includes("debugging")) packs.add("debugging_pack");
    if (identified.includes("refactoring")) packs.add("refactoring_pack");
    if (identified.includes("new_feature")) packs.add("new_feature_pack");
    if (identified.includes("code_review")) packs.add("code_review_pack");
    if (identified.includes("context_mgmt")) packs.add("context_mgmt_pack");
    
    packs.add("core_interaction_pack");
    return Array.from(packs);
  }
}
