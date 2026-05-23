import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"

import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_QWEN from "./prompt/qwen.txt"
import PROMPT_GEMMA4 from "./prompt/gemma4.txt"

import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"

export namespace SystemPrompt {
  export function provider(model: Provider.Model, isContinue = false) {
    let basePrompt = PROMPT_DEFAULT
    if (model.api.id.includes("gemma-4") || model.api.id.includes("google-gemma-26b")) {
      basePrompt = PROMPT_GEMMA4
    } else if (model.api.id.toLowerCase().includes("qwen") || model.api.id.toLowerCase().includes("kimi")) {
      basePrompt = PROMPT_QWEN
    }

    return [basePrompt]
  }

  export async function operationalFacts(model: Provider.Model) {
    return []
  }

  export async function environment(model: Provider.Model) {
    const project = Instance.project
    return [
      [
        `<env>`,
        `  CWD: ${Instance.directory}`,
        `  Root: ${Instance.worktree}`,
        `  Git: ${project.vcs === "git" ? "yes" : "no"}`,
        `  Platform: ${process.platform}`,
        `  Date: ${new Date().toDateString()}`,
        `  Map: Use 'mcpx' server="map" (pm_status, pm_query) for discovery. No manual 'ls' or 'find'.`,
        `</env>`,
      ].join("\n"),
    ]
  }

  export async function skills(agent: Agent.Info) {
    if (Permission.disabled(["skill"], agent.permission).has("skill")) return

    const list = await Skill.available(agent)
    if (list.length === 0) return

    return [
      "Skills provide specialized instructions and workflows for specific tasks.",
      "Use the skill tool to load a skill when a task matches its description.",
      // the agents seem to ingest the information about skills a bit better if we present a more verbose
      // version of them here and a less verbose version in tool description, rather than vice versa.
      Skill.fmt(list, { verbose: true }),
    ].join("\n")
  }

  /**
   * Zone 2: Behavioral rules and broad context.
   */
  export function zone2(agent: Agent.Info, model: Provider.Model): string {
    const parts: string[] = []

    parts.push("=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===")

    // Add agent specific prompt if any
    if (agent.prompt) {
      parts.push(agent.prompt)
    } else {
      // Fallback to provider default prompt
      parts.push(...provider(model))
    }

    return parts.join("\n\n")
  }
}
