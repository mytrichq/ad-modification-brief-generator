import { PATHS } from '../../core/config.js';
import * as P from '../../core/pipeline.js';
import * as store from '../../core/store.js';
import { buildPrompt } from '../../core/prompts.js';
import { args, rest, listArg, readInput } from '../args.js';
import { dim, rel, out, printScript, printDna, printMods } from '../print.js';
import { modCount, modTypes } from './generate.js';

export function prompt() {
  const step = rest[0];
  let ctx = {};
  if (step === 'learn') ctx = { feedback: store.readFeedback().slice(-60) };
  else {
    const run = store.loadRun(args.run);
    ctx = { meta: run.meta, script: run.script, dna: run.dna, brand: P.loadBrand(), n: modCount(), types: modTypes(), text: run.source?.text };
    if (step === 'normalize' && !ctx.text) throw new Error('This run has no free-text script to normalize.');
  }
  const p = buildPrompt(step, ctx);
  out(p, () => `# SYSTEM\n${p.system}\n# USER\n${p.user}\n\n# JSON SCHEMA (answer must match)\n${JSON.stringify(p.schema)}`);
}

export async function ingest() {
  const [step, file] = rest;
  const data = JSON.parse(await readInput(file));
  if (step === 'learn') {
    const rules = P.saveRules(data);
    return out(rules, () => `${rules.length} rules saved to ${rel(PATHS.rules)}`);
  }
  const runId = store.resolveRunId(args.run);
  let run;
  if (step === 'normalize') run = P.saveNormalized(runId, data);
  else if (step === 'dna') run = P.saveDna(runId, data);
  else if (step === 'mods') run = P.saveMods(runId, data, { n: data.mods?.length, types: listArg(args.types), provider: 'claude-code skill' });
  else throw new Error('Step must be normalize, dna, mods or learn.');
  out(run, () => {
    if (step === 'normalize') printScript(run);
    if (step === 'dna') printDna(run);
    if (step === 'mods') printMods(run);
    return dim(`\nSaved to run ${run.id}`);
  });
}
