const fs = require('fs');
const content = fs.readFileSync('e2e_testing/harness/Dockerfile.eval', 'utf8');

const oldCode = `RUN npm install -g mcpx-go mcp-spec-cli`;

const newCode = `RUN npm install -g mcpx-go spec`;

fs.writeFileSync('e2e_testing/harness/Dockerfile.eval', content.replace(oldCode, newCode));
