import { DEFAULTS, FIELDS } from './config.js';
import { cellText } from './prompts.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}$%]+/gu, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean).length;
function trigrams(text) {
  const s = ` ${norm(text)} `;
  const set = new Set();
  for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
  return set;
}
export function similarity(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
export function diffScript(original, mod) {
  const changes = [];
  const byNum = new Map(mod.scenes.map((s) => [s.scene, s]));
  for (const o of original.scenes) {
    const m = byNum.get(o.scene);
    for (const field of FIELDS) {
      if (!m) {
        if (o[field]) changes.push({ scene: o.scene, field, before: o[field], after: null });
      } else if (norm(o[field]) !== norm(m[field])) {
        changes.push({ scene: o.scene, field, before: o[field] || '', after: m[field] || '' });
      }
    }
  }
  const known = new Set(original.scenes.map((s) => s.scene));
  for (const m of mod.scenes.filter((s) => !known.has(s.scene))) {
    for (const field of FIELDS) if (m[field]) changes.push({ scene: m.scene, field, before: null, after: m[field] });
  }
  return changes;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 };

function offerIssues(text, offer) {
  const issues = [];
  for (const m of text.matchAll(/\$\s?(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:dollars|bucks|usd)\b/gi)) {
    const value = Number(m[1] ?? m[2]);
    if (value !== offer.price_usd) issues.push(`mentions a price of $${value}; the only confirmed price is $${offer.price_usd}`);
  }
  for (const m of text.matchAll(/\b([a-z-]+)\s+dollars\b/gi)) {
    const w = m[1].toLowerCase();
    if (NUMBER_WORDS[w] !== undefined || /^(twenty|thirty|forty|fifty|sixty|ninety)-/.test(w)) {
      if (w !== 'twenty-nine') issues.push(`mentions "${m[0]}"; the only confirmed price is $${offer.price_usd}`);
    }
  }
  const offerContext = /\$|dollars|bucks|price|deliver|subscription|\bbox\b|you get|\bget \d|for just/i.test(text);
  if (!offerContext) return issues;
  for (const m of text.matchAll(/\b(\d+|[a-z]+)\s+pairs\b/gi)) {
    const w = m[1].toLowerCase();
    const value = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w];
    if (value !== undefined && value !== offer.pairs) issues.push(`mentions "${m[0]}"; the offer is ${offer.pairs} pairs`);
  }
  return issues;
}

