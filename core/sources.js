import { inflateRawSync } from 'node:zlib';

function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid .docx file.');
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`The .docx has no ${wanted}.`);
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

const textOf = (xml) => decode(xml
  .replace(/<w:tab\/>/g, '\t')
  .replace(/<w:br\/>/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, ''));
export function readDocx(buffer) {
  let xml = unzipEntry(buffer, 'word/document.xml').toString('utf8');
  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    const rows = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
    const lines = rows.map((tr) => {
      const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((tc) => textOf(tc).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim());
      return `| ${cells.join(' | ')} |`;
    });
    const encode = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return lines.map((l) => `<w:p><w:t>${encode(l)}</w:t></w:p>`).join('');
  });
  return textOf(xml).replace(/\n{3,}/g, '\n\n').trim();
}
export async function fetchGoogleDoc(url) {
  const m = String(url).match(/^https:\/\/docs\.google\.com\/document\/d\/([\w-]{20,})/);
  if (!m) throw new Error('Paste a Google Docs link like https://docs.google.com/document/d/…');
  const res = await fetch(`https://docs.google.com/document/d/${m[1]}/export?format=docx`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) {
    throw new Error('Could not open the doc. In Google Docs: Share → General access → "Anyone with the link" (viewer), or paste the text instead.');
  }
  return readDocx(Buffer.from(await res.arrayBuffer()));
}
