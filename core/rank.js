import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.js';
import { DEFAULTS, PATHS } from './config.js';
import { findScriptFile } from './script.js';
const NAME_RE = /^SL_(?<topic>[a-z0-9-]+)_(?<id>C\d+(?:-M\d+)*)_(?<kind>orig|mod)(?:_(?<parent>C\d+(?:-M\d+)*))?$/i;

const num = (v) => Number(String(v ?? '').replace(/[$€£,\s]/g, '')) || 0;
const COLUMNS = {
  name: ['ad name', 'ad', 'creative', 'creative name', 'ad_name'],
  id: ['ad id', 'ad_id'],
  spend: ['amount spent (usd)', 'amount spent', 'spend', 'cost', 'ad spend', 'spend (usd)'],
  purchases: ['purchases', 'website purchases', 'results', 'conversions', 'orders'],
  impressions: ['impressions', 'impr'],
  clicks: ['link clicks', 'clicks', 'outbound clicks', 'clicks (all)'],
  plays3s: ['3-second video plays', '3 second video plays', 'video plays at 3s', 'thumbstops'],
  starts: ['starts', 'ad start', 'launch date', 'created'],
  reportEnd: ['reporting ends', 'date end', 'end date'],
};
const normKey = (k) => String(k).toLowerCase().replace(/\s+/g, ' ').trim();

export function mapColumns(headers) {
  const byNorm = new Map(headers.map((h) => [normKey(h), h]));
  return Object.fromEntries(Object.entries(COLUMNS).map(([field, aliases]) => [field, aliases.map((a) => byNorm.get(a)).find(Boolean) || null]));
}

const REQUIRED = { name: 'ad name', spend: 'amount spent', purchases: 'purchases' };

export function parseAdName(name) {
  const m = String(name).match(NAME_RE);
  if (m) {
    const { topic, id, kind, parent } = m.groups;
    return { topic, creative_id: id, kind: kind.toLowerCase(), parent_id: parent || null };
  }
  const id = String(name).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ad';
  return { topic: 'unknown', creative_id: id, kind: 'orig', parent_id: null };
}

export function adMetrics(row, ltv = DEFAULTS.ltv, cols = mapColumns(Object.keys(row))) {
  const get = (field) => (cols[field] ? row[cols[field]] ?? '' : '');
  const spend = num(get('spend'));
  const impressions = num(get('impressions'));
  const clicks = num(get('clicks'));
  const plays3s = num(get('plays3s'));
  const purchases = num(get('purchases'));
  const romi = spend > 0 ? (purchases * ltv) / spend : 0;
  return {
    ad_id: get('id'),
    ad_name: get('name'),
    ...parseAdName(get('name')),
    starts: get('starts') || row['Reporting starts'] || '',
    report_end: get('reportEnd'),
    spend,
    impressions,
    clicks,
    purchases,
    ctr: impressions ? clicks / impressions : 0,
    hook_rate: impressions ? plays3s / impressions : 0,
    cpa: purchases ? spend / purchases : null,
    romi,
    egp: spend * (romi - 1),
  };
}

export function parseAds(csvText, ltv = DEFAULTS.ltv) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('The CSV is empty.');
  const cols = mapColumns(Object.keys(rows[0]));
  const missing = Object.entries(REQUIRED).filter(([f]) => !cols[f]).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`The CSV has no ${missing.join(', ')} column. Needed: ad name, amount spent, purchases (impressions, link clicks and 3-second video plays are optional). In Meta Ads Manager: Ads tab → pick the date range → Export table data → CSV.`);
  }
  const isTotal = (name) => !name || /^(totals?|grand total|results from|summary)\b/i.test(name);
  return rows.filter((r) => !isTotal(String(r[cols.name] || '').trim())).map((row) => adMetrics(row, ltv, cols));
}

export function loadAds(csvPath = PATHS.csv, ltv = DEFAULTS.ltv) {
  return parseAds(readFileSync(csvPath, 'utf8'), ltv);
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

export function rankWinners(ads, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const reportEnd = ads.map((a) => a.report_end).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);

  const topicStart = {};
  for (const a of ads) {
    if (a.starts && (!topicStart[a.topic] || a.starts < topicStart[a.topic])) topicStart[a.topic] = a.starts;
  }
  const childCount = {};
  for (const a of ads) if (a.parent_id) childCount[a.parent_id] = (childCount[a.parent_id] || 0) + 1;

  const enriched = ads.map((a) => {
    const topicAgeDays = topicStart[a.topic] ? daysBetween(topicStart[a.topic], reportEnd) : null;
    return {
      ...a,
      mods_in_tree: childCount[a.creative_id] || 0,
      topic_age_days: topicAgeDays,
      topic_burning_out: topicAgeDays !== null && topicAgeDays > o.topicLifeDays,
      script_file: findScriptFile(a.creative_id, o.scriptsDir),
      is_winner: a.spend >= o.minSpend && a.purchases >= o.minPurchases && a.romi >= o.targetRomi,
    };
  });

  const winners = enriched.filter((a) => a.is_winner).sort((a, b) => b.egp - a.egp);
  const total = ads.reduce((s, a) => ({ spend: s.spend + a.spend, purchases: s.purchases + a.purchases }), { spend: 0, purchases: 0 });
  const mods = ads.filter((a) => a.kind === 'mod');
  const modSpend = mods.reduce((s, a) => s + a.spend, 0);
  return {
    report_end: reportEnd,
    summary: {
      ads: ads.length,
      spend: total.spend,
      purchases: total.purchases,
      cpa: total.purchases ? total.spend / total.purchases : null,
      romi: total.spend ? (total.purchases * o.ltv) / total.spend : 0,
      egp: total.purchases * o.ltv - total.spend,
      mods: mods.length,
      mod_spend_share: total.spend ? modSpend / total.spend : 0,
      winners: winners.length,
    },
    winners,
    ads: enriched,
  };
}

export function findAd(ads, creativeId) {
  return ads.find((a) => a.creative_id.toLowerCase() === String(creativeId).toLowerCase()) || null;
}
