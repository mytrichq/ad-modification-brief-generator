import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DEFAULTS, FIELDS, MOD_TYPES, PATHS, ROOT } from './config.js';
import { checkPack } from './check.js';
import { complete, detectProvider } from './llm.js';
import { buildPrompt, cellText, planTypes } from './prompts.js';
import { findAd, loadAds, rankWinners } from './rank.js';
import { cleanTitle, findScriptFile, readScript } from './script.js';
import {
  addCost, appendFeedback, ensureWorkspace, getLearnState, listRuns, loadRun, newRunId, readExamples, readFeedback, rulesList,
  saveExample, saveRunPart, setLearnState, writeRules,
} from './store.js';
import { assertValid } from './validate.js';

export const loadBrand = () => JSON.parse(readFileSync(PATHS.brand, 'utf8'));

const WINNER_FIELDS = ['ad_id', 'ad_name', 'topic', 'kind', 'parent_id', 'spend', 'purchases', 'cpa', 'romi', 'egp', 'ctr', 'hook_rate', 'mods_in_tree', 'topic_age_days', 'topic_burning_out', 'is_winner'];

export function winners(opts = {}) {
  return rankWinners(loadAds(opts.csv || PATHS.csv), opts);
}

function saveMeta(run, patch) {
  saveRunPart(run.id, 'meta', { ...loadRun(run.id).meta, ...patch });
}

function sanitizeScenes(scenes) {
  return scenes
    .map((s, i) => ({
      scene: Number(s.scene) || i + 1,
      time: String(s.time ?? ''),
      ...Object.fromEntries(FIELDS.map((f) => [f, String(s[f] ?? '').trim()])),
      ...(['reuse', 'trim', 'new'].includes(s.footage) ? { footage: s.footage } : {}),
    }))
    .sort((a, b) => a.scene - b.scene);
}
const autoId = () => `S-${Date.now().toString(36).slice(-5).toUpperCase()}`;
export async function startRun({ creativeId, scriptFile, scriptText, script: given, source, parentId = null, provider, csv, defer = false }) {
  const id = String(creativeId || '').trim() || autoId();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(id)) {
    throw new Error(`Invalid creative id "${id}". Use letters, digits and dashes, e.g. C014.`);
  }
  ensureWorkspace();
  let ad = null;
  try { ad = findAd(rankWinners(loadAds(csv || PATHS.csv)).ads, id); } catch { ad = null; }

  let parsed;
  let file = null;
  if (given) {
    parsed = { kind: 'table', script: { title: given.title, meta: given.meta || {}, scenes: given.scenes } };
  } else {
    file = scriptText ? null : scriptFile || findScriptFile(id);
    if (!file && !scriptText) throw new Error(`No script found for ${id}. Pass --script <file> or --doc <link>, pipe the text on stdin, or paste it in the UI.`);
    parsed = readScript({ file, text: scriptText });
  }
  const runId = newRunId(id);
  const providerName = detectProvider(provider);
  saveRunPart(runId, 'meta', {
    run_id: runId,
    creative_id: id,
    parent_id: parentId,
    created_at: new Date().toISOString(),
    provider: providerName,
    source: source || (file ? `file ${path.basename(file)}` : scriptText ? 'pasted text' : 'library'),
    script_source: parsed.kind === 'table' ? 'scene table' : 'free text (split into scenes by the LLM)',
    script_file: file ? path.relative(ROOT, file) : null,
    winner: ad ? Object.fromEntries(WINNER_FIELDS.map((k) => [k, ad[k]])) : null,
    status: 'script',
  });

  if (parsed.kind === 'table') {
    saveRunPart(runId, 'script', { ...parsed.script, scenes: sanitizeScenes(parsed.script.scenes) });
    return loadRun(runId);
  }
  saveRunPart(runId, 'source', { text: parsed.text });
  if (defer) {
    saveMeta({ id: runId }, { status: 'needs_normalize' });
    return loadRun(runId);
  }
  const res = await complete(providerName, buildPrompt('normalize', { text: parsed.text }), `${id}/normalize.json`);
  addCost(runId, 'normalize', res.usage);
  return saveNormalized(runId, res.data);
}

