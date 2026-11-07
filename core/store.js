import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

export function ensureWorkspace() {
  for (const dir of [PATHS.workspace, PATHS.runs, PATHS.examples]) mkdirSync(dir, { recursive: true });
  if (!existsSync(PATHS.rules)) writeFileSync(PATHS.rules, '# Team rules\n\n## Written by the team\n\n_None yet._\n\n## Learned from reviews\n\n_None yet. They appear automatically after the first review round._\n');
  if (!existsSync(PATHS.feedback)) writeFileSync(PATHS.feedback, '');
}

const readJson = (file, fallback = null) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

export function newRunId(creativeId) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${creativeId}-${stamp}`;
}

export function runDir(runId) {
  return path.join(PATHS.runs, runId);
}

export function listRuns() {
  ensureWorkspace();
  return readdirSync(PATHS.runs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(PATHS.runs, d.name, 'meta.json')))
    .map((d) => readJson(path.join(PATHS.runs, d.name, 'meta.json')))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function resolveRunId(runId) {
  if (runId && runId !== 'latest') {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(String(runId))) throw new Error(`Run "${runId}" not found. See \`ad-mod-brief runs\`.`);
    if (!existsSync(path.join(runDir(runId), 'meta.json'))) throw new Error(`Run "${runId}" not found. See \`ad-mod-brief runs\`.`);
    return runId;
  }
  const latest = listRuns()[0];
  if (!latest) throw new Error('No runs yet. Start one with `ad-mod-brief generate <creative_id>`.');
  return latest.run_id;
}

export function loadRun(runId) {
  const id = resolveRunId(runId);
  const dir = runDir(id);
  const part = (name) => readJson(path.join(dir, `${name}.json`));
  return {
    id,
    dir,
    meta: part('meta'),
    source: part('source'),
    script: part('script'),
    dna: part('dna'),
    mods: part('mods'),
    check: part('check'),
    reviews: part('reviews') || {},
  };
}

export function saveRunPart(runId, name, data) {
  const dir = runDir(runId);
  mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, `${name}.json`), data);
}

export function addCost(runId, step, usage) {
  if (!usage) return;
  const metaFile = path.join(runDir(runId), 'meta.json');
  const meta = readJson(metaFile);
  meta.llm_calls = [...(meta.llm_calls || []), { step, ...usage, at: new Date().toISOString() }];
  writeJson(metaFile, meta);
}

export function appendFeedback(entry) {
  ensureWorkspace();
  appendFileSync(PATHS.feedback, JSON.stringify(entry) + '\n');
}

export function readFeedback() {
  ensureWorkspace();
  return readFileSync(PATHS.feedback, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function readRules() {
  ensureWorkspace();
  return readFileSync(PATHS.rules, 'utf8');
}
const MANUAL_H = '## Written by the team';
const LEARNED_H = '## Learned from reviews';

export function readRulesData() {
  const data = { manual: [], learned: [] };
  let section = 'learned';
  for (const line of readRules().split('\n')) {
    if (line.startsWith(MANUAL_H)) section = 'manual';
    else if (line.startsWith(LEARNED_H)) section = 'learned';
    else if (/^\d+\.\s/.test(line)) {
      const text = line.replace(/^\d+\.\s*/, '');
      const m = text.match(/^(.*?)\s*_\(why: (.*)\)_$/);
      data[section].push(m ? { rule: m[1], why: m[2] } : { rule: text, why: '' });
    }
  }
  return data;
}

function writeRulesData({ manual, learned }, note) {
  ensureWorkspace();
  const item = (r, i) => `${i + 1}. ${r.rule}${r.why ? ` _(why: ${r.why})_` : ''}`;
  writeFileSync(PATHS.rules, [
    '# Team rules',
    '',
    `_${note || 'Added to every generation prompt.'} Edit by hand if needed: git keeps the history._`,
    '',
    MANUAL_H, '', ...(manual.length ? manual.map(item) : ['_None yet._']), '',
    LEARNED_H, '', ...(learned.length ? learned.map(item) : ['_None yet. They appear automatically after the first review round._']), '',
  ].join('\n'));
}
export function rulesList() {
  const { manual, learned } = readRulesData();
  return [...manual, ...learned].map((r) => (r.why ? `${r.rule} _(why: ${r.why})_` : r.rule));
}

export function writeRules(rules, meta = {}) {
  const { manual } = readRulesData();
  writeRulesData({ manual, learned: rules }, `Learned rules distilled from ${meta.feedbackCount ?? '?'} review notes on ${new Date().toISOString().slice(0, 10)}. Added to every generation prompt.`);
}

export function addManualRule(rule, why = '') {
  const text = String(rule || '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('Write the rule first.');
  const data = readRulesData();
  data.manual.push({ rule: text.slice(0, 300), why: String(why || '').trim().slice(0, 200) });
  writeRulesData(data);
  return readRulesData();
}
export function removeRule(source, rule) {
  const data = readRulesData();
  if (!['manual', 'learned'].includes(source)) throw new Error('Unknown rule group.');
  data[source] = data[source].filter((r) => r.rule !== rule);
  writeRulesData(data);
  if (source === 'learned') {
    const st = getLearnState();
    setLearnState({ ...st, removed: [...new Set([...(st.removed || []), rule])].slice(-50) });
  }
  return readRulesData();
}

const learnStateFile = () => path.join(PATHS.workspace, 'learn-state.json');
export const getLearnState = () => readJson(learnStateFile(), {});
export const setLearnState = (state) => { ensureWorkspace(); writeJson(learnStateFile(), state); };

export function saveExample(example) {
  ensureWorkspace();
  writeJson(path.join(PATHS.examples, `${example.mod_id}.json`), example);
}

export function readExamples() {
  ensureWorkspace();
  return readdirSync(PATHS.examples)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(PATHS.examples, f)))
    .sort((a, b) => (a.approved_at < b.approved_at ? 1 : -1));
}
