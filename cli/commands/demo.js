import path from 'node:path';
import { readFileSync } from 'node:fs';
import { PATHS } from '../../core/config.js';
import * as P from '../../core/pipeline.js';
import * as store from '../../core/store.js';
import { args } from '../args.js';
import { bold, dim, green, red } from '../print.js';
import { rank } from './winners.js';
import { generate } from './generate.js';
import { exportBriefs } from './export.js';

export async function demo() {
  console.log(`${bold('Demo')} ${dim('recorded LLM answers, separate workspace: workspace-demo/')}\n`);
  args.provider = 'demo';
  await rank();
  console.log(`\n${bold('→ generate C014')}`);
  args.json = false;
  await generate('C014');
  const run = store.loadRun();
  const reviews = JSON.parse(readFileSync(path.join(PATHS.fixtures, 'demo-reviews.json'), 'utf8'));
  console.log(`\n${bold('→ review')} ${dim('(recorded reviewer notes)')}`);
  for (const [i, r] of reviews.entries()) {
    const mod = run.mods.mods[r.index ?? i];
    if (!mod) continue;
    P.recordFeedback(run.id, mod.mod_id, r.verdict, r.reason, 'demo-reviewer');
    console.log(`  ${r.verdict === 'approve' ? green('✓') : red('✗')} ${mod.mod_id} ${dim(r.reason)}`);
  }
  console.log(`\n${bold('→ learn')} ${dim('(automatic after a review)')}`);
  const rules = await P.learn({ provider: 'demo' });
  rules.forEach((r, i) => console.log(`  ${i + 1}. ${r.rule}`));
  console.log(`\n${bold('→ export')}`);
  exportBriefs();
}

export async function ui() {
  const { startServer } = await import('../../ui/server.js');
  return startServer({ port: Number(args.port) || 4321, provider: args.provider });
}
