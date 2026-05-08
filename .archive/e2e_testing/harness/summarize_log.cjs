const fs = require('fs');
const readline = require('readline');
const path = require('readline');
const fs2 = require('fs');

async function summarizeLog(logPath) {
  if (!fs2.existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    return;
  }

  const fileStream = fs2.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let turnCount = 0;
  let currentPhase = 'initial';
  let toolCount = 0;
  let lineNum = 0;

  console.log(`\n=== LOG SUMMARY: ${logPath} ===\n`);

  for await (const line of rl) {
    lineNum++;

    // LLM Turn Start
    if (line.includes('event=START_GENERATE')) {
      turnCount++;
      const phaseMatch = line.match(/activeAgent=([a-z]+)/);
      if (phaseMatch) currentPhase = phaseMatch[1];
      console.log(`L${lineNum}: [Turn ${turnCount}] START (Phase: ${currentPhase})`);
      continue;
    }

    // Thinking
    if (line.includes('Thinking:')) {
      const thinkingMatch = line.match(/Thinking:\s+(.*)/);
      if (thinkingMatch) {
          const text = thinkingMatch[1].length > 100 ? thinkingMatch[1].substring(0, 100) + '...' : thinkingMatch[1];
          console.log(`L${lineNum}:   💭 ${text}`);
      }
      continue;
    }

    // Tool Invocation (mcpx)
    if (line.includes('executing: mcpx') || 
        line.includes('⚙ mcpx') || 
        (line.includes('service=mcp') && line.includes('command=mcpx') && line.includes('executing mcpx')) ||
        (line.includes('service=tool.registry') && line.includes('method='))) {
      
      toolCount++;
      let cmd = '';
      if (line.includes('executing: mcpx') || line.includes('⚙ mcpx')) {
        const cmdMatch = line.match(/(?:executing: mcpx|⚙ mcpx)\s+(.*)/);
        cmd = cmdMatch ? cmdMatch[1].trim() : 'unknown mcpx call';
      } else if (line.includes('service=mcp')) {
        const cmdMatch = line.match(/command=mcpx\s+(.*?)\s+executing/);
        cmd = cmdMatch ? cmdMatch[1].trim() : 'unknown mcp mcpx call';
      } else {
        const methodMatch = line.match(/method=([a-zA-Z0-9_-]+)/);
        const serverMatch = line.match(/server=([a-zA-Z0-9_-]+)/);
        cmd = `${serverMatch ? serverMatch[1] : 'unknown'}.${methodMatch ? methodMatch[1] : 'unknown'}`;
      }
      console.log(`L${lineNum}:   🛠️  ${cmd}`);
      continue;
    }

    // Tool Result / Detail
    if (line.includes('mcpx exit:') || (line.includes('service=mcp') && line.includes('exit='))) {
      let exitCode = '?';
      let stderr = '';
      
      const exitMatch = line.match(/exit[=:]\s*(\d+)/);
      if (exitMatch) exitCode = exitMatch[1];
      
      const stderrMatch = line.match(/stderr=(.*?)(?:\s+\w+=|$)/);
      if (stderrMatch) stderr = stderrMatch[1];

      if (exitCode !== '0') {
        console.log(`L${lineNum}:     ❌ Failed (Exit: ${exitCode})${stderr ? ' Stderr: ' + stderr : ''}`);
      }
      continue;
    }

    // LLM Turn End
    if (line.includes('event=END_GENERATE')) {
      const metricsMatch = line.match(/metrics=({.*?})(?:\s|$)/);
      let metricsStr = '';
      if (metricsMatch) {
        try {
          const m = JSON.parse(metricsMatch[1]);
          metricsStr = `(TPS: ${m.tps ? Math.round(m.tps) : '?'}, Tokens: ${m.completionTokens || '?'})`;
        } catch (e) {}
      }
      console.log(`L${lineNum}: [Turn ${turnCount}] END ${metricsStr}\n`);
      continue;
    }

    // Generic Errors that aren't tool specific
    if ((line.includes(' level=ERROR ') || line.includes(' level=FATAL ')) && !line.includes('service=mcp')) {
      const msgMatch = line.match(/msg="(.*?)"/);
      const msg = msgMatch ? msgMatch[1] : line.substring(line.indexOf('level=') + 12);
      console.log(`L${lineNum}:   ⚠️  ERROR: ${msg}`);
      continue;
    }
    
    // Phase change detected by log (not just metadata)
    if (line.includes('Phase Change') || line.includes('shifting to')) {
        console.log(`L${lineNum}:   🔄 ${line.trim()}`);
    }
  }

  console.log(`\n=============================================`);
  console.log(`Summary: ${turnCount} LLM turns, ${toolCount} tool calls executed.`);
}

const logFile = process.argv[2];
if (!logFile) {
  console.log('Usage: node summarize_log.cjs <path_to_run.log>');
} else {
  summarizeLog(logFile);
}
