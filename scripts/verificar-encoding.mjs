import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FIX_BOM = process.argv.includes('--fix-nobom');
const exts = new Set(['.ts', '.js', '.mjs', '.cjs', '.css', '.html', '.json', '.md', '.ps1']);
const skipDirNames = new Set(['node_modules', '.git', 'dist', 'dist-app']);
const roots = [path.join(ROOT, 'src'), path.join(ROOT, 'scripts'), path.join(ROOT, 'out', 'renderer')];
const findings = [];
let scanned = 0;

function shouldSkipDir(full) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  if (rel === 'out/main' || rel.startsWith('out/main/')) return true;
  return false;
}

function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirNames.has(e.name)) continue;
      if (shouldSkipDir(full)) continue;
      walk(full);
    } else if (e.isFile()) {
      if (!exts.has(path.extname(e.name).toLowerCase())) continue;
      checkFile(full);
    }
  }
}

function isValidUtf8(buf) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}

function lineOf(text, idx, reason) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
  return { line, reason };
}

function findMojibake(text) {
  const hits = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\uFFFD') { hits.push(lineOf(text, i, 'U+FFFD (replacement char)')); break; }
  }
  for (let i = 0; i < text.length - 1; i++) {
    const c = text.charCodeAt(i), n = text.charCodeAt(i + 1);
    if (c === 0x00C3 && n >= 0x0080 && n <= 0x009F) {
      hits.push(lineOf(text, i, 'sequência mojibake (Ã + controle C1)'));
      break;
    }
  }
  const markers = ['\u00E2\u20AC', '\u00F0\u0178', '\u00C2\u00A0'];
  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx !== -1) { hits.push(lineOf(text, idx, 'padrão mojibake')); break; }
  }
  return hits;
}

function checkFile(full) {
  scanned++;
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  let buf;
  try { buf = fs.readFileSync(full); } catch (e) { findings.push(`${rel}:1: não foi possível ler (${e.message})`); return; }
  const hasBom = buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  if (hasBom) {
    if (FIX_BOM) {
      try { fs.writeFileSync(full, buf.slice(3)); console.log('  BOM removido: ' + rel); }
      catch (e) { findings.push(`${rel}:1: BOM presente e falha ao remover (${e.message})`); }
      return;
    }
    findings.push(`${rel}:1: BOM UTF-8 (EF BB BF) presente`);
  }
  const contentBuf = hasBom ? buf.slice(3) : buf;
  if (!isValidUtf8(contentBuf)) { findings.push(`${rel}:1: conteúdo não é UTF-8 válido`); return; }
  const text = contentBuf.toString('utf8');
  for (const h of findMojibake(text)) findings.push(`${rel}:${h.line}: ${h.reason}`);
}

for (const r of roots) if (fs.existsSync(r)) walk(r);

if (findings.length) {
  console.log(`verificar:encoding — ${findings.length} achado(s) em ${scanned} arquivo(s):`);
  for (const f of findings) console.log('  ' + f);
  process.exit(1);
} else {
  console.log(`verificar:encoding — 0 achados em ${scanned} arquivo(s) (UTF-8 sem BOM).`);
  process.exit(0);
}
