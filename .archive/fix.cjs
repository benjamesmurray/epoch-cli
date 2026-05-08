const fs = require('fs');
const content = fs.readFileSync('packages/epochcli/src/session/llm.ts', 'utf8');

const oldCode = `            // Check for recent objections to the supervisor
            let objectionCount = 0;
            let requestedAgent: string | undefined;
            for (let i = input.messages.length - 1; i >= 0; i--) {
                const msg = input.messages[i];
                if (msg.role === "assistant" && Array.isArray(msg.content)) {
                    const call = msg.content.find(c => c.type === "tool-call" && c.toolName === "object_to_supervisor");
                    if (call) {
                        objectionCount++;
                        requestedAgent = (call as any).args.requestedAgent;
                    } else {
                        break;
                    }
                }
            }

            // Concurrently identify agent, rule packs, and thinking effort
            const [identifiedAgentResult, identifiedPacks, identifiedEffort] = await Promise.all([
                (async () => {
                    if (objectionCount >= 2 && requestedAgent) {
                        l.debug("clerk", { message: \`Arbitration threshold reached (\${objectionCount} objections). Overruling Supervisor with: \${requestedAgent}\` });
                        return requestedAgent;
                    } else if (isOneShot && !planningFinished) {
                        l.debug("clerk", { message: "One-Shot planning in progress. Locking persona to: plan" });
                        return "plan";
                    } else {
                        return RuleRouter.identifyAgent(conversationTail, sideLanguage, groundTruths);
                    }
                })(),`;

const newCode = `            // Check for recent objections to the supervisor
            let objectionCount = 0;
            let requestedAgent: string | undefined;
            let recentScApprove = false;
            let consecutiveObjectionBroken = false;
            
            for (let i = input.messages.length - 1; i >= Math.max(0, input.messages.length - 8); i--) {
                const msg = input.messages[i];
                if (msg.role === "assistant" && Array.isArray(msg.content)) {
                    const objCall = msg.content.find(c => c.type === "tool-call" && c.toolName === "object_to_supervisor");
                    if (objCall && !consecutiveObjectionBroken) {
                        objectionCount++;
                        if (!requestedAgent) requestedAgent = (objCall as any).args.requestedAgent;
                    } else if (msg.content.some(c => c.type === "tool-call" && c.toolName !== "object_to_supervisor")) {
                        consecutiveObjectionBroken = true;
                    }
                    
                    const mcpxCall = msg.content.find(c => c.type === "tool-call" && c.toolName === "mcpx");
                    if (mcpxCall && (mcpxCall as any).args?.tool === "sc_approve") {
                        recentScApprove = true;
                    }
                }
            }

            // Concurrently identify agent, rule packs, and thinking effort
            const [identifiedAgentResult, identifiedPacks, identifiedEffort] = await Promise.all([
                (async () => {
                    const threshold = recentScApprove ? 1 : 2;
                    if (objectionCount >= threshold && requestedAgent) {
                        l.debug("clerk", { message: \`Arbitration threshold reached (\${objectionCount} objections, recentApprove: \${recentScApprove}). Overruling Supervisor with: \${requestedAgent}\` });
                        return requestedAgent;
                    } else if (isOneShot && !planningFinished) {
                        l.debug("clerk", { message: "One-Shot planning in progress. Locking persona to: plan" });
                        return "plan";
                    } else {
                        return RuleRouter.identifyAgent(conversationTail, sideLanguage, groundTruths);
                    }
                })(),`;

fs.writeFileSync('packages/epochcli/src/session/llm.ts', content.replace(oldCode, newCode));
