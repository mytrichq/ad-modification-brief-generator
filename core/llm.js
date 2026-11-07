import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PATHS } from './config.js';
import { validate } from './validate.js';

export const PROVIDERS = ['anthropic', 'openai', 'claude-code', 'demo'];
const PRICES = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

function hasClaudeCli() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  return r.status === 0;
}

export function detectProvider(explicit) {
  if (explicit) {
    if (!PROVIDERS.includes(explicit)) throw new Error(`Unknown provider "${explicit}". Use: ${PROVIDERS.join(', ')}`);
    return explicit;
  }
  if (process.env.AMB_PROVIDER) return detectProvider(process.env.AMB_PROVIDER);
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (hasClaudeCli()) return 'claude-code';
  return 'demo';
}

function finish(provider, data, schema, usage) {
  const errors = validate(data, schema);
  if (errors.length) throw new Error(`${provider} returned JSON that does not match the schema:\n  ${errors.slice(0, 8).join('\n  ')}`);
  return { data, usage: { provider, ...usage } };
}

async function anthropic({ system, user, schema }) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema } },
      fallbacks: 'default',
    }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${body.error?.message || JSON.stringify(body)}`);
  if (body.stop_reason === 'refusal') throw new Error(`The model declined the request (${body.stop_details?.category || 'no category'}).`);
  if (body.stop_reason === 'max_tokens') throw new Error('The answer was cut off at max_tokens. Try fewer modifications (--n).');
  const text = body.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const [inPrice, outPrice] = PRICES[body.model] || PRICES[model] || [0, 0];
  const u = body.usage || {};
  return finish('anthropic', JSON.parse(text), schema, {
    model: body.model,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cost_usd: ((u.input_tokens || 0) * inPrice + (u.output_tokens || 0) * outPrice) / 1e6,
  });
}

async function openai({ system, user, schema, step }) {
  const model = process.env.OPENAI_MODEL || 'gpt-5';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: { name: step, schema, strict: true } },
    }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${body.error?.message || JSON.stringify(body)}`);
  const msg = body.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`The model declined the request: ${msg.refusal}`);
  return finish('openai', JSON.parse(msg.content), schema, {
    model: body.model,
    input_tokens: body.usage?.prompt_tokens,
    output_tokens: body.usage?.completion_tokens,
  });
}

function claudeCode({ system, user, schema }) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--system-prompt', system,
    '--tools', '',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--setting-sources', '',
  ];
  if (process.env.CLAUDE_CODE_MODEL) args.push('--model', process.env.CLAUDE_CODE_MODEL);

  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new Error(`Could not start Claude Code (\`claude\`): ${e.message}`)));
    child.on('close', (code) => {
      try {
        const body = JSON.parse(out);
        if (body.is_error || !body.structured_output) throw new Error(body.result || 'no structured output');
        const model = Object.keys(body.modelUsage || {})[0];
        resolve(finish('claude-code', body.structured_output, schema, {
          model,
          input_tokens: (body.usage?.input_tokens || 0) + (body.usage?.cache_creation_input_tokens || 0) + (body.usage?.cache_read_input_tokens || 0),
          output_tokens: body.usage?.output_tokens,
          cost_usd: body.total_cost_usd,
        }));
      } catch (e) {
        reject(new Error(`Claude Code call failed (exit ${code}): ${e.message}${err ? `\n${err.slice(0, 500)}` : ''}`));
      }
    });
    child.stdin.end(user);
  });
}

function demo({ schema, fixture }) {
  const file = path.join(PATHS.fixtures, fixture);
  if (!existsSync(file)) {
    throw new Error(`Demo mode has no recorded answer for this step (${fixture}). Demo covers the sample winner C014; for anything else set ANTHROPIC_API_KEY / OPENAI_API_KEY or install Claude Code.`);
  }
  return finish('demo', JSON.parse(readFileSync(file, 'utf8')), schema, { model: 'recorded', cost_usd: 0 });
}
export async function complete(providerName, prompt, fixture) {
  const provider = detectProvider(providerName);
  const result =
    provider === 'anthropic' ? await anthropic(prompt)
    : provider === 'openai' ? await openai(prompt)
    : provider === 'claude-code' ? await claudeCode(prompt)
    : demo({ schema: prompt.schema, fixture });
  if (process.env.AMB_RECORD_DIR && provider !== 'demo' && fixture) {
    const file = path.join(process.env.AMB_RECORD_DIR, fixture);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(result.data, null, 2) + '\n');
  }
  return result;
}
