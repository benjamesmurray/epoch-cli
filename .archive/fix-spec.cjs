const fs = require('fs');
const content = fs.readFileSync('spec/src/tools/specTools.ts', 'utf8');

const oldCode = `    'sc_plan',
    {
      description: 'Progress the workflow state (e.g., Requirements -> Design). Automatically archives when finished.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)'),
        instruction: z.string().optional().describe('Specific instructions or updates for the next phase')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'plan'];
        if (args.feature) cliArgs.push('--feature', args.feature);
        if (args.instruction) cliArgs.push('--instruction', args.instruction);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: \`Error: \${error.message}\` }], isError: true };
      }
    }`;

const newCode = `    'sc_plan',
    {
      description: 'Progress the workflow state (e.g., Requirements -> Design). Automatically archives when finished.',
      inputSchema: {
        feature: z.string().optional().describe('Feature name (optional)'),
        name: z.string().optional().describe('Alias for feature name (optional)'),
        instruction: z.string().optional().describe('Specific instructions or updates for the next phase')
      }
    },
    async (args) => {
      try {
        const cliArgs = ['exec', 'plan'];
        const featureName = args.feature || args.name;
        if (featureName) cliArgs.push('--feature', featureName);
        if (args.instruction) cliArgs.push('--instruction', args.instruction);
        const result = await runCli(cliArgs);
        return { content: [{ type: 'text', text: result }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: \`Error: \${error.message}\` }], isError: true };
      }
    }`;

fs.writeFileSync('spec/src/tools/specTools.ts', content.replace(oldCode, newCode));
