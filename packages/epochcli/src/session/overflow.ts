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
  console.log(`Checking overflow: tokens=${typeof input.tokens === "number" ? input.tokens : input.tokens.total}`)
  if (input.cfg.compaction?.auto === false) return false
  const context = input.model.limit.context
  if (context === 0) return false

  const count =
    typeof input.tokens === "number"
      ? input.tokens
      : input.tokens.total ||
        input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write

  // Use a small safety margin to ensure we don't hit hard provider limits.
  // This margin covers system prompts, mandatory tools, and the next model output.
  const safetyMargin = Math.max(1000, ProviderTransform.maxOutputTokens(input.model))
  const usable = input.model.limit.input ? input.model.limit.input : context - safetyMargin

  return count >= usable
}
