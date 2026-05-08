const fs = require('fs');
const content = fs.readFileSync('AGENTS.md', 'utf8');

const oldCode = `- Always run \`bun typecheck\` from package directories (e.g., \`packages/epochcli\`), never \`tsc\` directly.`;
const newCode = `- Always run \`bun typecheck\` from package directories (e.g., \`packages/epochcli\`), never \`tsc\` directly. If creating a new package, define the script as \`"typecheck": "tsc --noEmit"\`.`;

fs.writeFileSync('AGENTS.md', content.replace(oldCode, newCode));
