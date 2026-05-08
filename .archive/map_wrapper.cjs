#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('/home/benmurray/.cargo/bin/project-map-cli-rust', ['mcp'], {
    stdio: ['pipe', 'pipe', 'inherit']
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

process.stdin.on('data', data => fs.appendFileSync('map_in.log', data));
child.stdout.on('data', data => fs.appendFileSync('map_out.log', data));
child.stderr?.on('data', data => fs.appendFileSync('map_err.log', data));
