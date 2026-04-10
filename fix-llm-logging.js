const fs = require("fs");
const file = "packages/epochcli/src/session/llm.ts";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/const truncatedPayload = Log\.truncatePayload\(params\.prompt\)/g, 
  "const truncatedPayload = Log.truncatePayload(input.payload as any) || Log.truncatePayload(params.prompt as any)");

content = content.replace(/const epochId = input\.sessionID/g, 
  "const mainEpochId = input.sessionID\n              const clerkMicroEpochId = input.model.providerID.includes('local-side') ? `req-${Date.now()}` : undefined");

content = content.replace(/const phase = input\.model\.providerID\.includes\("local-side"\) \? "Phase 1\/3" : "Phase 2"/g, 
  "const phase = input.model.providerID.includes('local-side') ? 'Phase 1/3' : 'Phase 2: Gen'");

content = content.replace(/epochId,/g, "mainEpochId,\n                clerkMicroEpochId,");

content = content.replace(/epochId:\s*input\.sessionID/g, "mainEpochId: input.sessionID");

fs.writeFileSync(file, content, "utf8");
