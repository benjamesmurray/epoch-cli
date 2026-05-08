
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const suitePath = 'e2e_testing/results/suite_2026-05-02T16-25-12-210Z';
const logs = fs.readdirSync(suitePath).filter(f => f.endsWith('.log')).sort();

console.log('# Aggregated Failure Analysis\n');

for (const log of logs) {
    console.log(`## Analyzing ${log}`);
    try {
        const output = execSync(`node e2e_testing/harness/summarize_log.cjs ${path.join(suitePath, log)}`).toString();
        
        const scTodoStartMissing = output.includes("Error: Tool 'sc_todo_start' not found on server");
        const turns = (output.match(/\[Turn \d+\] START/g) || []).length;
        const toolCalls = (output.match(/🛠️/g) || []).length;
        const thinkingLines = (output.match(/💭/g) || []).length;

        console.log(`- Turns: ${turns}`);
        console.log(`- Tool Calls: ${toolCalls}`);
        console.log(`- Thinking Cycles: ${thinkingLines}`);
        if (scTodoStartMissing) console.log(`- ❌ MISSING TOOL: sc_todo_start detected`);
        if (thinkingLines > turns * 1.5) console.log(`- ⚠️ POTENTIAL LOOPING (High thinking density)`);
        
        if (output.includes("What did we do so far?")) {
            console.log(`- 🔄 STUCK IN SUMMARY LOOP`);
        }
    } catch (e) {
        console.log(`- Failed to analyze: ${e.message}`);
    }
    console.log('');
}
