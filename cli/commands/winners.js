import { DEFAULTS } from '../../core/config.js';
import * as P from '../../core/pipeline.js';
import * as store from '../../core/store.js';
import { args } from '../args.js';
import { bold, dim, green, yellow, usd, pct, plural, out, table } from '../print.js';

export async function rank() {
  const r = P.winners({ csv: args.csv });
  const top = r.winners.slice(0, Number(args.top) || 12);
  out({ summary: r.summary, winners: top }, () => [
    `${bold('Ads export')} ${r.summary.ads} ads · spend ${usd(r.summary.spend)} · ROMI ${pct(r.summary.romi)} · EGP ${usd(r.summary.egp)} · modifications carry ${pct(r.summary.mod_spend_share)} of spend`,
    `${bold(plural(r.summary.winners, 'winner'))} ${dim(`(spend ≥ $${DEFAULTS.minSpend}, ≥ ${DEFAULTS.minPurchases} purchases, ROMI ≥ ${pct(DEFAULTS.targetRomi)}; sorted by EGP)`)}\n`,
    table(top.map((w, i) => [
      i + 1, bold(w.creative_id), w.kind, w.topic, usd(w.spend), pct(w.romi), usd(w.cpa), usd(w.egp), pct(w.hook_rate, 1), w.mods_in_tree,
      w.topic_burning_out ? yellow(`${w.topic_age_days}d burning`) : `${w.topic_age_days}d`, w.script_file ? green('yes') : dim('paste'),
    ]), ['#', 'creative', 'kind', 'topic', 'spend', 'ROMI', 'CPA', 'EGP', 'hook', 'mods', 'topic age', 'script']),
    dim('\nNext: ad-mod-brief generate <creative_id>'),
  ].join('\n'));
}

export function library() {
  const lib = P.library();
  out(lib, () => [
    bold('Script files'), ...lib.files.map((f) => `  ${f.key.padEnd(22)} ${f.title} ${dim(f.format)}`),
    bold('\nEarlier runs'), ...(lib.runs.length ? lib.runs.map((r) => `  ${r.key.padEnd(28)} ${r.title}`) : [dim('  none')]),
    bold('\nApproved modifications (start the next branch from a winner mod)'), ...(lib.mods.length ? lib.mods.map((m) => `  ${m.key.padEnd(16)} ${m.title} ${dim(`${m.mod_type}, from ${m.parent_id}`)}`) : [dim('  none')]),
    dim('\nUse: ad-mod-brief generate --from <item>'),
  ].join('\n'));
}

export function runs() {
  const list = store.listRuns();
  out(list, () => (list.length ? table(list.map((r) => [r.run_id, r.creative_id, r.status, r.provider, r.created_at.slice(0, 16).replace('T', ' ')]), ['run', 'creative', 'status', 'provider', 'created']) : 'No runs yet.'));
}

export function stats() {
  const st = P.stats();
  const p = (v) => (v === null ? '—' : pct(v));
  const money = (v) => (v === null ? '—' : `$${v.toFixed(3)}`);
  out(st, () => [
    bold('Pilot metrics (from runs + feedback log)'),
    `  runs ${st.runs} · modifications generated ${st.generated} · reviewed ${st.reviewed} · approved ${st.approved}`,
    `  acceptance rate ${bold(p(st.acceptance_rate))} ${dim('(pilot target ≥ 50%)')} · QA pass rate ${p(st.qa_pass_rate)}`,
    `  LLM cost ${money(st.llm_cost_usd)} · per modification ${money(st.cost_per_mod)} · per approved ${money(st.cost_per_approved)}`,
    `  team rules ${st.rules}`,
    '',
    table(Object.entries(st.by_type).map(([t, v]) => [t, v.generated, v.approved, v.rejected, v.approved + v.rejected ? pct(v.approved / (v.approved + v.rejected)) : '—']), ['type', 'generated', 'approved', 'rejected', 'acceptance']),
  ].join('\n'));
}
