import fs from "node:fs"

export function online() {
  const nav = globalThis.navigator
  if (!nav || typeof nav.onLine !== "boolean") return true
  return nav.onLine
}

export function proxied() {
  return !!(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy)
}

/**
 * Detects if the current process is running inside a container (Docker, Podman, etc.)
 */
export function isContainer() {
  if (process.env.DOCKER === "true") return true
  try {
    return fs.existsSync("/.dockerenv") || fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker")
  } catch {
    return false
  }
}
