import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { makeRuntime } from "@/effect/run-service"
import { SessionID } from "./schema"
import { Effect, Layer, ServiceMap, Option } from "effect"
import z from "zod"
import { Database, eq, asc } from "../storage/db"
import { TodoTable } from "./session.sql"
import { AppFileSystem } from "@/filesystem"
import { Instance } from "../project/instance"
import * as path from "path"

export namespace Todo {
  export const Info = z
    .object({
      content: z.string().describe("Brief description of the task"),
      status: z.string().describe("Current status of the task: pending, in_progress, completed, cancelled"),
      priority: z.string().describe("Priority level of the task: high, medium, low"),
    })
    .meta({ ref: "Todo" })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define(
      "todo.updated",
      z.object({
        sessionID: SessionID.zod,
        todos: z.array(Info),
      }),
    ),
  }

  export interface Interface {
    readonly update: (input: { sessionID: SessionID; todos: Info[] }) => Effect.Effect<void>
    readonly get: (sessionID: SessionID) => Effect.Effect<Info[]>
    readonly syncWithFile: (sessionID: SessionID) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionTodo") {}

  export const layer: Layer.Layer<Service, never, Bus.Service | AppFileSystem.Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const fs = yield* AppFileSystem.Service

      const update = Effect.fn("Todo.update")(function* (input: { sessionID: SessionID; todos: Info[] }) {
        yield* Effect.sync(() =>
          Database.transaction((db) => {
            db.delete(TodoTable).where(eq(TodoTable.session_id, input.sessionID)).run()
            if (input.todos.length === 0) return
            db.insert(TodoTable)
              .values(
                input.todos.map((todo, position) => ({
                  session_id: input.sessionID,
                  content: todo.content,
                  status: todo.status,
                  priority: todo.priority,
                  position,
                })),
              )
              .run()
          }),
        )
        yield* bus.publish(Event.Updated, input)
      })

      const get = Effect.fn("Todo.get")(function* (sessionID: SessionID) {
        const rows = yield* Effect.sync(() =>
          Database.use((db) =>
            db
              .select()
              .from(TodoTable)
              .where(eq(TodoTable.session_id, sessionID))
              .orderBy(asc(TodoTable.position))
              .all(),
          ),
        )
        return rows.map((row) => ({
          content: row.content,
          status: row.status,
          priority: row.priority,
        }))
      })

      const syncWithFile = Effect.fn("Todo.syncWithFile")(function* (sessionID: SessionID) {
        const root = Instance.directory
        const projectsPath = path.join(root, "projects")
        if (!(yield* fs.exists(projectsPath))) return

        let latestFile: string | undefined
        let latestTime = 0

        const candidates = ["active", "completed", "closed"]
        for (const cat of candidates) {
          const catPath = path.join(projectsPath, cat)
          const exists = yield* fs.exists(catPath)
          if (!exists) continue

          const projects = yield* fs.readDirectory(catPath)
          for (const p of projects) {
            const pPath = path.join(catPath, p)
            const stats = yield* fs.stat(pPath)
            const mtime = Option.getOrElse(stats.mtime, () => new Date(0)).getTime()

            if (mtime > latestTime) {
              const tasksFile = path.join(pPath, "Tasks.md")
              const tasksFileLower = path.join(pPath, "tasks.md")

              if (yield* fs.exists(tasksFile)) {
                latestFile = tasksFile
                latestTime = mtime
              } else if (yield* fs.exists(tasksFileLower)) {
                latestFile = tasksFileLower
                latestTime = mtime
              }
            }
          }
        }

        if (!latestFile) return

        const content = yield* fs.readFileString(latestFile)
        const lines = content.split("\n")
        const todos: Info[] = []

        const taskRegex = /^-\s+\[( |\/|-|~|x|X)\]\s+(.*)$/
        for (const line of lines) {
          const match = line.trim().match(taskRegex)
          if (match) {
            const statusChar = match[1]
            const taskContent = match[2].trim()

            let status: Info["status"] = "pending"
            if (statusChar === "/" || statusChar === "-" || statusChar === "~") {
              status = "in_progress"
            } else if (statusChar === "x" || statusChar === "X") {
              status = "completed"
            }

            todos.push({
              content: taskContent,
              status,
              priority: "medium",
            })
          }
        }

        yield* update({ sessionID, todos })
      })

      return Service.of({ update, get, syncWithFile: (id) => syncWithFile(id).pipe(Effect.ignore) })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(AppFileSystem.defaultLayer))
  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function update(input: { sessionID: SessionID; todos: Info[] }) {
    return runPromise((svc) => svc.update(input))
  }

  export async function get(sessionID: SessionID) {
    return runPromise((svc) => svc.get(sessionID))
  }

  export async function syncWithFile(sessionID: SessionID) {
    return runPromise((svc) => svc.syncWithFile(sessionID))
  }
}
