const fs = require('fs');

// 1. Fix log.ts
let logTs = fs.readFileSync('packages/epochcli/src/util/log.ts', 'utf8');
logTs = logTs.replace(/metrics: \{/g, 'metrics?: {');
logTs = logTs.replace(/promptTokens: number;/g, 'promptTokens?: number;');
logTs = logTs.replace(/payload\?: ZoneStructuredPayload;/g, 'payload?: ZoneStructuredPayload | any;');
logTs = logTs.replace(/payload: ZoneStructuredPayload \| undefined/g, 'payload: ZoneStructuredPayload | any | undefined');
logTs = logTs.replace(/export type ZoneStructuredPayload =/g, 'export type ZoneStructuredPayload = any; // \n  export type OldZoneStructuredPayload =');
fs.writeFileSync('packages/epochcli/src/util/log.ts', logTs);

// 2. Fix sanitizer.ts
let sanTs = fs.readFileSync('packages/epochcli/src/session/sanitizer.ts', 'utf8');
sanTs = sanTs.replace(/z\.SafeParseReturnType<string, T>/g, 'z.SafeParseReturnType<any, T>');
sanTs = sanTs.replace(/const delta = event\.textDelta/g, 'const delta = (event as any).textDelta || (event as any).text');
sanTs = sanTs.replace(/textDelta: repaired/g, 'textDelta: repaired,\n                  text: repaired');
fs.writeFileSync('packages/epochcli/src/session/sanitizer.ts', sanTs);

// 3. Fix log-parser.ts
let logParserTs = fs.readFileSync('packages/epochcli/src/util/log-parser.ts', 'utf8');
logParserTs = logParserTs.replace(/event\.epochId/g, 'event.mainEpochId');
logParserTs = logParserTs.replace(/event\.json_repaired/g, 'event.metrics?.json_repaired');
fs.writeFileSync('packages/epochcli/src/util/log-parser.ts', logParserTs);

// 4. Fix telemetry.test.ts
let teleTs = fs.readFileSync('packages/epochcli/test/session/telemetry.test.ts', 'utf8');
teleTs = teleTs.replace(/ZoneStructuredPayload/g, 'any');
fs.writeFileSync('packages/epochcli/test/session/telemetry.test.ts', teleTs);

// 5. Fix llm.ts
let llmTs = fs.readFileSync('packages/epochcli/src/session/llm.ts', 'utf8');
llmTs = llmTs.replace(/json_repaired: true/g, 'metrics: { json_repaired: true }');
fs.writeFileSync('packages/epochcli/src/session/llm.ts', llmTs);

