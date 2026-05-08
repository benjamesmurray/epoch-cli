#!/usr/bin/env node
const fs = require('fs');
process.stdin.on('data', (data) => {
    const str = data.toString();
    try {
        const json = JSON.parse(str);
        if (json.method === 'initialize') {
            const response = {
                jsonrpc: "2.0",
                id: json.id,
                result: {
                    protocolVersion: "2025-11-25",
                    capabilities: {}
                    // serverInfo omitted
                }
            };
            process.stdout.write(JSON.stringify(response) + '\n');
        }
    } catch (e) {}
});
