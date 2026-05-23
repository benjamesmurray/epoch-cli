import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Glob } from "../../src/util/glob"
import { Process } from "../../src/util/process"

// Mock the core logic from index.ts to verify the scanning behavior
async function validateScApprove(
  featureId: string, 
  worktree: string, 
  binaryPath: string,
  scStatusMock: (binary: string) => Promise<{ code: number; stdout: string }>
) {
  let activePath = path.join(worktree, "projects/active")
  try {
    const statusRes = await scStatusMock(binaryPath)
    if (statusRes.code === 0) {
      const output = statusRes.stdout
      const featureMatch = output.match(/^[ \t]+feature:\s*(.+)$/m)
      if (featureMatch && featureMatch[1]) {
        const featurePath = featureMatch[1].trim()
        activePath = path.isAbsolute(featurePath)
          ? featurePath
          : path.join(worktree, featurePath)
      }
    }
  } catch (e) {
    // Fallback
  }

  // MD Scan
  const mdFiles = await Glob.scan("**/*.md", { cwd: activePath, absolute: true })
  for (const f of mdFiles) {
    const content = await fs.readFile(f, "utf-8")
    if (/<template-(specification|requirements|design|tasks)/i.test(content)) {
      return { isError: true, output: "Error: PROGRAMMATIC SCAN DETECTED <template-*> TAGS." }
    }
  }

    const tasksFiles = await Glob.scan("**/[Tt]asks.json", { cwd: activePath, absolute: true })
    for (const f of tasksFiles) {
      let content = ""
      try {
        content = await fs.readFile(f, "utf-8")
        const parsed = JSON.parse(content)

        if (parsed.template_tags_present === true && !hasImplementationDetail(parsed)) {
          return { isError: true, output: "Error: PROGRAMMATIC SCAN DETECTED template_tags_present: true." }
        }

        if (Array.isArray(parsed)) {
          return {
            isError: true,
            output: "Error: Tasks.json is invalid. It must be an OBJECT with a 'tasks' key.",
          }
        }

        if (Array.isArray(parsed.tasks)) {
          if (parsed.tasks.length === 0) {
            return { isError: true, output: "Error: Tasks.json must contain at least one implementation task." }
          }
          for (const task of parsed.tasks) {
            const missing = []
            if (task.id === undefined || task.id === null || task.id === "") missing.push("id")

            const hasTitle = !!task.title
            const hasDescription = !!task.description
            const hasDetails = !!task.details
            const hasStatus = !!task.status

            if (!hasTitle) missing.push("title")
            if (!hasDescription && !hasDetails) missing.push("description")
            if (!hasStatus) missing.push("status")

            let detailMsg = ""
            if (missing.length > 0) {
              detailMsg += `Missing required fields: ${missing.join(", ")}. `
            }

            if (task.id) {
              const idStr = String(task.id)
              if (!/^\d+(\.\d+)*$/.test(idStr)) {
                detailMsg += `Task ID '${idStr}' is invalid. Please use numeric-style identifiers. `
              }
            }

            const isTitleSwap = !hasTitle && hasDescription
            const isDescriptionSwap = hasDetails && (!hasDescription || isTitleSwap)

            if (isTitleSwap) {
              detailMsg += "You appear to have used 'description' for the task title. "
            }
            if (isDescriptionSwap) {
              detailMsg += "You appear to have used 'details' instead of 'description'. "
            }

            if (detailMsg) {
              return {
                isError: true,
                output: `Error: Tasks.json task with id '${task.id || "unknown"}' is invalid. ${detailMsg}`,
              }
            }
          }
        } else {
          return { isError: true, output: "Error: Tasks.json is missing the 'tasks' array." }
        }
      } catch (e) {
        if (content.trim().startsWith("#") || content.trim().startsWith("-")) {
          return {
            isError: true,
            output: "Error: Tasks.json appears to be written in Markdown.",
          }
        }
        return {
          isError: true,
          output: `Error: Tasks.json is not valid JSON. ${String(e)}`,
        }
      }
    }

  return { isError: false, output: "Success" }
}

function hasImplementationDetail(parsed: any): boolean {
  if (!parsed || !Array.isArray(parsed.tasks)) return false
  if (parsed.tasks.length > 2) return true
  const t1 = parsed.tasks[0]
  const t2 = parsed.tasks[1]
  const isTemplate = t1?.title === "Foundation & Setup" && t2?.title === "Initialize Repository"
  return !isTemplate
}