export function saveNormalized(runId, data) {
  const run = loadRun(runId);
  assertValid(data, 'normalize');
  saveRunPart(run.id, 'script', { title: cleanTitle(data.title), meta: {}, scenes: sanitizeScenes(data.scenes), normalized_from_text: run.source?.text || true });
  saveMeta(run, { status: 'script' });
  return loadRun(run.id);
}
export function updateScript(runId, scenes) {
  const run = loadRun(runId);
  saveRunPart(run.id, 'script', { ...run.script, scenes: sanitizeScenes(scenes), edited_at: new Date().toISOString() });
  for (const part of ['dna', 'mods', 'check']) {
    const f = path.join(run.dir, `${part}.json`);
    if (existsSync(f)) unlinkSync(f);
  }
  saveMeta(run, { status: 'script' });
  return loadRun(run.id);
}
function applyFixes(run, fixes = []) {
  const suggestions = [];
  for (const f of fixes || []) {
    const s = run.script.scenes.find((x) => x.scene === f.scene);
    if (s && f.text && s[f.field] !== f.text) suggestions.push({ scene: f.scene, field: f.field, before: s[f.field], after: f.text, why: f.why });
  }
  const script = { ...run.script, suggested_fixes: suggestions };
  saveRunPart(run.id, 'script', script);
  return script;
}

export function resolveFix(runId, index, apply) {
  const run = loadRun(runId);
  const list = [...(run.script.suggested_fixes || [])];
  const fix = list[index];
  if (!fix) throw new Error('This suggestion is no longer there.');
  list.splice(index, 1);
  const script = { ...run.script, suggested_fixes: list, scenes: run.script.scenes.map((s) => ({ ...s })) };
  if (apply) {
    script.scenes.find((s) => s.scene === fix.scene)[fix.field] = fix.after;
    script.fixed = [...(run.script.fixed || []), fix];
  }
  saveRunPart(run.id, 'script', script);
  return loadRun(run.id);
}
function completeElements(dna, script) {
  const seen = new Map();
  for (const e of dna.elements) {
    if (cellText(script, e.scene, e.field)) seen.set(`${e.scene}.${e.field}`, e);
  }
  const elements = [];
  for (const s of script.scenes) {
    for (const field of FIELDS) {
      if (!s[field]) continue;
      const id = `${s.scene}.${field}`;
      const e = seen.get(id) || { scene: s.scene, field, role: 'other', lock: false, why: 'Not classified by the model; open for testing.' };
      elements.push({ id, ...e, ai_lock: e.ai_lock ?? e.lock });
    }
  }
  return { ...dna, elements };
}
export async function analyzeDna(runId, provider) {
  const run = loadRun(runId);
  const prompt = buildPrompt('dna', { meta: run.meta, script: run.script, brand: loadBrand() });
  const res = await complete(provider || run.meta.provider, prompt, `${run.meta.creative_id}/dna.json`);
  addCost(run.id, 'dna', res.usage);
  const script = applyFixes(run, res.data.fixes);
  saveRunPart(run.id, 'dna', completeElements(res.data, script));
  saveMeta(run, { status: 'dna' });
  return loadRun(run.id);
}

export function setLocks(runId, { lock = [], unlock = [] }) {
  const run = loadRun(runId);
  if (!run.dna) throw new Error('Run DNA first.');
  const ids = new Set(run.dna.elements.map((e) => e.id));
  for (const id of [...lock, ...unlock]) if (!ids.has(id)) throw new Error(`Unknown element "${id}". Elements look like "3.voiceover".`);
  const elements = run.dna.elements.map((e) => (lock.includes(e.id) ? { ...e, lock: true } : unlock.includes(e.id) ? { ...e, lock: false } : e));
  saveRunPart(run.id, 'dna', { ...run.dna, elements, edited_at: new Date().toISOString() });
  return loadRun(run.id);
}
function nextModNumber(creativeId) {
  let max = 0;
  for (const meta of listRuns().filter((m) => m.creative_id === creativeId)) {
    const mods = loadRun(meta.run_id).mods?.mods || [];
    for (const m of mods) max = Math.max(max, Number(m.mod_id.match(/-AI(\d+)$/)?.[1]) || 0);
  }
  return max + 1;
}
export async function generateMods(runId, { provider, n = DEFAULTS.mods, types = MOD_TYPES } = {}) {
  const run = loadRun(runId);
  if (!run.dna) throw new Error('Run DNA first.');
  await learnIfNeeded({ provider: provider || run.meta.provider }).catch(() => null);
  const prompt = buildPrompt('mods', { meta: run.meta, script: run.script, dna: run.dna, brand: loadBrand(), n, types });
  const res = await complete(provider || run.meta.provider, prompt, `${run.meta.creative_id}/mods.json`);
  addCost(run.id, 'mods', res.usage);
  return saveMods(run.id, res.data, { n, types, provider: res.usage.provider });
}
export function saveMods(runId, data, { n, types, provider }) {
  const run = loadRun(runId);
  assertValid(data, 'mods');
  const start = nextModNumber(run.meta.creative_id);
  const mods = data.mods.map((m, i) => ({
    mod_id: `${run.meta.creative_id}-AI${String(start + i).padStart(2, '0')}`,
    parent_id: run.meta.creative_id,
    ...m,
    scenes: sanitizeScenes(m.scenes),
  }));
  saveRunPart(run.id, 'mods', {
    generated_at: new Date().toISOString(),
    provider,
    plan: planTypes(n ?? mods.length, types ?? MOD_TYPES),
    mods,
  });
  saveMeta(run, { status: 'mods' });
  return runCheck(run.id);
}

