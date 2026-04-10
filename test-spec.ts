import { TaskParser } from "./mcp-spec-cli/src/features/shared/taskParser.ts";
import * as fs from "fs";

const content = fs.readFileSync("projects/active/gemma-4-dual-model/Tasks.md", "utf8");
const tasks = TaskParser.parse(content);
const areTasksDone = (ts: any[]): boolean => ts.every(t => t.completed && (t.children.length === 0 || areTasksDone(t.children)));
const allTasksComplete = tasks.length > 0 && areTasksDone(tasks);

console.log("TASKS:");
console.dir(tasks, { depth: null });
console.log("All complete:", allTasksComplete);
