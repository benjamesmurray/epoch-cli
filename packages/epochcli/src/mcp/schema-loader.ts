import { MCP } from "./index"
import { Log } from "@/util/log"
import { Process } from "@/util/process"
import { Instance } from "@/project/instance"

const log = Log.create({ service: "mcp-schema-loader" })

export namespace SchemaContextLoader {
  // Simple in-memory cache for tool schemas
  const schemaCache = new Map<string, { schema: any; timestamp: number }>()
  const CACHE_TTL = 60_000 // 1 minute

  /**
   * Retrieves the input schema for a specific mcpx tool via subprocess.
   */
  export async function getMcpxToolSchema(
    server: string,
    tool: string,
    binaryPath: string = "mcpx-rust",
  ): Promise<any | undefined> {
    const cacheKey = `mcpx:${server}:${tool}`
    const cached = schemaCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.schema
    }

    try {
      const res = await Process.run([binaryPath, server, tool, "--help", "--json"], {
        cwd: Instance.directory,
        nothrow: true,
      })

      if (res.code === 0) {
        const data = JSON.parse(res.stdout.toString())
        if (data && data.input_schema) {
          schemaCache.set(cacheKey, { schema: data.input_schema, timestamp: Date.now() })
          return data.input_schema
        }
      }
    } catch (e) {
      log.debug("Failed to fetch mcpx schema", { server, tool, error: String(e) })
    }
    return undefined
  }

  /**
   * Retrieves the input schema for a specific tool.
   */
  export async function getToolSchema(toolName: string): Promise<any | undefined> {
    // Check cache first
    const cached = schemaCache.get(toolName)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.schema
    }

    try {
      const mcpClientsRecord = await MCP.clients()
      const mcpClients = Object.values(mcpClientsRecord) as any[]

      for (const entry of mcpClients) {
        try {
          // toolName in MCP is often prefixed by server name, but epochcli might use raw names
          // or handle the mapping. MCP.clients() returns a record where keys are server names.
          // We need to find which server has this tool.
          const toolsRes = await entry.client.listTools()
          const tool = toolsRes.tools.find((t: any) => t.name === toolName)
          if (tool) {
            // Update cache
            schemaCache.set(toolName, { schema: tool.inputSchema, timestamp: Date.now() })
            return tool.inputSchema
          }
        } catch (e) {
          // Continue to next client if one fails
          log.debug("Failed to list tools for client", { clientId: entry.id, error: String(e) })
        }
      }
    } catch (e) {
      log.warn("Failed to load MCP clients for schema loading", { error: String(e) })
    }
    return undefined
  }
}
