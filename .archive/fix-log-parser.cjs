const fs = require('fs');
let content = fs.readFileSync('packages/epochcli/test/util/log-parser.test.ts', 'utf8');
content = content.replace(/epochId/g, 'mainEpochId');
content = content.replace(/"json_repaired":true/g, '"metrics":{"json_repaired":true}');
fs.writeFileSync('packages/epochcli/test/util/log-parser.test.ts', content, 'utf8');
