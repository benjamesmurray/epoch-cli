import type { AssistantMessage } from "@epoch-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@epoch-ai/plugin/tui"
import { createMemo, Show } from "solid-js"

const id = "internal:sidebar-context"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        usable: null,
        limit: null,
        margin: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    
    let limit = null
    let usable = null
    let margin = null

    if (model) {
      limit = model.limit.context
      if (limit > 0) {
        const maxOutput = Math.min(model.limit.output || 32000, 32000)
        margin = Math.min(1024, Math.max(500, maxOutput))
        usable = model.limit.input ? model.limit.input : limit - margin
      }
    }

    return {
      tokens,
      usable,
      limit,
      margin,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <Show when={state().usable !== null}>
        <text fg={theme().textMuted}>{state().usable!.toLocaleString()} usable</text>
      </Show>
      <Show when={state().limit !== null}>
        <text fg={theme().textMuted}>{state().limit!.toLocaleString()} limit</text>
      </Show>
      <Show when={state().margin !== null}>
        <text fg={theme().textMuted}>{state().margin!.toLocaleString()} margin</text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
