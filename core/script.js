import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FIELDS, PATHS } from './config.js';
import { parseCsv } from './csv.js';
import { readDocx } from './sources.js';

const COLUMNS = ['scene', 'time', ...FIELDS];
const HEADER_ALIASES = {
  scene: ['scene', '#', 'no', 'n', 'shot_no', 'scene_no'],
  time: ['time', 'timing', 'timecode', 'sec', 'seconds', 'duration'],
  visual: ['visual', 'visuals', 'video', 'shot', 'action', 'scene_description', 'what_we_see', 'picture'],
  voiceover: ['voiceover', 'vo', 'voice_over', 'voice', 'audio', 'script', 'dialogue', 'spoken'],
  on_screen_text: ['on_screen_text', 'ost', 'text_on_screen', 'on_screen', 'onscreen_text', 'caption', 'captions', 'super', 'text', 'overlay'],
};
const normHeader = (h) => String(h).toLowerCase().trim().replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_#]/g, '');

function mapHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const n = normHeader(c);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(n)) { map[field] = i; break; }
    }
  });
  return map.voiceover !== undefined && (map.visual !== undefined || map.on_screen_text !== undefined) ? map : null;
}

function rowsToScenes(map, rows) {
  return rows
    .map((cells, i) => ({
      scene: Number(String(cells[map.scene] ?? '').replace(/\D/g, '')) || i + 1,
      time: map.time !== undefined ? cells[map.time] ?? '' : '',
      ...Object.fromEntries(FIELDS.map((f) => [f, map[f] !== undefined ? String(cells[map[f]] ?? '').trim() : ''])),
    }))
    .filter((s) => s.visual || s.voiceover || s.on_screen_text);
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}
export function parseScriptTable(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let map = null;
  for (let i = 0; i < lines.length && start === -1; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    map = mapHeader(splitRow(lines[i]));
    if (map) start = i;
  }
  if (start === -1) return null;

  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) break;
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  const scenes = rowsToScenes(map, rows);
  const title = cleanTitle((lines.find((l) => l.startsWith('# ')) || '').replace(/^#\s+/, ''));
  const meta = {};
  for (const l of lines.slice(0, start)) {
    const m = l.match(/^-\s*([a-z_ ]+):\s*(.+)$/i);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return scenes.length ? { title, meta, scenes } : null;
}
export function parseScriptCsv(text) {
  if (!text.includes(',')) return null;
  const rows = parseCsv(text);
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);
  const map = mapHeader(headers);
  if (!map) return null;
  const scenes = rowsToScenes(map, rows.map((r) => headers.map((h) => r[h])));
  return scenes.length ? { title: '', meta: {}, scenes } : null;
}

export function findScriptFile(creativeId, dir = PATHS.scripts) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(String(creativeId))) return null;
  for (const ext of ['.md', '.txt', '.csv', '.docx']) {
    const file = path.join(dir, creativeId + ext);
    if (existsSync(file)) return file;
  }
  return null;
}

export function fileToText(file, buffer = readFileSync(file)) {
  return path.extname(file).toLowerCase() === '.docx' ? readDocx(buffer) : buffer.toString('utf8');
}
export function readScript({ file, text }) {
  const raw = text ?? fileToText(file);
  const script = parseScriptTable(raw) || parseScriptCsv(raw);
  if (!script) return { kind: 'text', text: raw.trim(), raw };
  if (!script.title) script.title = cleanTitle(raw.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('|')) || '').slice(0, 80);
  return { kind: 'table', script, raw };
}
export function cleanTitle(title) {
  return String(title || '')
    .replace(/^C\d+(?:-\w+)?\s*[·:—–-]\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^["“'](.*)["”']$/, '$1')
    .trim();
}

const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');

export function scriptToMarkdown(script) {
  const rows = script.scenes.map((s) => `| ${s.scene} | ${cell(s.time)} | ${cell(s.visual)} | ${cell(s.voiceover)} | ${cell(s.on_screen_text)} |`);
  return [`| ${COLUMNS.join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`, ...rows].join('\n');
}
export function parseTime(time) {
  const m = String(time || '').match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}

export function scriptDuration(script) {
  const ends = script.scenes.map((s) => parseTime(s.time)?.end).filter((v) => v !== undefined);
  return ends.length ? Math.max(...ends) : null;
}
