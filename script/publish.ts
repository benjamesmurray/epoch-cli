#!/usr/bin/env bun

import { Script } from "@epoch-ai/script"
import { $ } from "bun"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"

const rootDir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(rootDir)

if (!process.env.NPM_TOKEN) {
  console.error("NPM_TOKEN is required in .env for publication")
  process.exit(1)
}

console.log("=== publishing ===\n")

// 1. Update versions in all package.json files
const pkgjsons = await Array.fromAsync(
  new Bun.Glob("**/package.json").scan({
    absolute: true,
  }),
).then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist") && !x.includes("e2e_testing")))

for (const file of pkgjsons) {
  let pkg = await Bun.file(file).json()
  pkg.version = Script.version

  // Sync optionalDependencies for the CLI wrapper
  if (pkg.name === "@epoch-ai/cli" && pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) {
      if (dep.startsWith("@epoch-ai/cli-")) {
        pkg.optionalDependencies[dep] = Script.version
      }
    }
  }

  console.log("updated:", file)
  await Bun.file(file).write(JSON.stringify(pkg, null, 2))
}

// 2. Update Zed extension version if applicable
const extensionToml = path.join(rootDir, "packages/extensions/zed/extension.toml")
if (fs.existsSync(extensionToml)) {
  let toml = await Bun.file(extensionToml).text()
  toml = toml.replace(/^version = "[^"]+"/m, `version = "${Script.version}"`)
  toml = toml.replaceAll(/releases\/download\/v[^/]+\//g, `releases/download/v${Script.version}/`)
  console.log("updated:", extensionToml)
  await Bun.file(extensionToml).write(toml)
}

// 3. Install and Build
if (!process.env.SKIP_BUILD) {
  await $`bun install`
  console.log("\n=== building sdk ===\n")
  await import(`${rootDir}/packages/sdk/js/script/build.ts`)
  process.chdir(rootDir)

  console.log("\n=== building cli ===\n")
  await import(`${rootDir}/packages/epochcli/script/build.ts`)
  process.chdir(rootDir)
}

// 4. Release Operations
if (Script.release) {
  if (!Script.preview) {
    await $`git commit -am "release: v${Script.version}"`.nothrow()
    await $`git tag v${Script.version}`.nothrow()
    await $`git fetch origin`
    // Ensure we are on dev branch or similar if needed, but the script usually runs on dev
    await $`git push origin dev --tags`.nothrow()
  }

  // Publish in order
  console.log("\n=== publishing sdk ===\n")
  await $`npm publish --workspace=packages/sdk/js --tag latest --access public --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
  process.chdir(rootDir)

  console.log("\n=== publishing plugin ===\n")
  await $`npm publish --workspace=packages/plugin --tag latest --access public --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`
  process.chdir(rootDir)

  console.log("\n=== publishing cli and binaries ===\n")
  await import(`${rootDir}/packages/epochcli/script/publish.ts`)
  process.chdir(rootDir)

  console.log("\n=== publishing other workspaces ===\n")
  await $`npm publish --workspace=packages/util --tag latest --access public --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`.nothrow()
  await $`npm publish --workspace=packages/script --tag latest --access public --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`.nothrow()

  console.log("\n=== publishing root ===\n")
  await $`npm publish --tag latest --access public --//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`.nothrow()

  if (!Script.preview) {
    await $`gh release edit v${Script.version} --draft=false --repo ${process.env.GH_REPO}`.nothrow()
  }
}

console.log("\n=== publish complete ===\n")
