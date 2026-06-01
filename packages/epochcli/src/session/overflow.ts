import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"

/**
 * Proactive overflow detection for Epoch Transitions.
 * Legacy compaction has been removed. We now strictly transition epochs when context is full.
 */
export function isOverflow(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"] | number
  model: Provider.Model
}) {
  if (input.cfg.compaction?.auto === false) return false
  const context = input.model.limit.context
  if (context === 0) return false

  // Use a small safety margin to ensure we don't hit hard provider limits.
  // This margin covers system prompts, mandatory tools, and the next model output.
  const safetyMargin = Math.min(1024, Math.max(500, ProviderTransform.maxOutputTokens(input.model)))
  const usable = input.model.limit.input ? input.model.limit.input : context - safetyMargin

  const count =
    typeof input.tokens === "number"
      ? input.tokens
      : (input.tokens.total ??
        (input.tokens.input ?? 0) +
          (input.tokens.output ?? 0) +
          (input.tokens.reasoning ?? 0) +
          ((input.tokens.cache?.read ?? 0) + (input.tokens.cache?.write ?? 0)))

  return count >= usable
}
