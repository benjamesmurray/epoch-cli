const { readFileSync } = require('fs');
const log = readFileSync('e2e_testing/results/suite_2026-05-15T11-36-28-696Z/iot-controller-full-stack-run-1.log', 'utf8');

const errorMatches = log.match(/text part undefined not found/g);
console.log("Error count:", errorMatches ? errorMatches.length : 0);

const traces = log.match(/at\s+([^\n]+)/g);
console.log("Traces:");
if (traces) {
    const stack = traces.filter(t => t.includes('epochcli') || t.includes('effect'));
    console.log(stack.join('\n'));
}