export function saveDna(runId, data) {
  const run = loadRun(runId);
  assertValid(data, 'dna');
  saveRunPart(run.id, 'dna', completeElements(data, applyFixes(run, data.fixes)));
  saveMeta(run, { status: 'dna' });
  return loadRun(run.id);
}
export function runCheck(runId) {
  const run = loadRun(runId);
  if (!run.mods) throw new Error('No modifications in this run yet.');
  saveRunPart(run.id, 'check', checkPack({ original: run.script, dna: run.dna, mods: run.mods.mods, brand: loadBrand() }));
  saveMeta(run, { status: 'checked' });
  return loadRun(run.id);
}
export function recordFeedback(runId, modId, verdict, reason = '', author = process.env.USER || 'unknown') {
  const run = loadRun(runId);
  if (!['approve', 'reject'].includes(verdict)) throw new Error('Verdict must be "approve" or "reject".');
  const mod = run.mods?.mods.find((m) => m.mod_id.toLowerCase() === String(modId).toLowerCase());
  if (!mod) throw new Error(`Modification "${modId}" is not in run ${run.id}.`);
  const result = run.check?.results.find((r) => r.mod_id === mod.mod_id);
  const at = new Date().toISOString();

  appendFeedback({
    at, run_id: run.id, mod_id: mod.mod_id, parent_id: mod.parent_id, mod_type: mod.mod_type, title: mod.title,
    hypothesis: mod.hypothesis, changes_summary: mod.changes_summary, qa_status: result?.status, verdict, reason, author,
  });
  saveRunPart(run.id, 'reviews', { ...run.reviews, [mod.mod_id]: { verdict, reason, author, at } });

  const exampleFile = path.join(PATHS.examples, `${mod.mod_id}.json`);
  if (verdict === 'approve') {
    saveExample({
      mod_id: mod.mod_id, parent_id: mod.parent_id, mod_type: mod.mod_type, title: mod.title, hypothesis: mod.hypothesis,
      changes: result?.changes || [], scenes: mod.scenes, direction: mod.direction, read_metric: mod.read_metric,
      production: result?.production, run_id: run.id, reason, approved_at: at,
    });
  } else if (existsSync(exampleFile)) {
    unlinkSync(exampleFile);
  }
  return loadRun(run.id);
}
export function effectiveFeedback() {
  const latest = new Map();
  for (const f of readFeedback()) {
    if (f.verdict === 'undo') latest.delete(f.mod_id);
    else latest.set(f.mod_id, f);
  }
  return [...latest.values()];
}

export function undoFeedback(runId, modId) {
  const run = loadRun(runId);
  const mod = run.mods?.mods.find((m) => m.mod_id === modId);
  if (!mod || !run.reviews[mod.mod_id]) return run;
  appendFeedback({ at: new Date().toISOString(), run_id: run.id, mod_id: mod.mod_id, verdict: 'undo' });
  const { [mod.mod_id]: _, ...rest } = run.reviews;
  saveRunPart(run.id, 'reviews', rest);
  const exampleFile = path.join(PATHS.examples, `${mod.mod_id}.json`);
  if (existsSync(exampleFile)) unlinkSync(exampleFile);
  return loadRun(run.id);
}

