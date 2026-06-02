#!/usr/bin/env bun

import { Script } from "@epoch-ai/script"
import { $ } from "bun"
import { fileURLToPath } from "url"

const highlightsTemplate = `
<!--
Add highlights before publishing. Delete this section if no highlights.

- For multiple highlights, use multiple <highlight> tags
- Highlights with the same source attribute get grouped together
-->

<!--
<highlight source="SourceName (TUI/Desktop/Web/Core)">
  <h2>Feature title goes here</h2>
  <p short="Short description used for Desktop Recap">
    Full description of the feature or change
  </p>

  https://github.com/user-attachments/assets/uuid-for-video (you will want to drag & drop the video or picture)

  <img
    width="1912"
    height="1164"
    alt="image"
    src="https://github.com/user-attachments/assets/uuid-for-image"
  />
</highlight>
-->

`

console.log("=== publishing ===\n")

const pkgjsons = await Array.fromAsync(
  new Bun.Glob("**/package.json").scan({
    absolute: true,
  }),
).then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist") && !x.includes("e2e_testing")))

for (const file of pkgjsons) {
  let pkg = await Bun.file(file).text()
  pkg = pkg.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`)
  console.log("updated:", file)
  await Bun.file(file).write(pkg)
}

const extensionToml = fileURLToPath(new URL("../packages/extensions/zed/extension.toml", import.meta.url))
if (await Bun.file(extensionToml).exists()) {
  let toml = await Bun.file(extensionToml).text()
  toml = toml.replace(/^version = "[^"]+"/m, `version = "${Script.version}"`)
  toml = toml.replaceAll(/releases\/download\/v[^/]+\//g, `releases/download/v${Script.version}/`)
  console.log("updated:", extensionToml)
  await Bun.file(extensionToml).write(toml)
}

const rootDir = fileURLToPath(new URL("..", import.meta.url))

await $`bun install`
console.log("\n=== building sdk ===\n")
await import(`../packages/sdk/js/script/build.ts`)
process.chdir(rootDir)

console.log("\n=== building cli ===\n")
await import(`../packages/epochcli/script/build.ts`)
process.chdir(rootDir)

if (Script.release) {
  if (!Script.preview) {
    await $`git commit -am "release: v${Script.version}"`.nothrow()
    await $`git tag v${Script.version}`.nothrow()
    await $`git fetch origin`
    await $`git cherry-pick HEAD..origin/dev`.nothrow()
    await $`git push origin HEAD --tags --no-verify --force-with-lease`.nothrow()
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }

  await $`gh release edit v${Script.version} --draft=false --repo ${process.env.GH_REPO}`
}

console.log("\n=== sdk ===\n")
await import(`../packages/sdk/js/script/publish.ts`)

console.log("\n=== plugin ===\n")
await import(`../packages/plugin/script/publish.ts`)

console.log("\n=== cli ===\n")
await import(`../packages/epochcli/script/publish.ts`)

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
