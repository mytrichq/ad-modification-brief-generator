import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseAds } from '../core/rank.js';
import { fileToText } from '../core/script.js';
import { fetchGoogleDoc } from '../core/sources.js';
import { createServer } from 'node:http';
import path from 'node:path';
import { DEFAULTS, MOD_TYPES, PATHS } from '../core/config.js';
import { exportRun } from '../core/export.js';
import { detectProvider, PROVIDERS } from '../core/llm.js';
import * as P from '../core/pipeline.js';
import * as store from '../core/store.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 15_000_000) throw new Error('Request is too large (max ~10 MB file).');
  }
  return raw ? JSON.parse(raw) : {};
}
function runView(run) {
  return { ...run, cost_usd: P.runCost(run) };
}

export function startServer({ port = 4321, provider: initialProvider } = {}) {
  store.ensureWorkspace();
  let provider = detectProvider(initialProvider);
  let ads = { path: PATHS.csv, name: 'sample export', source: 'sample' };
  let learning = null;
  let learnError = null;
  const backgroundLearn = () => {
    if (learning || P.pendingFeedback() <= 0) return;
    learning = P.learn({ provider })
      .then(() => (learnError = null))
      .catch((e) => (learnError = e.message))
      .finally(() => (learning = null));
  };
  async function scriptInput(b) {
    if (b.library) return { library: b.library };
    if (b.docUrl) return { scriptText: await fetchGoogleDoc(b.docUrl), source: 'Google Doc' };
    if (b.file) {
      const buf = Buffer.from(String(b.file.base64 || ''), 'base64');
      const name = path.basename(String(b.file.name || 'script.txt'));
      return { scriptText: fileToText(name, buf), source: `file ${name}` };
    }
    if (b.scriptText) return { scriptText: String(b.scriptText), source: 'pasted text' };
    throw new Error('Add a script first: paste it, link a Google Doc, upload a file or pick one from the library.');
  }

  const routes = [
    ['GET', /^\/api\/state$/, () => ({
      provider,
      providers: PROVIDERS,
      defaults: { n: DEFAULTS.mods, types: MOD_TYPES },
      rules: store.rulesList(),
      rulesData: store.readRulesData(),
      learn: { running: Boolean(learning), error: learnError, ...store.getLearnState(), pending: P.pendingFeedback() },
      runs: store.listRuns().filter((r) => r.status !== 'needs_normalize').slice(0, 6),
      ads: { name: ads.name, source: ads.source },
    })],
    ['GET', /^\/api\/library$/, () => P.library()],
    ['GET', /^\/api\/item$/, (req) => { const u = new URL(req.url, 'http://localhost'); return P.libraryItem({ type: u.searchParams.get('type'), key: u.searchParams.get('key') }); }],
    ['POST', /^\/api\/extract$/, async (req) => {
      const b = await body(req);
      if (b.sample) {
        const name = path.basename(String(b.sample));
        return { text: fileToText(path.join(PATHS.scripts, name)), name, creativeId: name.split(/[.-]/)[0] };
      }
      const input = await scriptInput(b);
      const name = b.file?.name ? path.basename(String(b.file.name)) : null;
      return { text: input.scriptText, name, source: input.source, creativeId: name?.match(/^C\d+/)?.[0] || null };
    }],
    ['GET', /^\/api\/winners$/, () => {
      const r = P.winners({ csv: ads.path });
      return { ads: { name: ads.name, source: ads.source }, summary: r.summary, winners: r.winners.slice(0, 15) };
    }],
    ['POST', /^\/api\/provider$/, async (req) => {
      provider = detectProvider((await body(req)).provider);
      return { provider };
    }],
    ['POST', /^\/api\/ads$/, async (req) => {
      const b = await body(req);
      if (b.sample) {
        ads = { path: PATHS.csv, name: 'sample export', source: 'sample' };
        return { ok: true };
      }
      parseAds(String(b.csv || ''));
      mkdirSync(path.join(PATHS.workspace, 'uploads'), { recursive: true });
      const file = path.join(PATHS.workspace, 'uploads', `ads-${Date.now()}.csv`);
      writeFileSync(file, String(b.csv));
      ads = { path: file, name: path.basename(String(b.name || 'uploaded.csv')).slice(0, 80), source: 'upload' };
      return { ok: true };
    }],
    ['POST', /^\/api\/runs$/, async (req) => {
      const b = await body(req);
      const input = await scriptInput(b);
      const opts = { provider, csv: ads.path };
      const run = input.library
        ? await P.startFromLibrary(input.library, opts)
        : await P.startRun({ ...opts, creativeId: b.creativeId || undefined, scriptText: input.scriptText, source: input.source });
      return runView(run);
    }],
    ['GET', /^\/api\/runs\/([\w-]+)$/, (req, [id]) => runView(store.loadRun(id))],
    ['POST', /^\/api\/runs\/([\w-]+)\/script$/, async (req, [id]) => runView(P.updateScript(id, (await body(req)).scenes))],
    ['POST', /^\/api\/runs\/([\w-]+)\/dna$/, async (req, [id]) => runView(await P.analyzeDna(id, provider))],
    ['POST', /^\/api\/runs\/([\w-]+)\/fix$/, async (req, [id]) => { const b = await body(req); return runView(P.resolveFix(id, Number(b.index), Boolean(b.apply))); }],
    ['POST', /^\/api\/runs\/([\w-]+)\/locks$/, async (req, [id]) => runView(P.setLocks(id, await body(req)))],
    ['POST', /^\/api\/runs\/([\w-]+)\/mods$/, async (req, [id]) => {
      const b = await body(req);
      return runView(await P.generateMods(id, { provider, n: Number(b.n) || DEFAULTS.mods, types: b.types?.length ? b.types : MOD_TYPES }));
    }],
    ['POST', /^\/api\/runs\/([\w-]+)\/feedback$/, async (req, [id]) => {
      const b = await body(req);
      if (b.verdict === 'undo') return runView(P.undoFeedback(id, b.modId));
      const run = P.recordFeedback(id, b.modId, b.verdict, b.reason || '', b.author || 'ui');
      if (P.isFullyReviewed(run)) backgroundLearn();
      return runView(run);
    }],
    ['POST', /^\/api\/runs\/([\w-]+)\/export$/, async (req, [id]) => {
      const b = await body(req);
      backgroundLearn();
      const run = store.loadRun(id);
      const { files, notes, selection } = exportRun(run, { formats: b.formats || ['pdf', 'md', 'csv', 'html'], only: b.only || 'auto' });
      const urls = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, `/files/${path.relative(PATHS.runs, f).split(path.sep).join('/')}`]));
      return { files: urls, notes, count: selection.mods.length, label: selection.label };
    }],
    ['POST', /^\/api\/learn$/, async () => ({ rules: await P.learn({ provider }) })],
    ['POST', /^\/api\/rules$/, async (req) => {
      const b = await body(req);
      if (b.action === 'add') return store.addManualRule(b.rule, b.why);
      if (b.action === 'remove') return store.removeRule(b.source, b.rule);
      throw new Error('Unknown rules action.');
    }],
  ];
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!allowedHosts.has(req.headers.host)) return send(res, 403, { error: 'Forbidden host' });
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) return send(res, 403, { error: 'Forbidden origin' });
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Expected application/json' });
    }
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'content-type': MIME['.html'] });
        return res.end(readFileSync(path.join(PATHS.ui, 'index.html')));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const file = path.resolve(PATHS.runs, decodeURIComponent(url.pathname.slice('/files/'.length)));
        if (!file.startsWith(PATHS.runs + path.sep) || !existsSync(file)) return send(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        return createReadStream(file).pipe(res);
      }
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) return send(res, 200, await handler(req, m.slice(1)));
      }
      send(res, 404, { error: 'Not found' });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Ad Modification Brief Generator UI → http://localhost:${port}  (provider: ${provider}, workspace: ${PATHS.workspace})`);
  });
  return server;
}
