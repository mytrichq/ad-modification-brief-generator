import * as store from '../../core/store.js';
import { exportRun } from '../../core/export.js';
import { args, listArg } from '../args.js';
import { bold, yellow, plural, rel, out } from '../print.js';

export function exportBriefs() {
  const run = store.loadRun(args.run);
  const { files, notes, selection } = exportRun(run, { formats: listArg(args.format) || ['md', 'csv', 'html', 'pdf'], only: args.only || 'auto' });
  out({ files, notes }, () => [
    `${bold('Exported')} ${plural(selection.mods.length, 'modification')} (${selection.label}):`,
    ...Object.values(files).map((f) => `  ${rel(f)}`),
    ...notes.map((n) => yellow(`  ${n}`)),
  ].join('\n'));
}
