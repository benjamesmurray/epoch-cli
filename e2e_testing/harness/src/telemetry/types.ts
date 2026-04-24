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
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  contextLimit?: number;
  contextFullness?: number; // 0-1 percentage
  isEpochTransition?: boolean;
}

export interface AnalyzerResult {
  turns: Turn[];
  summary: {
    totalTurns: number;
    interventionCount: number;
    failureCount: number;
    maxContextFullness: number;
  };
}