export async function learn({ provider } = {}) {
  const feedback = effectiveFeedback().slice(-60);
  if (!feedback.length) throw new Error('No feedback yet. Approve or reject a few modifications first.');
  const prompt = buildPrompt('learn', { feedback });
  const res = await complete(provider, prompt, 'learn.json');
  return saveRules(res.data);
}

export function saveRules(data) {
  assertValid(data, 'learn');
  const before = rulesList();
  const rules = data.rules.slice(0, DEFAULTS.maxRules);
  const feedbackCount = readFeedback().length;
  writeRules(rules, { feedbackCount });
  const known = new Set(before.map((r) => r.replace(/\s*_\(why:.*$/, '')));
  setLearnState({ ...getLearnState(), feedback_count: feedbackCount, at: new Date().toISOString(), rules: rules.length, added: rules.filter((r) => !known.has(r.rule)).length, error: null });
  return rules;
}
export const pendingFeedback = () => readFeedback().length - (getLearnState().feedback_count || 0);

export async function learnIfNeeded({ provider } = {}) {
  return pendingFeedback() > 0 ? learn({ provider }) : null;
}

export function isFullyReviewed(run) {
  return Boolean(run.mods?.mods.length) && run.mods.mods.every((m) => run.reviews[m.mod_id]);
}
export function library() {
  const files = existsSync(PATHS.scripts)
    ? readdirSync(PATHS.scripts).filter((f) => /\.(md|txt|csv|docx)$/i.test(f)).map((f) => {
      const parsed = readScript({ file: path.join(PATHS.scripts, f) });
      const title = parsed.kind === 'table' ? parsed.script.title : cleanTitle(parsed.text.split('\n')[0]).slice(0, 60);
      return { type: 'file', key: f, creative_id: f.split(/[.-]/)[0], title, format: path.extname(f).slice(1) };
    })
    : [];
  const seenMod = new Set();
  const mods = readExamples().filter((e) => e.scenes && !seenMod.has(e.title) && seenMod.add(e.title))
    .map((e) => ({ type: 'mod', key: e.mod_id, creative_id: e.mod_id, parent_id: e.parent_id, title: e.title, mod_type: e.mod_type, date: e.approved_at }));
  const known = new Set([...files.map((f) => f.creative_id), ...readExamples().map((e) => e.mod_id), ...files.map((f) => f.title), ...mods.map((m) => m.title)]);
  const seen = new Set();
  const runs = listRuns().filter((m) => m.status !== 'needs_normalize' && !known.has(m.creative_id) && !seen.has(m.creative_id) && seen.add(m.creative_id)).map((m) => {
    const run = loadRun(m.run_id);
    return run.script && !known.has(run.script.title) ? { type: 'run', key: m.run_id, creative_id: m.creative_id, title: run.script.title, date: m.created_at } : null;
  }).filter(Boolean);
  const demoOk = (id) => existsSync(path.join(PATHS.fixtures, id, 'dna.json'));
  for (const item of [...files, ...runs, ...mods]) item.demo = demoOk(item.creative_id);
  return { files, runs, mods };
}
export function libraryItem({ type, key }) {
  if (type === 'mod') {
    const ex = readExamples().find((e) => e.mod_id === key);
    if (!ex) throw new Error(`Approved variation "${key}" not found.`);
    const runId = ex.run_id || listRuns().find((m) => loadRun(m.run_id).mods?.mods.some((x) => x.mod_id === key))?.run_id;
    const run = runId ? loadRun(runId) : null;
    const mod = run?.mods?.mods.find((x) => x.mod_id === key) || {};
    const res = run?.check?.results.find((x) => x.mod_id === key) || {};
    return { type, key, kind: 'Approved variation', title: ex.title, mod_type: ex.mod_type, parent_id: ex.parent_id, hypothesis: ex.hypothesis,
      read_metric: ex.read_metric || mod.read_metric, direction: ex.direction || mod.direction, production: ex.production || res.production,
      changes: ex.changes, scenes: ex.scenes, reason: ex.reason, approved_at: ex.approved_at, run_id: runId || null, original: run?.script?.scenes || null };
  }
  if (type === 'run') {
    const run = loadRun(key);
    const mods = run.mods?.mods || [];
    const approved = mods.filter((m) => run.reviews[m.mod_id]?.verdict === 'approve').length;
    return { type, key, kind: 'Your script', title: run.script?.title || run.meta.creative_id, creative_id: run.meta.creative_id, created_at: run.meta.created_at,
      status: run.check ? 'review' : run.dna ? 'setup' : 'script', variations: mods.length, reviewed: Object.keys(run.reviews).length, approved, scenes: run.script?.scenes || [] };
  }
  if (type === 'file' || type === 'winner') {
    const ranked = rankWinners(loadAds(PATHS.csv));
    const id = type === 'winner' ? key : path.basename(String(key)).split(/[.-]/)[0];
    const file = type === 'winner' ? findScriptFile(id) : path.join(PATHS.scripts, path.basename(String(key)));
    const ad = findAd(ranked.ads, id);
    const parsed = file && existsSync(file) ? readScript({ file }) : null;
    return { type, key, kind: type === 'winner' ? 'Winner' : 'Example', creative_id: id, file: file ? path.basename(file) : null,
      title: parsed?.kind === 'table' ? parsed.script.title || id : id, scenes: parsed?.kind === 'table' ? parsed.script.scenes : null, text: parsed?.kind === 'text' ? parsed.text : null,
      winner: ad ? { spend: ad.spend, romi: ad.romi, egp: ad.egp, cpa: ad.cpa, hook_rate: ad.hook_rate, topic: ad.topic, topic_age_days: ad.topic_age_days, mods_in_tree: ad.mods_in_tree } : null };
  }
  throw new Error('Unknown item type.');
}

export async function startFromLibrary({ type, key }, opts = {}) {
  if (type === 'file') {
    const file = path.join(PATHS.scripts, path.basename(String(key)));
    if (!existsSync(file)) throw new Error(`Script file "${key}" not found.`);
    return startRun({ ...opts, creativeId: path.basename(file).split(/[.-]/)[0], scriptFile: file });
  }
  if (type === 'run') {
    const prev = loadRun(key);
    return startRun({ ...opts, creativeId: prev.meta.creative_id, script: prev.script, parentId: prev.meta.parent_id, source: `reused from run ${prev.id}` });
  }
  if (type === 'mod') {
    const ex = readExamples().find((e) => e.mod_id === key);
    if (!ex?.scenes) throw new Error(`Approved modification "${key}" not found.`);
    return startRun({ ...opts, creativeId: ex.mod_id, script: { title: ex.title, meta: {}, scenes: ex.scenes }, parentId: ex.parent_id, source: `approved modification ${ex.mod_id}` });
  }
  throw new Error('Library item type must be file, run or mod.');
}

export function runCost(run) {
  return (run.meta.llm_calls || []).reduce((s, c) => s + (c.cost_usd || 0), 0);
}
export function stats() {
  const runs = listRuns().map((m) => loadRun(m.run_id)).filter((r) => r.mods);
  const results = runs.flatMap((r) => r.check?.results || []);
  const latest = new Map(effectiveFeedback().map((f) => [f.mod_id, f]));
  const verdicts = [...latest.values()];
  const approved = verdicts.filter((f) => f.verdict === 'approve').length;
  const cost = runs.reduce((s, r) => s + runCost(r), 0);
  const generated = runs.reduce((s, r) => s + r.mods.mods.length, 0);
  const byType = {};
  for (const r of runs) {
    for (const m of r.mods.mods) {
      const t = (byType[m.mod_type] ||= { generated: 0, approved: 0, rejected: 0 });
      t.generated++;
      const v = latest.get(m.mod_id)?.verdict;
      if (v === 'approve') t.approved++;
      if (v === 'reject') t.rejected++;
    }
  }
  return {
    runs: runs.length,
    generated,
    qa_pass_rate: results.length ? results.filter((r) => r.status !== 'fail').length / results.length : null,
    reviewed: verdicts.length,
    acceptance_rate: verdicts.length ? approved / verdicts.length : null,
    approved,
    llm_cost_usd: cost,
    cost_per_mod: generated ? cost / generated : null,
    cost_per_approved: approved ? cost / approved : null,
    by_type: byType,
    rules: rulesList().length,
  };
}
