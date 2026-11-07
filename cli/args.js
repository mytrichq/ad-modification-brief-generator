import { readFileSync } from 'node:fs';

const BOOL = new Set(['json', 'help', 'defer', 'all']);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (BOOL.has(k) || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) args[k] = true;
      else args[k] = argv[++i];
    } else if (a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

export const args = parseArgs(process.argv.slice(2));
export const [command, ...rest] = args._;

export const listArg = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : undefined);

export async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

export const readInput = async (file) => (file === '-' || !file ? readStdin() : readFileSync(file, 'utf8'));
