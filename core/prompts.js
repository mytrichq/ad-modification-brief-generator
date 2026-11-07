import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULTS, MOD_TYPES, PATHS, TYPE_WEIGHTS } from './config.js';
import { scriptToMarkdown } from './script.js';
import { getLearnState, readExamples, readRulesData, rulesList } from './store.js';
import { loadSchema } from './validate.js';

const template = (name) => readFileSync(path.join(PATHS.prompts, `${name}.md`), 'utf8');
const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? `{{${k}}}`));

export function brandBlock(brand) {
  return [
    `Product: ${brand.product}`,
    `Audience: ${brand.audience}`,
    `Funnel: ${brand.funnel}`,
    'Facts you may state:',
    ...brand.facts.map((f) => `- ${f}`),
    `Offer: ${brand.offer.say_it_like.join(' / ')}, then ${brand.offer.cadence}.`,
    `Tone: ${brand.tone}`,
  ].join('\n');
}
export function planTypes(n, types = MOD_TYPES) {
  const chosen = types.filter((t) => MOD_TYPES.includes(t));
  if (!chosen.length) throw new Error(`Unknown modification types. Use: ${MOD_TYPES.join(', ')}`);
  const weightSum = chosen.reduce((s, t) => s + TYPE_WEIGHTS[t], 0);
  const plan = chosen.map((t) => ({ type: t, exact: (n * TYPE_WEIGHTS[t]) / weightSum }));
  plan.forEach((p) => (p.count = Math.floor(p.exact)));
  let left = n - plan.reduce((s, p) => s + p.count, 0);
  for (const p of [...plan].sort((a, b) => b.exact - b.count - (a.exact - a.count))) {
    if (left-- <= 0) break;
    p.count++;
  }
  return plan.filter((p) => p.count > 0).map(({ type, count }) => ({ type, count }));
}

export const cellText = (script, scene, field) => script.scenes.find((s) => s.scene === scene)?.[field] ?? '';

function elementLines(dna, script, lock) {
  const lines = dna.elements
    .filter((e) => e.lock === lock)
    .map((e) => `- scene ${e.scene} ${e.field}: "${cellText(script, e.scene, e.field)}" (${e.role}: ${e.why})`);
  return lines.length ? lines.join('\n') : '- none';
}

function examplesBlock(types) {
  const all = readExamples();
  const preferred = [...all.filter((e) => types.includes(e.mod_type)), ...all.filter((e) => !types.includes(e.mod_type))];
  const picked = preferred.slice(0, DEFAULTS.maxExamples);
  if (!picked.length) return 'None yet.';
  return picked
    .map((e) => [
      `### ${e.mod_type}: "${e.title}" (modification of ${e.parent_id})`,
      `Hypothesis: ${e.hypothesis}`,
      'Changed:',
      ...e.changes.map((c) => `- scene ${c.scene} ${c.field}: "${c.before ?? ''}" → "${c.after ?? '(removed)'}"`),
      e.reason ? `Reviewer: ${e.reason}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n');
}

export function buildPrompt(step, ctx) {
  const system = template('system');
  const schema = loadSchema(step);
  const brand = ctx.brand;
  let user;

  if (step === 'normalize') {
    user = fill(template('normalize'), { text: ctx.text });
  } else if (step === 'dna') {
    user = fill(template('dna'), {
      creative_id: ctx.meta.creative_id,
      title: ctx.script.title || ctx.meta.creative_id,
      script_table: scriptToMarkdown(ctx.script),
      brand: brandBlock(brand),
      mod_types: MOD_TYPES.join(', '),
    });
  } else if (step === 'mods') {
    const plan = planTypes(ctx.n, ctx.types);
    user = fill(template('generate'), {
      n: String(ctx.n),
      creative_id: ctx.meta.creative_id,
      title: ctx.script.title || ctx.meta.creative_id,
      script_table: scriptToMarkdown(ctx.script),
      dna_summary: `${ctx.dna.summary}\nAngle: ${ctx.dna.angle}. Pain: ${ctx.dna.pain_point}. Emotion: ${ctx.dna.emotional_trigger}. Proof: ${ctx.dna.proof}.`,
      locked: elementLines(ctx.dna, ctx.script, true),
      open: elementLines(ctx.dna, ctx.script, false),
      brand: brandBlock(brand),
      rules: rulesList().map((r) => `- ${r}`).join('\n') || 'None yet.',
      examples: examplesBlock(plan.map((p) => p.type)),
      type_plan: plan.map((p) => `${p.count}× ${p.type}`).join(', '),
      ost_max: String(brand.limits.on_screen_text_words_max),
      hook_max: String(brand.limits.hook_voiceover_words_max),
    });
  } else if (step === 'learn') {
    user = fill(template('learn'), {
      rules: readRulesData().learned.map((r, i) => `${i + 1}. ${r.rule}`).join('\n') || 'None yet.',
      manual: readRulesData().manual.map((r) => `- ${r.rule}`).join('\n') || 'None.',
      removed: (getLearnState().removed || []).map((r) => `- ${r}`).join('\n') || 'None.',
      feedback: ctx.feedback
        .map((f) => `- ${f.verdict.toUpperCase()} ${f.mod_id} (${f.mod_type}, "${f.title}"): ${f.reason || 'no note'}\n  changed: ${f.changes_summary}`)
        .join('\n'),
      max_rules: String(DEFAULTS.maxRules),
    });
  } else {
    throw new Error(`Unknown step "${step}". Use normalize, dna, mods or learn.`);
  }
  return { step, system, user, schema };
}
