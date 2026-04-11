import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const EPOCHCLI_AUTO_SHARE = truthy("EPOCHCLI_AUTO_SHARE")
  export const EPOCHCLI_AUTO_HEAP_SNAPSHOT = truthy("EPOCHCLI_AUTO_HEAP_SNAPSHOT")
  export const EPOCHCLI_GIT_BASH_PATH = process.env["EPOCHCLI_GIT_BASH_PATH"]
  export const EPOCHCLI_CONFIG = process.env["EPOCHCLI_CONFIG"]
  export declare const EPOCHCLI_PURE: boolean
  export declare const EPOCHCLI_TUI_CONFIG: string | undefined
  export declare const EPOCHCLI_CONFIG_DIR: string | undefined
  export declare const EPOCHCLI_PLUGIN_META_FILE: string | undefined
  export const EPOCHCLI_CONFIG_CONTENT = process.env["EPOCHCLI_CONFIG_CONTENT"]
  export const EPOCHCLI_DISABLE_AUTOUPDATE = truthy("EPOCHCLI_DISABLE_AUTOUPDATE")
  export const EPOCHCLI_ALWAYS_NOTIFY_UPDATE = truthy("EPOCHCLI_ALWAYS_NOTIFY_UPDATE")
  export const EPOCHCLI_DISABLE_PRUNE = truthy("EPOCHCLI_DISABLE_PRUNE")
  export const EPOCHCLI_DISABLE_TERMINAL_TITLE = truthy("EPOCHCLI_DISABLE_TERMINAL_TITLE")
  export const EPOCHCLI_SHOW_TTFD = truthy("EPOCHCLI_SHOW_TTFD")
  export const EPOCHCLI_PERMISSION = process.env["EPOCHCLI_PERMISSION"]
  export const EPOCHCLI_DISABLE_DEFAULT_PLUGINS = truthy("EPOCHCLI_DISABLE_DEFAULT_PLUGINS")
  export const EPOCHCLI_DISABLE_LSP_DOWNLOAD = truthy("EPOCHCLI_DISABLE_LSP_DOWNLOAD")
  export const EPOCHCLI_ENABLE_EXPERIMENTAL_MODELS = truthy("EPOCHCLI_ENABLE_EXPERIMENTAL_MODELS")
  export const EPOCHCLI_DISABLE_AUTOCOMPACT = truthy("EPOCHCLI_DISABLE_AUTOCOMPACT")
  export const EPOCHCLI_DISABLE_MODELS_FETCH = truthy("EPOCHCLI_DISABLE_MODELS_FETCH")
  export const EPOCHCLI_DISABLE_MOUSE = truthy("EPOCHCLI_DISABLE_MOUSE")
  export const EPOCHCLI_DISABLE_CLAUDE_CODE = truthy("EPOCHCLI_DISABLE_CLAUDE_CODE")
  export const EPOCHCLI_DISABLE_CLAUDE_CODE_PROMPT =
    EPOCHCLI_DISABLE_CLAUDE_CODE || truthy("EPOCHCLI_DISABLE_CLAUDE_CODE_PROMPT")
  export const EPOCHCLI_DISABLE_CLAUDE_CODE_SKILLS =
    EPOCHCLI_DISABLE_CLAUDE_CODE || truthy("EPOCHCLI_DISABLE_CLAUDE_CODE_SKILLS")
  export const EPOCHCLI_DISABLE_EXTERNAL_SKILLS =
    EPOCHCLI_DISABLE_CLAUDE_CODE_SKILLS || truthy("EPOCHCLI_DISABLE_EXTERNAL_SKILLS")
  export declare const EPOCHCLI_DISABLE_PROJECT_CONFIG: boolean
  export const EPOCHCLI_FAKE_VCS = process.env["EPOCHCLI_FAKE_VCS"]
  export declare const EPOCHCLI_CLIENT: string
  export const EPOCHCLI_SERVER_PASSWORD = process.env["EPOCHCLI_SERVER_PASSWORD"]
  export const EPOCHCLI_SERVER_USERNAME = process.env["EPOCHCLI_SERVER_USERNAME"]
  export const EPOCHCLI_ENABLE_QUESTION_TOOL = truthy("EPOCHCLI_ENABLE_QUESTION_TOOL")
  export const EPOCHCLI_DEBUG_FULL_PROMPT = truthy("EPOCHCLI_DEBUG_FULL_PROMPT")

  // Experimental
  export const EPOCHCLI_EXPERIMENTAL = truthy("EPOCHCLI_EXPERIMENTAL")
  export const EPOCHCLI_EXPERIMENTAL_FILEWATCHER = Config.boolean("EPOCHCLI_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const EPOCHCLI_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "EPOCHCLI_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const EPOCHCLI_EXPERIMENTAL_ICON_DISCOVERY =
    EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["EPOCHCLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const EPOCHCLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("EPOCHCLI_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const EPOCHCLI_ENABLE_EXA =
    truthy("EPOCHCLI_ENABLE_EXA") || EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_EXA")
  export const EPOCHCLI_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("EPOCHCLI_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const EPOCHCLI_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("EPOCHCLI_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const EPOCHCLI_EXPERIMENTAL_OXFMT = EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_OXFMT")
  export const EPOCHCLI_EXPERIMENTAL_LSP_TY = truthy("EPOCHCLI_EXPERIMENTAL_LSP_TY")
  export const EPOCHCLI_EXPERIMENTAL_LSP_TOOL = EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_LSP_TOOL")
  export const EPOCHCLI_DISABLE_FILETIME_CHECK = Config.boolean("EPOCHCLI_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const EPOCHCLI_EXPERIMENTAL_PLAN_MODE = EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_PLAN_MODE")
  export const EPOCHCLI_EXPERIMENTAL_WORKSPACES = EPOCHCLI_EXPERIMENTAL || truthy("EPOCHCLI_EXPERIMENTAL_WORKSPACES")
  export const EPOCHCLI_EXPERIMENTAL_MARKDOWN = !falsy("EPOCHCLI_EXPERIMENTAL_MARKDOWN")
  export const EPOCHCLI_MODELS_URL = process.env["EPOCHCLI_MODELS_URL"]
  export const EPOCHCLI_MODELS_PATH = process.env["EPOCHCLI_MODELS_PATH"]
  export const EPOCHCLI_DISABLE_EMBEDDED_WEB_UI = truthy("EPOCHCLI_DISABLE_EMBEDDED_WEB_UI")
  export const EPOCHCLI_DB = process.env["EPOCHCLI_DB"]
  export const EPOCHCLI_DISABLE_CHANNEL_DB = truthy("EPOCHCLI_DISABLE_CHANNEL_DB")
  export const EPOCHCLI_SKIP_MIGRATIONS = truthy("EPOCHCLI_SKIP_MIGRATIONS")
  export const EPOCHCLI_STRICT_CONFIG_DEPS = truthy("EPOCHCLI_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for EPOCHCLI_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "EPOCHCLI_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("EPOCHCLI_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for EPOCHCLI_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "EPOCHCLI_TUI_CONFIG", {
  get() {
    return process.env["EPOCHCLI_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for EPOCHCLI_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "EPOCHCLI_CONFIG_DIR", {
  get() {
    return process.env["EPOCHCLI_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for EPOCHCLI_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "EPOCHCLI_PURE", {
  get() {
    return truthy("EPOCHCLI_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for EPOCHCLI_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "EPOCHCLI_PLUGIN_META_FILE", {
  get() {
    return process.env["EPOCHCLI_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for EPOCHCLI_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "EPOCHCLI_CLIENT", {
  get() {
    return process.env["EPOCHCLI_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
