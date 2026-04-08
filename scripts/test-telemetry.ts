import { Log } from "./packages/epochcli/src/util/log";

const log = Log.create({ service: "telemetry-test" });
console.log("Emitting telemetry event...");

const event = {
    timestamp: Date.now(),
    epochId: "test-123",
    event: "START_GENERATE",
    providerId: "test-provider",
    phase: "Phase 1"
};

log.info(JSON.stringify(event));
console.log("Event emitted.");
