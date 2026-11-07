import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkMod, checkPack, diffScript, similarity } from '../core/check.js';
import { parseCsv, toCsv } from '../core/csv.js';
import { planTypes } from '../core/prompts.js';
import { adMetrics, parseAdName, rankWinners } from '../core/rank.js';
import { cleanTitle, parseScriptTable, parseTime } from '../core/script.js';
import { validate, loadSchema } from '../core/validate.js';

const brand = JSON.parse(readFileSync(new URL('../data/brand.json', import.meta.url)));
const original = parseScriptTable(readFileSync(new URL('./fixtures/winner.md', import.meta.url), 'utf8'));
const dna = {
  elements: [
    { scene: 3, field: 'voiceover', role: 'mechanism', lock: true, why: '' },
    { scene: 5, field: 'on_screen_text', role: 'offer', lock: true, why: '' },
    { scene: 1, field: 'voiceover', role: 'hook', lock: false, why: '' },
  ],
};
const withHook = (vo, ost = 'Where do the socks GO?') => ({
  mod_id: 'X', mod_type: 'hook',
  scenes: original.scenes.map((s) => (s.scene === 1 ? { ...s, voiceover: vo, on_screen_text: ost } : s)),
});

test('csv: quotes, commas, BOM round-trip', () => {
  const rows = [{ a: 'x, "y"', b: 'line\nbreak' }];
  assert.deepEqual(parseCsv('﻿' + toCsv(rows)), rows);
});

test('rank: ad name convention and ROMI from LTV', () => {
  assert.deepEqual(parseAdName('SL_kids-chaos_C022-M03_mod_C022'), { topic: 'kids-chaos', creative_id: 'C022-M03', kind: 'mod', parent_id: 'C022' });
  const m = adMetrics({ 'Ad name': 'SL_t_C1_orig', 'Amount spent (USD)': '1000', Purchases: '20', Impressions: '1000' }, 68);
  assert.equal(m.romi, 1.36);
  assert.equal(Math.round(m.egp), 360);
});

test('rank: winners need spend, purchases and ROMI over the floor', () => {
  const ads = [
    adMetrics({ 'Ad name': 'SL_t_C1_orig', 'Amount spent (USD)': '5000', Purchases: '110', 'Reporting ends': '2026-11-03' }),
    adMetrics({ 'Ad name': 'SL_t_C2_orig', 'Amount spent (USD)': '500', Purchases: '15', 'Reporting ends': '2026-11-03' }),
    adMetrics({ 'Ad name': 'SL_t_C3_orig', 'Amount spent (USD)': '5000', Purchases: '80', 'Reporting ends': '2026-11-03' }),
  ];
  assert.deepEqual(rankWinners(ads).winners.map((w) => w.creative_id), ['C1']);
});

test('script: table parsing, titles and times', () => {
  assert.equal(original.scenes.length, 6);
  assert.equal(original.title, 'The Sock Monster');
  assert.equal(parseScriptTable('Just some free text about socks'), null);
  assert.deepEqual(parseTime('19-24s'), { start: 19, end: 24 });
  assert.equal(cleanTitle('C031 — "7:52 AM" (UGC, ~25 sec)'), '7:52 AM');
});

test('check: a clean hook modification passes', () => {
  const r = checkMod({ original, mod: withHook('Be honest: how many single socks are in your drawer?'), dna, brand });
  assert.equal(r.changes.length, 1);
  assert.deepEqual(r.issues, []);
});

test('check: banned claims and a wrong price are errors', () => {
  const r = checkMod({ original, mod: withHook('Guaranteed to never lose a sock, now just $19!'), dna, brand });
  const codes = r.issues.map((i) => i.code);
  assert.ok(codes.includes('claim_absolute'));
  assert.ok(codes.includes('offer'));
});

test('check: "0 pairs" in a story is not an offer claim, "3 pairs for $29" is', () => {
  assert.deepEqual(checkMod({ original, mod: withHook('Three kids, 0 pairs that match.'), dna, brand }).issues, []);
  assert.ok(checkMod({ original, mod: withHook('Get 3 pairs for $29 today.'), dna, brand }).issues.some((i) => i.code === 'offer'));
});

test('check: changing a locked cell fails, unchanged mod fails', () => {
  const mod = { mod_id: 'X', mod_type: 'hook', scenes: original.scenes.map((s) => (s.scene === 3 ? { ...s, voiceover: 'Magnets!' } : s)) };
  assert.ok(checkMod({ original, mod, dna, brand }).issues.some((i) => i.code === 'locked_changed'));
  assert.ok(checkMod({ original, mod: { mod_id: 'Y', mod_type: 'hook', scenes: original.scenes }, dna, brand }).issues.some((i) => i.code === 'no_change'));
});

