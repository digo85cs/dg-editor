const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DG_SKILLS = path.join(ROOT, '.dg-editor', 'skills');
const AGENTS_SKILLS = path.join(ROOT, '.agents', 'skills');

if (!fs.existsSync(AGENTS_SKILLS)) {
  fs.mkdirSync(AGENTS_SKILLS, { recursive: true });
}

if (!fs.existsSync(DG_SKILLS)) {
  console.log('[sincronizar-skills] .dg-editor/skills não encontrado.');
  process.exit(0);
}

const files = fs.readdirSync(DG_SKILLS).filter(f => f.endsWith('.md'));
let count = 0;

for (const file of files) {
  const id = path.basename(file, '.md');
  const content = fs.readFileSync(path.join(DG_SKILLS, file), 'utf8');

  let titulo = id;
  let gatilho = '';
  let corpo = content;

  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fm) {
    const meta = fm[1];
    corpo = fm[2].trim();
    const t = meta.match(/titulo:\s*(.+)/i);
    const g = meta.match(/gatilho:\s*(.+)/i);
    if (t) titulo = t[1].trim();
    if (g) gatilho = g[1].trim();
  }

  // Descrição limpa para o frontmatter
  const desc = gatilho ? `${titulo} (Gatilhos: ${gatilho})` : titulo;
  const skillDir = path.join(AGENTS_SKILLS, id);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const skillMdContent = `---
name: ${id}
description: ${desc}
---

${corpo}
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf8');
  count++;
}

console.log(`[sincronizar-skills] ${count} skills sincronizadas em .agents/skills/`);
