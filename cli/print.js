import path from 'node:path';
import { args } from './args.js';
import { runCost } from '../core/pipeline.js';
import { scriptToMarkdown } from '../core/script.js';

const tty = process.stdout.isTTY && !args.json;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const bold = c(1), dim = c(2), red = c(31), green = c(32), yellow = c(33), blue = c(34), cyan = c(36);
const statusColor = { pass: green, warn: yellow, fail: red };

export const usd = (v) => (v === null || v === undefined ? '—' : `$${Math.round(v).toLocaleString('en-US')}`);
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const rel = (file) => path.relative(process.cwd(), file);
export const out = (data, text) => console.log(args.json ? JSON.stringify(data, null, 2) : text());

export function table(rows, headers) {
  const width = (v) => String(v).replace(/\x1b\[\d+m/g, '').length;
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => width(r[i]))));
  const line = (cells) => cells.map((v, i) => String(v) + ' '.repeat(widths[i] - width(v))).join('  ');
  return [bold(line(headers)), ...rows.map(line)].join('\n');
}

export function printScript(run) {
  console.log(`\n${bold(run.meta.creative_id)} "${run.script.title}" ${dim(`(${run.meta.script_source})`)}`);
  console.log(scriptToMarkdown(run.script));
}

export function printDna(run) {
  const d = run.dna;
  console.log(`\n${bold('Creative DNA')}  ${d.summary}`);
  console.log(dim(`angle: ${d.angle} · pain: ${d.pain_point} · emotion: ${d.emotional_trigger}`));
  console.log(table(d.elements.map((e) => [e.id, e.lock ? cyan('LOCK') : 'open', e.role, e.why]), ['cell', '', 'role', 'why']));
  printFixes(run);
}

export function printFixes(run) {
  const list = run.script?.suggested_fixes || [];
  if (!list.length) return;
  console.log(`\n${bold(plural(list.length, 'suggested fix', 'suggested fixes'))} ${dim('the live ad keeps its text until you apply one')}`);
  list.forEach((f, i) => console.log(`  ${i + 1}. S${f.scene} ${f.field}: ${dim(f.before)} ${dim('→')} ${f.after}${f.why ? dim(` (${f.why})`) : ''}`));
  console.log(dim('  ad-mod-brief fix <n> apply   ·   ad-mod-brief fix <n> keep'));
}

export function printMods(run) {
  const s = run.check.summary;
  console.log(`\n${bold(plural(s.total, 'modification'))}  ${green(`${s.pass} pass`)} · ${yellow(`${s.warn} warn`)} · ${red(`${s.fail} fail`)} · diversity ${s.diversity}${s.near_duplicates ? yellow(` · ${plural(s.near_duplicates, 'near-duplicate pair')}`) : ''}`);
  for (const m of run.mods.mods) {
    const r = run.check.results.find((x) => x.mod_id === m.mod_id);
    const review = run.reviews[m.mod_id];
    console.log(`\n${bold(m.mod_id)} ${blue(m.mod_type)} ${statusColor[r.status](r.status.toUpperCase())}${review ? ` ${review.verdict === 'approve' ? green('✓ approved') : red('✗ rejected')}` : ''}  ${bold(m.title)}`);
    console.log(dim(`  ${m.hypothesis}`));
    for (const ch of r.changes) {
      console.log(`  S${ch.scene} ${ch.field}: ${dim(ch.before ?? '(new)')} ${dim('→')} ${ch.after ?? red('(cut)')}`);
    }
    for (const i of r.issues) console.log(`  ${i.severity === 'error' ? red('✗') : yellow('!')} ${i.message}`);
  }
}

export function printCost(run) {
  const calls = run.meta.llm_calls || [];
  if (!calls.length) return;
  const total = runCost(run);
  console.log(dim(`\nLLM: ${calls.map((x) => `${x.step} ${x.model || x.provider}`).join(', ')} · cost ${total ? `$${total.toFixed(3)}` : 'n/a'}`));
}
