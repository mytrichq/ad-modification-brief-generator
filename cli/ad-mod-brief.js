#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, command } from './args.js';
import { HELP } from './help.js';

if (command === 'demo' && !process.env.AMB_WORKSPACE) {
  process.env.AMB_WORKSPACE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace-demo');
}

const { red } = await import('./print.js');
const winners = await import('./commands/winners.js');
const generate = await import('./commands/generate.js');
const review = await import('./commands/review.js');
const { exportBriefs } = await import('./commands/export.js');
const skill = await import('./commands/skill.js');
const demo = await import('./commands/demo.js');

const COMMANDS = {
  rank: winners.rank, library: winners.library, runs: winners.runs, stats: winners.stats,
  start: generate.start, generate: () => generate.generate(), dna: generate.dna, lock: generate.lock, unlock: generate.unlock,
  fixes: generate.fixes, fix: generate.fix, mods: generate.mods, check: generate.check, show: generate.show,
  review: review.review, feedback: review.feedback, learn: review.learn, rules: review.rules,
  export: exportBriefs,
  prompt: skill.prompt, ingest: skill.ingest,
  demo: demo.demo, ui: demo.ui,
};

async function main() {
  if (!command || args.help) return console.log(HELP);
  const handler = COMMANDS[command];
  if (!handler) throw new Error(`Unknown command "${command}". Run ad-mod-brief --help`);
  return handler();
}

main().catch((e) => {
  console.error(red(`Error: ${e.message}`));
  process.exit(1);
});
