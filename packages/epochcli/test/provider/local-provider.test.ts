import { test, expect } from "bun:test"
import path from "path"

import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ProviderID, ModelID } from "../../src/provider/schema"

test("custom provider without models is not deleted and generates fallback models", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "epochcli.json"),
        JSON.stringify({
          $schema: "https://epochcli.ai/config.json",
          provider: {
            "my-local-provider": {
              name: "Local Provider",
              options: {
                baseURL: "http://localhost:11434/v1",
              },
            },
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const providers = await Provider.list()
      const providerID = ProviderID.make("my-local-provider")
      
      // 1. Verify provider is not deleted even if empty
      expect(providers[providerID]).toBeDefined()
      expect(providers[providerID].source).toBe("config")
      expect(Object.keys(providers[providerID].models).length).toBe(0)

      // 2. Verify getModel generates a fallback model
      const modelID = ModelID.make("some-random-model")
      const model = await Provider.getModel(providerID, modelID)
      
      expect(model).toBeDefined()
      expect(model.id).toBe(modelID)
      expect(model.providerID).toBe(providerID)
      expect(model.name).toBe(modelID as string)
      expect(model.limit.context).toBe(128000)
      
      // 3. Verify it's cached in the provider
      const updatedProviders = await Provider.list()
      expect(updatedProviders[providerID].models[modelID]).toBeDefined()
    },
  })
})

test("built-in providers still throw ModelNotFoundError for unknown models", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "epochcli.json"),
        JSON.stringify({
          $schema: "https://epochcli.ai/config.json",
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const providerID = ProviderID.openai
      const modelID = ModelID.make("non-existent-gpt-model")
      
      // Should still throw because source is likely "api" or "env" or "custom" (but not "config")
      // Actually, if it's from the built-in database, source is "api".
      expect(Provider.getModel(providerID, modelID)).rejects.toThrow()
    },
  })
})
