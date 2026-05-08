const fs = require('fs');
let sanTs = fs.readFileSync('packages/epochcli/src/session/sanitizer.ts', 'utf8');
sanTs = sanTs.replace(/z\.SafeParseReturnType<any, T>/g, 'any');
fs.writeFileSync('packages/epochcli/src/session/sanitizer.ts', sanTs);
