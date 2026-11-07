#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toCsv } from '../core/csv.js';

let seed = 20261104;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + (b - a) * rand();
const jitter = (x, pct) => x * between(1 - pct, 1 + pct);

const REPORT_START = '2026-10-05';
const REPORT_END = '2026-11-03';
const TOPICS = {
  'laundry-monster': '2026-08-24',
  'sock-graveyard': '2026-09-14',
  'morning-rush': '2026-09-21',
  'kids-chaos': '2026-10-05',
  'gift-for-dad': '2026-10-19',
};
const WINNERS = [
  ['C014', 'laundry-monster', 21500, 1.12, 11],
  ['C009', 'sock-graveyard', 14200, 1.0, 8],
  ['C031', 'morning-rush', 12800, 1.05, 6],
  ['C022', 'kids-chaos', 9600, 1.08, 4],
  ['C045', 'gift-for-dad', 3100, 1.02, 0],
];

const rows = [];
let adId = 120214500000000;

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ad({ name, starts, spend, quality }) {
  const impressions = Math.round((spend / jitter(12, 0.08)) * 1000);
  const ctr = jitter(0.012, 0.1) * Math.sqrt(quality);
  const clicks = Math.round(impressions * ctr);
  const cr = jitter(0.02, 0.06) * Math.sqrt(quality);
  const purchases = Math.round(clicks * cr);
  const hookRate = jitter(0.27, 0.25) * Math.sqrt(quality);
  rows.push({
    'Ad ID': String(adId++),
    'Ad name': name,
    'Reporting starts': REPORT_START,
    'Reporting ends': REPORT_END,
    'Starts': starts,
    'Amount spent (USD)': spend.toFixed(2),
    'Impressions': impressions,
    'Link clicks': clicks,
    '3-second video plays': Math.round(impressions * hookRate),
    'Purchases': purchases,
  });
}

let loserN = 50;
for (const [id, topic, spend, quality, mods] of WINNERS) {
  const topicStart = TOPICS[topic];
  ad({ name: `SL_${topic}_${id}_orig`, starts: addDays(topicStart, 1), spend, quality });
  for (let m = 1; m <= mods; m++) {
    const modId = `${id}-M${String(m).padStart(2, '0')}`;
    ad({
      name: `SL_${topic}_${modId}_mod_${id}`,
      starts: addDays(topicStart, 4 + m * 3),
      spend: Math.round(between(900, 9000)),
      quality: quality * between(0.72, 1.06),
    });
  }
}
for (const topic of Object.keys(TOPICS)) {
  for (let i = 0; i < 6; i++) {
    ad({
      name: `SL_${topic}_C${String(loserN++).padStart(3, '0')}_orig`,
      starts: addDays(TOPICS[topic], Math.round(between(0, 14))),
      spend: Math.round(between(90, 700)),
      quality: between(0.35, 0.95),
    });
  }
}

const out = fileURLToPath(new URL('./ads.csv', import.meta.url));
writeFileSync(out, toCsv(rows));
const total = rows.reduce((s, r) => s + Number(r['Amount spent (USD)']), 0);
const purchases = rows.reduce((s, r) => s + r.Purchases, 0);
console.log(`${rows.length} ads, spend $${Math.round(total)}, purchases ${purchases}, CPA $${(total / purchases).toFixed(2)}, ROMI ${((purchases * 68 / total) * 100).toFixed(0)}% → ${out}`);
