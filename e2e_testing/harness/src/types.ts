export interface DockerConfig {
  imageName: string;
  network: "none" | "host" | "bridge";
  memoryLimit?: string;
}

export interface TestConfig {
  id: string;
  iterations: number;
  timeoutMs: number;
  prompt: string;
  expectedTools: string[];
  runTargetDir: string; // e.g., ".epochcli/tool/$RUN_ID"
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
}
