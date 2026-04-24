export interface DockerConfig {
  imageName: string;
  network: "none" | "host" | "bridge";
  memoryLimit?: string;
  model?: string;
  contextOverride?: number;
}

export interface TestConfig {
  id: string;
  iterations: number;
  timeoutMs: number;
  prompt: string;
  expectedTools: string[];
  runTargetDir: string; // e.g., ".epochcli/tool/$RUN_ID"
  epochcli?: any;
  docker?: DockerConfig;
}

export interface RunResult {
  runId: string;
  iteration: number;
  durationMs: number;
  status: "Success" | "Failed_Tests" | "Killed_Timeout" | "Killed_Loop" | "Error";
  usedExpectedTools: boolean;
  logPath: string;
  errorMessage?: string;
  jsonRepairs?: number;
  avgTps?: number;
  avgTtftMs?: number;
  totalTokens?: number;
  totalEpochs?: number;
}