describe("sc_approve Validator Fix", () => {
  const tmpDir = path.join(process.cwd(), "tmp_test_sc_approve")

  test("should only scan the active project and ignore dirty ones", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-a"), { recursive: true })
    await fs.mkdir(path.join(tmpDir, "projects/active/project-b"), { recursive: true })

    // Project A is clean
    await fs.writeFile(path.join(tmpDir, "projects/active/project-a/Specification.md"), "# Project A\nClean.")
    
    // Project B is dirty
    await fs.writeFile(path.join(tmpDir, "projects/active/project-b/Specification.md"), "# Project B\n<template-specification>")

    // Mock sc_status pointing to Project A
    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-a\n  phase: tasks"
    })

    const result = await validateScApprove("project-a", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(false)
    expect(result.output).toBe("Success")

    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if the active project is dirty", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-b"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "projects/active/project-b/Specification.md"), "# Project B\n<template-specification>")

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-b\n  phase: tasks"
    })

    const result = await validateScApprove("project-b", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("PROGRAMMATIC SCAN DETECTED <template-*> TAGS")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should NOT fail on HTML template tags", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-c"), { recursive: true })
    await fs.writeFile(path.join(tmpDir, "projects/active/project-c/Specification.md"), "# Project C\n```html\n<template><div>Vue stuff</div></template>\n```")

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-c\n  phase: tasks"
    })

    const result = await validateScApprove("project-c", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(false)
    expect(result.output).toBe("Success")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should allow approval if Tasks.json has implementation detail even if flag is true", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-d"), { recursive: true })
    const editedTasks = {
      template_tags_present: true,
      tasks: [
        { id: "1", title: "Real Task 1", description: "Edited content", status: "pending" },
        { id: "2", title: "Real Task 2", description: "More edited content", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-d/Tasks.json"), JSON.stringify(editedTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-d\n  phase: tasks"
    })

    const result = await validateScApprove("project-d", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(false)
    expect(result.output).toBe("Success")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should allow approval if Tasks.json has more than 2 tasks even if flag is true", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-e"), { recursive: true })
    const editedTasks = {
      template_tags_present: true,
      tasks: [
        { id: "1", title: "Foundation & Setup", description: "Establish the project structure and shared types.", status: "pending" },
        { id: "1.1", title: "Initialize Repository", description: "Run cargo init and setup .gitignore.", status: "pending" },
        { id: "2", title: "Extra Task", description: "Some detail", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-e/Tasks.json"), JSON.stringify(editedTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-e\n  phase: tasks"
    })

    const result = await validateScApprove("project-e", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(false)
    expect(result.output).toBe("Success")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is missing title", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-f"), { recursive: true })
    const invalidTasks = {
      tasks: [
        { id: "1", description: "Missing title", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-f/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-f\n  phase: tasks"
    })

    const result = await validateScApprove("project-f", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("Missing required fields: title")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json uses details instead of description", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-g"), { recursive: true })
    const invalidTasks = {
      tasks: [
        { id: "1", title: "Task 1", details: "Using details field", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-g/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-g\n  phase: tasks"
    })

    const result = await validateScApprove("project-g", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("You appear to have used 'details' instead of 'description'")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is missing id or status", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-h"), { recursive: true })
    const invalidTasks = {
      tasks: [
        { title: "Task 1", description: "Missing id and status" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-h/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-h\n  phase: tasks"
    })

    const result = await validateScApprove("project-h", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("Missing required fields: id, status")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is a top-level array", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-i"), { recursive: true })
    const invalidTasks = [
      { id: "1", title: "Task 1", description: "Desc", status: "pending" }
    ]
    await fs.writeFile(path.join(tmpDir, "projects/active/project-i/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-i\n  phase: tasks"
    })

    const result = await validateScApprove("project-i", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("Tasks.json is invalid. It must be an OBJECT with a 'tasks' key")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json uses description for title and details for description", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-j"), { recursive: true })
    const invalidTasks = {
      tasks: [
        { id: "1", description: "My Title", details: "My long implementation detail", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-j/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-j\n  phase: tasks"
    })

    const result = await validateScApprove("project-j", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("You appear to have used 'description' for the task title")
    expect(result.output).toContain("You appear to have used 'details' instead of 'description'")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json has non-numeric IDs", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-k"), { recursive: true })
    const invalidTasks = {
      tasks: [
        { id: "setup-project", title: "Task 1", description: "Desc", status: "pending" }
      ]
    }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-k/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-k\n  phase: tasks"
    })

    const result = await validateScApprove("project-k", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("Task ID 'setup-project' is invalid. Please use numeric-style identifiers.")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is Markdown", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-l"), { recursive: true })
    const markdownContent = "# Tasks\n- Task 1"
    await fs.writeFile(path.join(tmpDir, "projects/active/project-l/Tasks.json"), markdownContent)

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-l\n  phase: tasks"
    })

    const result = await validateScApprove("project-l", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("Tasks.json appears to be written in Markdown")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is invalid JSON", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-m"), { recursive: true })
    const invalidJson = "{ tasks: [] }" // missing quotes
    await fs.writeFile(path.join(tmpDir, "projects/active/project-m/Tasks.json"), invalidJson)

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-m\n  phase: tasks"
    })

    const result = await validateScApprove("project-m", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("is not valid JSON")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json has an empty tasks array", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-n"), { recursive: true })
    const invalidTasks = { tasks: [] }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-n/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-n\n  phase: tasks"
    })

    const result = await validateScApprove("project-n", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("must contain at least one implementation task")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("should fail if Tasks.json is missing the tasks key", async () => {
    await fs.mkdir(path.join(tmpDir, "projects/active/project-o"), { recursive: true })
    const invalidTasks = { other: [] }
    await fs.writeFile(path.join(tmpDir, "projects/active/project-o/Tasks.json"), JSON.stringify(invalidTasks))

    const scStatusMock = async () => ({
      code: 0,
      stdout: "  feature: projects/active/project-o\n  phase: tasks"
    })

    const result = await validateScApprove("project-o", tmpDir, "mcpx", scStatusMock)
    expect(result.isError).toBe(true)
    expect(result.output).toContain("missing the 'tasks' array")

    await fs.rm(tmpDir, { recursive: true, force: true })
  })
})
