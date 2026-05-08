#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('deliver-cli', ['mcp'], {
    stdio: ['pipe', 'pipe', 'inherit']
});

process.stdin.pipe(child.stdin);

child.stdout.on('data', (data) => {
    fs.appendFileSync('server_response.json', data.toString());
    process.stdout.write(data);
});

child.on('exit', (code) => {
    process.exit(code);
});