export function checkMod({ original, mod, dna, brand }) {
  const issues = [];
  const add = (severity, code, message, where = {}) => issues.push({ severity, code, message, ...where });
  const changes = diffScript(original, mod);
  const origTimes = original.scenes.map((s) => `${s.scene}:${s.time}`).join('|');
  const modTimes = mod.scenes.map((s) => `${s.scene}:${s.time}`).join('|');
  if (!changes.length && origTimes === modTimes) add('error', 'no_change', 'Identical to the original: nothing to test.');
  for (const c of changes.filter((c) => c.after && c.field !== 'visual')) {
    for (const rule of brand.banned_claims) {
      const hit = c.after.match(new RegExp(rule.pattern, 'i'));
      if (hit) add('error', `claim_${rule.id}`, `"${hit[0]}": ${rule.reason}`, { scene: c.scene, field: c.field });
    }
    for (const msg of offerIssues(c.after, brand.offer)) add('error', 'offer', msg, { scene: c.scene, field: c.field });
  }
  for (const el of dna.elements.filter((e) => e.lock)) {
    const text = cellText(original, el.scene, el.field);
    if (!text) continue;
    const kept = mod.scenes.some((s) => norm(s[el.field]) === norm(text));
    if (!kept) {
      add(mod.mod_type === 'recut' ? 'warning' : 'error', 'locked_changed',
        `Locked ${el.role} cell changed or dropped: scene ${el.scene} ${el.field}`, { scene: el.scene, field: el.field });
    }
  }
  for (const s of mod.scenes) {
    const n = words(s.on_screen_text);
    if (n > brand.limits.on_screen_text_words_max) {
      add('warning', 'long_text', `On-screen text has ${n} words (max ${brand.limits.on_screen_text_words_max})`, { scene: s.scene, field: 'on_screen_text' });
    }
  }
  const first = mod.scenes[0];
  if (first && words(first.voiceover) > brand.limits.hook_voiceover_words_max) {
    add('warning', 'long_hook', `First spoken line has ${words(first.voiceover)} words (max ${brand.limits.hook_voiceover_words_max})`, { scene: first.scene, field: 'voiceover' });
  }
  const lockedVisual = new Set(dna.elements.filter((e) => e.lock && e.field === 'visual').map((e) => e.scene));
  for (const s of mod.scenes) {
    if (lockedVisual.has(s.scene) && s.footage === 'new') add('warning', 'locked_reshoot', `Scene ${s.scene}'s picture is kept but planned as a new shot`, { scene: s.scene });
  }
  if (mod.mod_type === 'recut' && mod.scenes.some((s) => s.footage === 'new')) add('warning', 'recut_new_shot', 'A re-cut should only use existing footage');
  const changedScenes = [...new Set(changes.map((c) => c.scene))];
  const sceneNums = original.scenes.map((s) => s.scene);
  const opening = sceneNums.slice(0, 2); const lastScene = sceneNums.at(-1);
  if (mod.mod_type === 'hook') {
    const outside = changedScenes.filter((n) => !opening.includes(n));
    if (outside.length) add('warning', 'scope', `A hook test also changes scene ${outside.join(', ')}: the result won't read on the opening alone`);
  }
  if (mod.mod_type === 'ending') {
    const outside = changedScenes.filter((n) => n !== lastScene);
    if (outside.length) add('warning', 'scope', `An ending test also changes scene ${outside.join(', ')}`);
  }
  if (['new_angle', 'new_creator'].includes(mod.mod_type)) {
    const lockedS = new Set(dna.elements.filter((e) => e.lock).map((e) => e.scene));
    const open = sceneNums.filter((n) => !lockedS.has(n) || dna.elements.some((e) => e.scene === n && !e.lock));
    if (open.length && changedScenes.length < Math.ceil(open.length / 2)) add('warning', 'too_small', `Changes only ${changedScenes.length} of ${open.length} open scenes: this won't look like a new ad`);
  }
  const last = mod.scenes.at(-1);
  if (last && !/quiz/i.test(`${last.voiceover} ${last.on_screen_text}`)) add('warning', 'no_quiz_cta', 'The last scene does not send people to the quiz');

  return { changes, issues };
}
export function productionOf(original, mod, changes) {
  const fields = new Set(changes.filter((c) => c.after !== null).map((c) => c.field));
  const cut = changes.some((c) => c.after === null);
  const origTime = new Map(original.scenes.map((s) => [s.scene, s.time]));
  const retimed = cut || mod.scenes.some((s) => s.footage === 'trim' || (origTime.has(s.scene) && origTime.get(s.scene) !== s.time));
  const newShots = mod.scenes.filter((s) => s.footage === 'new' || (!s.footage && changes.some((c) => c.scene === s.scene && c.field === 'visual' && c.after))).map((s) => s.scene);
  const d = mod.direction || {};
  const changedDir = (v) => v && !/same as (the )?original/i.test(v);
  const newVoice = fields.has('voiceover') || changedDir(d.voice) || changedDir(d.talent);
  const tasks = [];
  if (newShots.length) tasks.push(`new shot${newShots.length > 1 ? 's' : ''}: scene ${newShots.join(', ')}`);
  if (newVoice) tasks.push('record VO');
  if (retimed) tasks.push('re-edit timing');
  if (fields.has('on_screen_text') || changedDir(d.captions)) tasks.push('text layers');
  if (changedDir(d.music)) tasks.push('music');
  const reused = mod.scenes.filter((s) => !newShots.includes(s.scene)).length;
  const level = newShots.length ? 'heavy' : newVoice || retimed ? 'medium' : 'light';
  return { level, tasks, reused, total: mod.scenes.length, new_shots: newShots };
}

export function checkPack({ original, dna, mods, brand, threshold = DEFAULTS.similarityThreshold }) {
  const results = mods.map((mod) => {
    const r = checkMod({ original, mod, dna, brand });
    return { mod_id: mod.mod_id, ...r, production: productionOf(original, mod, r.changes) };
  });
  const changedText = results.map((r) => r.changes.map((c) => c.after ?? '').join(' '));
  const duplicates = [];
  let simSum = 0;
  let pairs = 0;
  for (let i = 0; i < mods.length; i++) {
    for (let j = i + 1; j < mods.length; j++) {
      const sim = similarity(changedText[i], changedText[j]);
      simSum += sim;
      pairs++;
      if (sim >= threshold) {
        duplicates.push({ a: mods[i].mod_id, b: mods[j].mod_id, similarity: Number(sim.toFixed(2)) });
        results[j].issues.push({ severity: 'warning', code: 'near_duplicate', message: `Too close to ${mods[i].mod_id} (similarity ${sim.toFixed(2)}): Meta may treat them as one ad` });
      }
    }
  }
  const originalText = original.scenes.map((s) => `${s.voiceover} ${s.on_screen_text}`).join(' ');
  for (const [i, r] of results.entries()) {
    const modText = mods[i].scenes.map((s) => `${s.voiceover} ${s.on_screen_text}`).join(' ');
    r.similarity_to_original = Number(similarity(originalText, modText).toFixed(2));
    r.status = r.issues.some((x) => x.severity === 'error') ? 'fail' : r.issues.length ? 'warn' : 'pass';
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    checked_at: new Date().toISOString(),
    summary: {
      total: results.length,
      pass: count('pass'),
      warn: count('warn'),
      fail: count('fail'),
      diversity: pairs ? Number((1 - simSum / pairs).toFixed(2)) : 1,
      near_duplicates: duplicates.length,
    },
    duplicates,
    results,
  };
}
