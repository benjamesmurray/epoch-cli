export interface LogLine {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  metadata?: Record<string, string>;
  raw: string;
}

export interface Turn {
  id: number;
  startTime: string;
  endTime?: string;
  lines: LogLine[];
  interventions: string[];
  mcpxFailures: string[];
  phase?: string;
  activeAgent?: string;
}

export interface AnalyzerResult {
  turns: Turn[];
  summary: {
    totalTurns: number;
    interventionCount: number;
    failureCount: number;
  };
}
