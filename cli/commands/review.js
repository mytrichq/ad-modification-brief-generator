import { PATHS } from '../../core/config.js';
import * as P from '../../core/pipeline.js';
import * as store from '../../core/store.js';
import { args, rest } from '../args.js';
import { bold, dim, green, red, plural, rel, out, printMods } from '../print.js';

async function autoLearn() {
  if (P.pendingFeedback() <= 0) return;
  console.log(dim('\nUpdating team rules from the new reviews…'));
  const rules = await P.learn({ provider: args.provider });
  const st = store.getLearnState();
  console.log(`${bold(plural(rules.length, 'team rule'))}${st.added ? green(` (+${st.added} new)`) : ''} → ${rel(PATHS.rules)}`);
}

export async function review() {
  const run = store.loadRun(args.run);
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  printMods(run);
  console.log(`\n${bold('Review')} ${dim('a = approve, r = reject, s = skip, q = quit. A short reason teaches the next generation.')}`);
  let done = 0;
  for (const m of run.mods.mods) {
    if (run.reviews[m.mod_id] && !args.all) continue;
    const answer = (await rl.question(`\n${bold(m.mod_id)} ${m.title} [a/r/s/q]: `)).trim().toLowerCase();
    if (answer === 'q') break;
    if (answer !== 'a' && answer !== 'r') continue;
    const reason = (await rl.question(dim('  reason: '))).trim();
    P.recordFeedback(run.id, m.mod_id, answer === 'a' ? 'approve' : 'reject', reason);
    done++;
  }
  rl.close();
  console.log(`\n${plural(done, 'review')} saved to ${rel(PATHS.feedback)}.`);
  if (done) await autoLearn();
  console.log(dim('Next: ad-mod-brief export --format pdf'));
}

export function feedback() {
  const [modId, verdict, ...reason] = rest;
  const run = P.recordFeedback(args.run, modId, verdict, reason.join(' '));
  out(run.reviews, () => `${verdict === 'approve' ? green('✓ approved') : red('✗ rejected')} ${modId}${reason.length ? dim(` (${reason.join(' ')})`) : ''}`);
}

export async function learn() {
  const rules = await P.learn({ provider: args.provider });
  out(rules, () => `${bold(plural(rules.length, 'team rule'))} saved to ${rel(PATHS.rules)}\n${rules.map((r, i) => `  ${i + 1}. ${r.rule} ${dim(`(${r.why})`)}`).join('\n')}`);
}

export function rules() {
  console.log(store.readRules());
}
