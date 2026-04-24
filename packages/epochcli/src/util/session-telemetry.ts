import path from "path"
import fs from "fs/promises"
import { createWriteStream, WriteStream } from "fs"
import { Global } from "../global"
import { Log } from "./log"

export interface ToolExecutionEvent {
    timestamp: number;
    sessionID: string;
    event: "TOOL_START" | "TOOL_END";
    tool: string;
    input?: any;
    output?: string;
    status?: "completed" | "failed" | "running";
    error?: string;
}

class SessionTelemetryService {
    private stream: WriteStream | null = null;
    private telemetryPath: string = "";

    async init(options: { dev?: boolean, print?: boolean }) {
        const logDir = Global.Path.log;
        await fs.mkdir(logDir, { recursive: true });
        
        this.telemetryPath = path.join(
            logDir,
            options.dev ? "dev.telemetry.jsonl" : new Date().toISOString().split(".")[0].replace(/:/g, "") + ".telemetry.jsonl"
        );
        
        await fs.truncate(this.telemetryPath).catch(() => {});
        this.stream = createWriteStream(this.telemetryPath, { flags: "a" });
    }

    getPath() {
        return this.telemetryPath;
    }

    async flush() {
        return new Promise<void>((resolve) => {
            if (this.stream) {
                // Ensure kernel buffers are flushed
                this.stream.write("", () => {
                    // For file streams, this callback means the data has been flushed to the kernel.
                    // To be absolutely sure, we can also use fsync if we had the fd.
                    // But usually end() is better for finality.
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    async dispose() {
        if (this.stream) {
            return new Promise<void>((resolve) => {
                const s = this.stream!;
                this.stream = null;
                s.end(() => {
                    resolve();
                });
            });
        }
    }

    emit(event: Log.EnhancedModelExecutionEvent | ToolExecutionEvent) {
        if (!this.stream) return;
        
        const line = JSON.stringify(event) + "\n";
        this.stream.write(line);
    }

    emitModelEvent(event: Omit<Log.EnhancedModelExecutionEvent, "timestamp">) {
        this.emit({
            timestamp: Date.now(),
            ...event
        } as Log.EnhancedModelExecutionEvent);
    }

    emitToolEvent(event: Omit<ToolExecutionEvent, "timestamp">) {
        this.emit({
            timestamp: Date.now(),
            ...event
        } as ToolExecutionEvent);
    }
}

export const SessionTelemetry = new SessionTelemetryService();
