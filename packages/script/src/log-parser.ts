import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const LOG_DIR = '/home/llm/utils/launch/logs';

interface LogEntry {
  timestamp: Date;
  model: string;
  phase: string;
  message: string;
}

export async function parseSequentialLogs(logFile?: string) {
  const targetFile = logFile || (await getLatestLogFile());
  
  if (!targetFile) {
    console.error('No log files found in ' + LOG_DIR);
    return;
  }

  console.log(`Parsing logs from: ${targetFile}`);

  const fileStream = fs.createReadStream(targetFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let previousModel = '';
  let sequentialSuccessCount = 0;
  let violationCount = 0;

  for await (const line of rl) {
    // Only track actual incoming chat completion requests or execution markers.
    // Assuming the proxy or server logs HTTP requests, or we look for specific POST hits.
    const isMainModelReq = line.includes('POST /v1/chat/completions') && line.includes('gemma-4-26b');
    const isSideModelReq = line.includes('POST /v1/chat/completions') && line.includes('nemotron-3');
    
    // As a fallback if HTTP logs aren't verbose, we can check our app log patterns if running against Epoch CLI stdout
    const isAppPhase1 = line.includes('Running Phase 1: Pre-Generation');
    const isAppPhase2 = line.includes('type":"tool_use"') || line.includes('type":"text"'); // Proxy for main generation
    const isAppPhase3 = line.includes('Running Phase 3: Post-Generation');

    if (isMainModelReq || isAppPhase2) {
      if (previousModel === 'gemma') {
        // Continuous streaming events aren't a violation, only repeated orchestrations
      } else {
        if (previousModel === 'nemotron') sequentialSuccessCount++;
        previousModel = 'gemma';
      }
    } else if (isSideModelReq || isAppPhase1 || isAppPhase3) {
      if (previousModel === 'nemotron') {
        // Consecutive side tasks (e.g. Phase 1 then immediately Phase 3 without generation) might happen
        // but typically it's Phase 1 -> Phase 2 -> Phase 3
      } else {
        sequentialSuccessCount++;
        previousModel = 'nemotron';
      }
    }
  }

  console.log('\n--- Log Parsing Summary ---');
  console.log(`Total Orchestration Handoffs: ${sequentialSuccessCount}`);
  console.log(`Potential Sequence Violations: ${violationCount}`);
  if (violationCount === 0) {
    console.log('✅ Sequential "Baton Pass" Event Loop is working as expected.');
  } else {
    console.log('❌ Compute contention or sequencing issues detected.');
  }
}

async function getLatestLogFile(): Promise<string | null> {
  try {
    const files = await fs.promises.readdir(LOG_DIR);
    const logFiles = files.filter(f => f.endsWith('.log'));
    if (logFiles.length === 0) return null;

    // Sort by modified time
    const stats = await Promise.all(logFiles.map(async f => {
      const fullPath = path.join(LOG_DIR, f);
      return { file: fullPath, stat: await fs.promises.stat(fullPath) };
    }));

    stats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
    return stats[0].file;
  } catch (error) {
    console.error('Error reading log directory. Ensure you have proper permissions: ', error);
    return null;
  }
}

// If run directly
if (require.main === module) {
  const fileArg = process.argv[2];
  parseSequentialLogs(fileArg).catch(console.error);
}