test('check: near-duplicates are flagged across the pack', () => {
  const mods = [
    { ...withHook('My washer ate 52 socks this year. I counted them all.'), mod_id: 'A' },
    { ...withHook('My washer ate 53 socks this year. I counted them all.'), mod_id: 'B' },
    { ...withHook('Be honest: how many single socks are in your drawer?'), mod_id: 'C' },
  ];
  const pack = checkPack({ original, dna, mods, brand });
  assert.deepEqual(pack.duplicates.map((d) => [d.a, d.b]), [['A', 'B']]);
  assert.ok(similarity('abc def', 'abc def') === 1);
});

test('diff: cut scenes are reported', () => {
  const cut = { scenes: original.scenes.filter((s) => s.scene !== 2) };
  assert.ok(diffScript(original, cut).every((c) => c.scene === 2 && c.after === null));
});

test('prompts: type plan spreads n across types by weight', () => {
  const plan = planTypes(10);
  assert.equal(plan.reduce((s, p) => s + p.count, 0), 10);
  assert.equal(plan.find((p) => p.type === 'hook').count, 3);
  assert.equal(plan.find((p) => p.type === 'new_creator').count, 2);
  assert.deepEqual(planTypes(3, ['recut']), [{ type: 'recut', count: 3 }]);
});

test('fixtures: every recorded LLM answer matches its schema', () => {
  for (const [file, schema] of [['C014/dna.json', 'dna'], ['C014/mods.json', 'mods'], ['learn.json', 'learn']]) {
    const data = JSON.parse(readFileSync(new URL(`../data/demo/${file}`, import.meta.url)));
    assert.deepEqual(validate(data, loadSchema(schema)), [], file);
  }
});

test('sources: Word table, scene CSV and header aliases become scene tables', async () => {
  const { readScript, parseScriptCsv } = await import('../core/script.js');
  const docx = readScript({ file: new URL('../data/scripts/C022-brief.docx', import.meta.url).pathname });
  assert.equal(docx.kind, 'table');
  assert.equal(docx.script.title, 'Three Kids, Zero Pairs');
  assert.equal(docx.script.scenes[0].voiceover, 'Three kids. Zero matching socks. Every single morning.');
  const csv = parseScriptCsv('Scene,Timing,Shot,VO,Caption\n1,0-3s,"Sock, alone",Where are you?,One sock\n');
  assert.deepEqual(csv.scenes[0], { scene: 1, time: '0-3s', visual: 'Sock, alone', voiceover: 'Where are you?', on_screen_text: 'One sock' });
});

test('ads: other column names work, missing columns explain what is needed', async () => {
  const { parseAds } = await import('../core/rank.js');
  const ads = parseAds('Ad,Cost,Conversions\nSpring promo A,"$1,000.00",20\nTotals,,\n');
  assert.equal(ads.length, 1);
  assert.equal(ads[0].creative_id, 'Spring-promo-A');
  assert.equal(ads[0].romi, 1.36);
  assert.throws(() => parseAds('Campaign,Clicks\nX,5\n'), /ad name, amount spent, purchases/);
});

test('production: text-only is light, new VO medium, new visual heavy', () => {
  const light = withHook('My washing machine has eaten 47 socks this year. I counted.', 'Single socks: 47');
  assert.equal(checkPack({ original, dna, mods: [light], brand }).results[0].production.level, 'light');
  const medium = withHook('Be honest: how many single socks are in your drawer?');
  assert.equal(checkPack({ original, dna, mods: [medium], brand }).results[0].production.level, 'medium');
  const heavy = { ...medium, scenes: medium.scenes.map((s) => (s.scene === 1 ? { ...s, visual: 'Inside the drum' } : s)) };
  const p = checkPack({ original, dna, mods: [heavy], brand }).results[0].production;
  assert.equal(p.level, 'heavy');
  assert.deepEqual(p.tasks, ['new shot: scene 1', 'record VO']);
  assert.equal(p.reused, 5);
  const trimmed = { ...light, scenes: light.scenes.map((s) => (s.scene === 2 ? { ...s, footage: 'trim', time: '3-5s' } : { ...s, footage: 'reuse' })) };
  assert.equal(checkPack({ original, dna, mods: [trimmed], brand }).results[0].production.level, 'medium');
});

test('scope: a hook that also touches the ending is flagged', () => {
  const mod = withHook('Be honest: how many single socks are in your drawer?');
  mod.scenes = mod.scenes.map((s) => (s.scene === 6 ? { ...s, on_screen_text: 'Find your size →' } : s));
  assert.ok(checkMod({ original, mod, dna, brand }).issues.some((i) => i.code === 'scope'));
});
