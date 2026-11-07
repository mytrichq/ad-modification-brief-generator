import path from 'node:path';
import { DEFAULTS, MOD_TYPES } from '../../core/config.js';
import * as P from '../../core/pipeline.js';
import * as store from '../../core/store.js';
import { detectProvider } from '../../core/llm.js';
import { fetchGoogleDoc } from '../../core/sources.js';
import { args, rest, listArg, readStdin } from '../args.js';
import { dim, green, plural, out, printScript, printDna, printFixes, printMods, printCost } from '../print.js';

export const modCount = () => (args.n ? Number(args.n) : DEFAULTS.mods);
export const modTypes = () => listArg(args.types) || MOD_TYPES;

async function startRun(creativeId) {
  const opts = { provider: args.provider, csv: args.csv, defer: args.defer };
  if (args.from) {
    const lib = P.library();
    const key = String(args.from);
    const item = lib.mods.find((m) => m.key === key) || lib.runs.find((r) => r.key === key) || lib.files.find((f) => f.key === key || f.creative_id === key);
    if (!item) throw new Error(`"${key}" is not in the library. See \`ad-mod-brief library\`.`);
    return P.startFromLibrary(item, opts);
  }
  let scriptText;
  if (args.doc) scriptText = await fetchGoogleDoc(args.doc);
  else if (args.script === '-') scriptText = await readStdin();
  const scriptFile = args.script && args.script !== '-' ? path.resolve(args.script) : undefined;
  if (!creativeId && !scriptText && !scriptFile) throw new Error('Give a creative id, --script <file|->, --doc <link> or --from <library item>.');
  return P.startRun({ ...opts, creativeId, scriptFile, scriptText });
}

export async function start() {
  const run = await startRun(rest[0]);
  out(run, () => (run.script ? (printScript(run), dim(`\nRun ${run.id}. Next: ad-mod-brief dna`)) : `Run ${run.id} waits for normalize (free-text script). Next: ad-mod-brief prompt normalize`));
}

export async function generate(creativeId = rest[0]) {
  const provider = detectProvider(args.provider);
  const log = (s) => !args.json && console.error(dim(s));
  log(`Provider: ${provider}`);
  let run = await startRun(creativeId);
  log(`Run ${run.id}: script ready (${run.meta.script_source})`);
  run = await P.analyzeDna(run.id, provider);
  log(`DNA: ${run.dna.elements.filter((e) => e.lock).length} locked cells, ${run.dna.elements.filter((e) => !e.lock).length} open`);
  log(`Generating ${plural(modCount(), 'modification')}…`);
  run = await P.generateMods(run.id, { provider, n: modCount(), types: modTypes() });
  out(run, () => {
    if (run.script.normalized_from_text) printScript(run);
    printDna(run);
    printMods(run);
    printCost(run);
    console.log(dim(`\nNext: ad-mod-brief review   ·   ad-mod-brief export --format pdf   ·   run ${run.id}`));
    return '';
  });
}

export async function dna() {
  const run = await P.analyzeDna(store.resolveRunId(args.run), args.provider);
  out(run.dna, () => (printDna(run), dim('\nNext: ad-mod-brief mods   (or lock/unlock cells first)')));
}

const setLocks = (action) => () => {
  const run = P.setLocks(args.run, { [action]: rest });
  out(run.dna, () => (printDna(run), ''));
};
export const lock = setLocks('lock');
export const unlock = setLocks('unlock');

export function fixes() {
  const run = store.loadRun(args.run);
  const list = run.script.suggested_fixes || [];
  out(list, () => (list.length ? printFixes(run) : console.log('No suggested fixes.'), ''));
}

export function fix() {
  const [n, action] = rest;
  if (!['apply', 'keep'].includes(action) || !Number(n)) throw new Error('Use: ad-mod-brief fix <n> apply|keep');
  const run = P.resolveFix(store.resolveRunId(args.run), Number(n) - 1, action === 'apply');
  const left = run.script.suggested_fixes?.length;
  out(run.script, () => `${action === 'apply' ? green('✓ applied to the original') : 'kept the live text'}${left ? dim(` · ${plural(left, 'suggestion')} left`) : ''}`);
}

export async function mods() {
  const run = await P.generateMods(store.resolveRunId(args.run), { provider: args.provider, n: modCount(), types: modTypes() });
  out(run, () => (printMods(run), printCost(run), ''));
}

export function check() {
  const run = P.runCheck(store.resolveRunId(args.run));
  out(run.check, () => (printMods(run), ''));
}

export function show() {
  const run = store.loadRun(args.run);
  out(run, () => (run.check ? printMods(run) : run.dna ? printDna(run) : printScript(run), ''));
}
