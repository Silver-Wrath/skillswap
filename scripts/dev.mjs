#!/usr/bin/env node
// Runs the API and the web client together for local development:
//   npm run dev
// Output is prefixed per process and Ctrl+C stops both.

import { spawn } from 'node:child_process';

const procs = [];

function run(name, command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `[${name}]`;
  const pipe = (stream) => {
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) console.log(`${tag} ${line}`);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on('exit', (code) => {
    console.log(`${tag} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  procs.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    if (!p.killed) p.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting SkillSwap dev servers (Ctrl+C stops both)...');
run('api', 'npm', ['--prefix', 'server', 'run', 'dev']);
run('web', 'npm', ['--prefix', 'client', 'run', 'dev']);
