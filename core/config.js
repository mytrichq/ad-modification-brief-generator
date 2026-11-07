import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DEFAULTS = {
  ltv: 68,
  targetRomi: 1.25,
  minSpend: 1000,
  minPurchases: 20,
  topicLifeDays: 35,
  mods: 10,
  similarityThreshold: 0.6,
  maxRules: 15,
  maxExamples: 3,
};
export const MOD_TYPES = ['hook', 'recut', 'revoice', 'ending', 'new_angle', 'new_creator'];
export const TYPE_WEIGHTS = { hook: 3, new_angle: 2, new_creator: 2, recut: 1, revoice: 1, ending: 1 };

export const FIELDS = ['visual', 'voiceover', 'on_screen_text'];

const workspace = process.env.AMB_WORKSPACE ? path.resolve(process.env.AMB_WORKSPACE) : path.join(ROOT, 'workspace');

export const PATHS = {
  csv: path.join(ROOT, 'data', 'ads.csv'),
  scripts: path.join(ROOT, 'data', 'scripts'),
  brand: path.join(ROOT, 'data', 'brand.json'),
  fixtures: path.join(ROOT, 'data', 'demo'),
  prompts: path.join(ROOT, 'core', 'prompts'),
  schemas: path.join(ROOT, 'core', 'schemas'),
  ui: path.join(ROOT, 'ui'),
  workspace,
  runs: path.join(workspace, 'runs'),
  feedback: path.join(workspace, 'feedback.jsonl'),
  rules: path.join(workspace, 'rules.md'),
  examples: path.join(workspace, 'examples'),
};
