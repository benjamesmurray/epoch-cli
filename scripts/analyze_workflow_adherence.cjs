const fs = require('fs');
const path = require('path');

const suiteDir = process.argv[2] || 'e2e_testing/results/suite_2026-05-03T07-40-12-528Z';
const runs = fs.readdirSync(suiteDir).filter(f => f.startsWith('iot-controller-full-stack-run-') && fs.statSync(path.join(suiteDir, f)).isDirectory());

// Sort runs numerically
runs.sort((a, b) => parseInt(a.split('-run-')[1]) - parseInt(b.split('-run-')[1]));

console.log(`## Workflow Adherence and Root Causes (Suite: ${path.basename(suiteDir)})\n`);

for (const run of runs) {
    const timelinePath = path.join(suiteDir, run, '.history', 'timeline.toon');
    let toolProgression = [];
    let errors = [];
    let lastHint = null;
    let finalState = 'Unknown';
    
    if (fs.existsSync(timelinePath)) {
        const content = fs.readFileSync(timelinePath, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
            // Match sc_ tool invocations (e.g. \"tool\":\"sc_init\")
            const toolMatch = line.match(/\\?"tool\\?":\\?"(sc_[^"\\]+)\\?"/i) || line.match(/tool='(sc_[^']+)'/i) || line.match(/mcpx\s+.*?(sc_[a-z_]+)/i);
            if (toolMatch) {
                const tool = toolMatch[1];
                if (!toolProgression.includes(tool)) {
                    toolProgression.push(tool);
                }
            }
            
            // Match error messages
            if (line.includes("error: ") || line.includes("Result: error") || line.includes("error\":")) {
                const errorMatch = line.match(/error\\?":\\?"([^"\\]+)/i) || line.match(/error:\s*([^"\\]+)/i) || line.match(/Result:\s*error\s*->\s*(.+)/);
                if (errorMatch) {
                    errors.push(errorMatch[1].trim().substring(0, 150));
                }
            }
            
            // Match Stall Hints
            if (line.includes("Hint: ")) {
                const hintMatch = line.match(/Hint:\s*(.*?)(?=\\?"|->|$)/);
                if (hintMatch) {
                    lastHint = hintMatch[1].trim();
                }
            }
        }
    } else {
        finalState = 'No timeline found (Crash/Timeout)';
    }
    
    console.log(`### ${run}`);
    console.log(`- **Progression:** ${toolProgression.length > 0 ? toolProgression.join(' -> ') : 'None'}`);
    if (errors.length > 0) {
        console.log(`- **Last Error:** ${errors[errors.length - 1]}`);
    }
    if (lastHint) {
        console.log(`- **Stall Hint:** ${lastHint}`);
    }
    if (finalState !== 'Unknown') {
        console.log(`- **State:** ${finalState}`);
    }
    console.log();
}
